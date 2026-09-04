-- Étape 7 : abonner les boîtes vérifiées, et amorcer l'annuaire
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- Il manquait la dernière pièce du raccordement autonome. Créer une ligne
-- d'abonnement n'était possible que par scripts/graph-abonner.mjs, en SQL
-- direct depuis le poste de l'éditeur — donc pour un seul client, le sien.
--
-- ⚠ RIEN ICI N'ACTIVE UNE BOÎTE. L'activation reste le monopole de
--   marquer_restriction_verifiee(). Ces fonctions ne travaillent QUE sur des
--   boîtes déjà actives, c'est-à-dire déjà couvertes par une restriction
--   constatée. Une boîte choisie mais non vérifiée n'est pas abonnée, et donc
--   Microsoft ne notifie rien à son sujet.

-- =============================================================================
-- 1. Ce qu'il reste à abonner
-- =============================================================================

-- Une boîte active, dont la restriction a été constatée, et qui n'a pas
-- d'abonnement vivant. Le filtre sur restriction_verifiee_at est redondant
-- avec b.actif — les deux sont posés ensemble — mais un garde-fou qui coûte
-- une condition vaut mieux qu'une invariante qu'on suppose tenue.
CREATE OR REPLACE FUNCTION public.boites_a_abonner(
  p_tenant_uid UUID DEFAULT NULL,
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
  boite_id UUID,
  company_id UUID,
  tenant_uid UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.company_id, b.tenant_uid, t.tenant_id, b.graph_user_id, b.upn
    FROM boites_surveillees b
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE b.actif
     AND b.restriction_verifiee_at IS NOT NULL
     AND t.statut = 'actif'
     AND (p_tenant_uid IS NULL OR b.tenant_uid = p_tenant_uid)
     AND NOT EXISTS (
       SELECT 1 FROM graph_abonnements a
        WHERE a.boite_id = b.id
          AND a.statut IN ('actif', 'erreur')
          AND a.expire_at > now()
     )
   ORDER BY b.upn
   LIMIT GREATEST(1, LEAST(p_limite, 200));
$$;

REVOKE ALL ON FUNCTION public.boites_a_abonner(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boites_a_abonner(UUID, INTEGER) TO service_role;

-- =============================================================================
-- 2. Enregistrer un abonnement qui vient d'être créé chez Microsoft
-- =============================================================================

-- ⚠ Le clientState est le secret partagé qui authentifie les notifications.
--   Une ligne remplacée doit porter le NOUVEAU, sinon le webhook refuserait
--   silencieusement tout ce que Microsoft enverrait — et la boîte cesserait
--   d'être surveillée sans que rien ne le dise. C'est exactement la panne
--   qu'on a déjà connue une fois.
CREATE OR REPLACE FUNCTION public.enregistrer_abonnement_graph(
  p_boite_id UUID,
  p_subscription_id TEXT,
  p_resource TEXT,
  p_client_state TEXT,
  p_expire_at TIMESTAMPTZ,
  p_notification_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_id UUID;
BEGIN
  SELECT company_id INTO v_company FROM boites_surveillees WHERE id = p_boite_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Boîte % inconnue.', p_boite_id;
  END IF;

  -- Les anciens abonnements de cette boîte sortent du jeu : ils ne seront ni
  -- renouvelés, ni comptés comme vivants. On ne les supprime pas, pour garder
  -- la trace de ce qui a existé.
  UPDATE graph_abonnements
     SET statut = 'supprime', updated_at = now()
   WHERE boite_id = p_boite_id AND statut <> 'supprime';

  INSERT INTO graph_abonnements
    (company_id, boite_id, subscription_id, resource, client_state, expire_at,
     statut, notification_url)
  VALUES
    (v_company, p_boite_id, p_subscription_id, p_resource, p_client_state,
     p_expire_at, 'actif', p_notification_url)
  ON CONFLICT (subscription_id) DO UPDATE
     SET boite_id = EXCLUDED.boite_id,
         client_state = EXCLUDED.client_state,
         expire_at = EXCLUDED.expire_at,
         notification_url = EXCLUDED.notification_url,
         statut = 'actif',
         derniere_erreur = NULL,
         tentatives_renouvellement = 0,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_abonnement_graph(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_abonnement_graph(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;

-- =============================================================================
-- 3. L'annuaire vieillit en silence — il faut le rafraîchir
-- =============================================================================

-- CONSTAT. L'annuaire n'était rafraîchi que par scripts/graph-annuaire.mjs,
-- lancé à la main. Chez un client, l'organigramme se périmerait sans que rien
-- ne le signale — et c'est lui qui alimente la détection d'usurpation : un
-- dirigeant recruté après le raccordement ne serait jamais reconnu.
CREATE OR REPLACE FUNCTION public.tenants_a_rafraichir(
  p_age_heures INTEGER DEFAULT 24,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (tenant_uid UUID, tenant_id TEXT, company_id UUID, personnes BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.tenant_id, t.company_id,
         (SELECT count(*) FROM annuaire_personnes a WHERE a.tenant_uid = t.id)
    FROM microsoft_tenants t
   WHERE t.statut = 'actif'
     AND EXISTS (SELECT 1 FROM boites_surveillees b
                  WHERE b.tenant_uid = t.id AND b.actif)
     AND COALESCE(
           (SELECT max(a.maj_at) FROM annuaire_personnes a WHERE a.tenant_uid = t.id),
           '-infinity'::TIMESTAMPTZ
         ) < now() - make_interval(hours => GREATEST(1, p_age_heures))
   ORDER BY COALESCE(
     (SELECT max(a.maj_at) FROM annuaire_personnes a WHERE a.tenant_uid = t.id),
     '-infinity'::TIMESTAMPTZ
   )
   LIMIT GREATEST(1, LEAST(p_limite, 50));
$$;

REVOKE ALL ON FUNCTION public.tenants_a_rafraichir(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenants_a_rafraichir(INTEGER, INTEGER) TO service_role;

-- =============================================================================
-- 4. Vérification
-- =============================================================================

--   SELECT upn FROM boites_a_abonner(NULL, 50);
--
-- Vide veut dire : toutes les boîtes vérifiées ont un abonnement vivant.
-- Une boîte choisie mais NON vérifiée n'y figure pas — c'est voulu.
--
--   SELECT tenant_id, personnes FROM tenants_a_rafraichir(24, 10);
--
-- Un locataire qui y reste d'un jour sur l'autre est un annuaire qui ne se
-- met plus à jour.
