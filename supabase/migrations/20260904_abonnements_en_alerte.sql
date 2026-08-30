-- Voir venir la mort d'un abonnement
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI S'EST PASSÉ. Un abonnement a échoué DIX FOIS à se renouveler, avec
-- toujours la même cause — « GRAPH_NOTIFICATION_URL absent » — puis a été
-- abandonné, sans que rien ne le signale. La surveillance de la boîte s'est
-- arrêtée en silence.
--
-- alertes_sans_banniere rend visible une alerte sans avertissement. Il manquait
-- l'équivalent pour l'infrastructure : un abonnement mort ne produit aucune
-- alerte du tout, donc rien ne manque nulle part. C'est la panne la plus grave
-- possible — le produit ne voit plus rien — et c'était la plus discrète.

-- =============================================================================
-- 1. Garder trace de l'URL réellement utilisée
-- =============================================================================

-- Sans cette colonne, il est impossible de savoir à quelle adresse Microsoft
-- envoie les notifications d'un abonnement existant, autrement qu'en
-- interrogeant Graph.
ALTER TABLE graph_abonnements
  ADD COLUMN IF NOT EXISTS notification_url TEXT;

-- =============================================================================
-- 2. LA VUE À CONSULTER
-- =============================================================================

CREATE OR REPLACE VIEW public.abonnements_en_alerte
WITH (security_invoker = true) AS
  SELECT a.company_id,
         b.upn,
         a.subscription_id,
         a.statut,
         a.expire_at,
         a.expire_at - now() AS reste,
         a.tentatives_renouvellement,
         a.derniere_erreur,
         a.dernier_evenement,
         a.renouvele_at,
         a.notification_url,
         CASE
           WHEN a.statut = 'perdu' THEN
             'SUPPRIMÉ CHEZ MICROSOFT — à recréer. ' ||
             COALESCE(a.derniere_erreur, '')
           WHEN a.tentatives_renouvellement >= 10 THEN
             'ABANDONNÉ après ' || a.tentatives_renouvellement ||
             ' échecs — la boîte n''est plus surveillée. ' ||
             COALESCE(a.derniere_erreur, 'sans détail')
           WHEN a.expire_at < now() THEN
             'EXPIRÉ depuis ' || age(now(), a.expire_at) ||
             ' — la boîte n''est plus surveillée.'
           WHEN a.statut = 'erreur' THEN
             'En erreur (tentative ' || a.tentatives_renouvellement || '/10) — ' ||
             COALESCE(a.derniere_erreur, 'sans détail')
           WHEN a.tentatives_renouvellement > 0 THEN
             'Renouvellement en échec (' || a.tentatives_renouvellement ||
             '/10) — ' || COALESCE(a.derniere_erreur, 'sans détail')
           WHEN a.expire_at < now() + INTERVAL '48 hours' THEN
             'Expire dans ' || age(a.expire_at, now()) ||
             ' et n''a pas encore été renouvelé.'
           ELSE 'À surveiller'
         END AS motif
    FROM graph_abonnements a
    JOIN boites_surveillees b ON b.id = a.boite_id
   WHERE a.statut <> 'supprime'
     AND (
       a.statut <> 'actif'
       OR a.tentatives_renouvellement > 0
       OR a.derniere_erreur IS NOT NULL
       -- La maintenance renouvelle 24 h avant l'échéance. Si à 48 h ce n'est
       -- toujours pas fait, quelque chose ne tourne pas rond.
       OR a.expire_at < now() + INTERVAL '48 hours'
     );

COMMENT ON VIEW public.abonnements_en_alerte IS
  'Abonnements morts, en erreur, ou proches de l''expiration. Doit rester vide.';

GRANT SELECT ON public.abonnements_en_alerte TO authenticated, service_role;

-- =============================================================================
-- 3. Rendre l'URL disponible au renouvellement
-- =============================================================================

-- La meilleure adresse de notification pour recréer un abonnement, c'est celle
-- que l'abonnement utilisait quand il fonctionnait. On la remonte donc au
-- code, qui s'en sert avant toute variable d'environnement.
--
-- Le type de retour change : il faut supprimer avant de recréer.
DROP FUNCTION IF EXISTS public.abonnements_a_renouveler(INTEGER);

CREATE FUNCTION public.abonnements_a_renouveler(
  p_marge_heures INTEGER DEFAULT 24
)
RETURNS TABLE (
  abonnement_id UUID,
  subscription_id TEXT,
  company_id UUID,
  boite_id UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  expire_at TIMESTAMPTZ,
  statut TEXT,
  tentatives INTEGER,
  notification_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.subscription_id, a.company_id, a.boite_id,
         t.tenant_id, b.graph_user_id, b.upn, a.expire_at, a.statut,
         a.tentatives_renouvellement, a.notification_url
    FROM graph_abonnements a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE t.statut = 'actif'
     AND b.actif
     AND a.statut IN ('actif', 'perdu', 'erreur')
     AND (
       a.expire_at < now() + make_interval(hours => GREATEST(1, p_marge_heures))
       OR a.statut = 'perdu'
     )
     -- On n'insiste pas indéfiniment sur un abonnement qui refuse de revivre.
     -- Au-delà, il faut relancer_abonnement_graph() — c'est-à-dire un humain
     -- qui a corrigé la cause.
     AND a.tentatives_renouvellement < 10
   ORDER BY a.expire_at
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.abonnements_a_renouveler(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abonnements_a_renouveler(INTEGER) TO service_role;

-- Remettre le compteur à zéro sur un abonnement abandonné, une fois la cause
-- corrigée. Volontairement manuel : réarmer tout seul referait dix appels
-- inutiles à chaque passage, et masquerait la panne au lieu de la montrer.
--
-- Un abonnement déjà expiré n'existe plus chez Microsoft : on le marque
-- « perdu » pour que le renouvellement le RECRÉE au lieu de le prolonger.
CREATE OR REPLACE FUNCTION public.relancer_abonnement_graph(
  p_abonnement_id UUID DEFAULT NULL
)
RETURNS TABLE (upn TEXT, statut TEXT, tentatives INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH maj AS (
    UPDATE graph_abonnements a
       SET tentatives_renouvellement = 0,
           statut = CASE WHEN a.expire_at < now() THEN 'perdu' ELSE a.statut END,
           derniere_erreur = NULL,
           updated_at = now()
     WHERE (p_abonnement_id IS NULL OR a.id = p_abonnement_id)
       AND a.statut <> 'supprime'
       AND (a.tentatives_renouvellement > 0 OR a.derniere_erreur IS NOT NULL)
    RETURNING a.boite_id, a.statut, a.tentatives_renouvellement
  )
  SELECT b.upn, maj.statut, maj.tentatives_renouvellement
    FROM maj JOIN boites_surveillees b ON b.id = maj.boite_id;
$$;

REVOKE ALL ON FUNCTION public.relancer_abonnement_graph(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relancer_abonnement_graph(UUID) TO service_role;

-- =============================================================================
-- 4. Compter — pour le diagnostic du worker
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compter_abonnements_en_alerte()
RETURNS TABLE (
  total BIGINT,
  morts BIGINT,
  expire_bientot BIGINT,
  prochaine_expiration TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         count(*) FILTER (
           WHERE statut IN ('perdu', 'expire')
              OR tentatives_renouvellement >= 10
              OR expire_at < now()
         ),
         count(*) FILTER (
           WHERE expire_at >= now() AND expire_at < now() + INTERVAL '48 hours'
         ),
         min(expire_at)
    FROM graph_abonnements
   WHERE statut <> 'supprime';
$$;

REVOKE ALL ON FUNCTION public.compter_abonnements_en_alerte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compter_abonnements_en_alerte() TO service_role;

-- =============================================================================
-- 5. Enregistrer l'URL au renouvellement
-- =============================================================================

CREATE OR REPLACE FUNCTION public.maj_abonnement_graph(
  p_abonnement_id UUID,
  p_subscription_id TEXT,
  p_expire_at TIMESTAMPTZ,
  p_statut TEXT,
  p_erreur TEXT DEFAULT NULL,
  p_client_state TEXT DEFAULT NULL,
  p_notification_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_abonnements
     SET subscription_id = COALESCE(p_subscription_id, subscription_id),
         client_state = COALESCE(p_client_state, client_state),
         notification_url = COALESCE(p_notification_url, notification_url),
         expire_at = COALESCE(p_expire_at, expire_at),
         statut = p_statut,
         derniere_erreur = p_erreur,
         renouvele_at = CASE WHEN p_statut = 'actif' THEN now() ELSE renouvele_at END,
         tentatives_renouvellement = CASE
           WHEN p_statut = 'actif' THEN 0
           ELSE tentatives_renouvellement + 1
         END,
         updated_at = now()
   WHERE id = p_abonnement_id;
$$;

-- Comme pour marquer_action_graph : toute signature qui n'est pas la version
-- courante doit disparaître, sinon un appel partiel deviendrait ambigu et
-- Postgres refuserait de trancher.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'maj_abonnement_graph'
       AND p.pronargs <> 7
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.signature);
    RAISE NOTICE 'Ancienne signature supprimée : %', r.signature;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.maj_abonnement_graph(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maj_abonnement_graph(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

--   SELECT upn, statut, reste, tentatives_renouvellement, motif
--     FROM abonnements_en_alerte ORDER BY expire_at;
--
-- Elle doit être VIDE. Une seule ligne veut dire qu'une boîte va cesser
-- d'être surveillée, ou l'est déjà.
--
--   SELECT * FROM compter_abonnements_en_alerte();
--
-- Un abonnement abandonné (10 échecs) est SORTI de la file de renouvellement :
-- il n'y reviendra pas tout seul, même la cause corrigée. Une fois la cause
-- corrigée, le réarmer :
--
--   SELECT * FROM relancer_abonnement_graph();   -- tous
--   SELECT * FROM relancer_abonnement_graph('<abonnement_id>');
