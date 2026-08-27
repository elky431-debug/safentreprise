-- Renouvellement, cycle de vie et rattrapage delta
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : plus rien à lancer à la main. Un mail arrive, la bannière apparaît.
--
-- TROIS FILETS, du plus rapide au plus sûr :
--
--   1. La notification temps réel. Rapide, mais Microsoft la jette au bout de
--      4 h de tentatives, et jette tout pendant 10 minutes si notre point
--      d'entrée répond trop lentement.
--   2. Les notifications de cycle de vie. Microsoft nous prévient quand un
--      abonnement meurt ou quand il a sauté des notifications.
--   3. Le rattrapage delta. Le seul filet qui ne dépend de rien : il compare
--      ce que la boîte contient à ce qu'on a déjà vu. Sans lui, une panne de
--      quelques heures = des mails frauduleux jamais analysés.

-- =============================================================================
-- 1. Abonnements : cycle de vie
-- =============================================================================

ALTER TABLE graph_abonnements
  ADD COLUMN IF NOT EXISTS lifecycle_url TEXT,
  ADD COLUMN IF NOT EXISTS dernier_evenement TEXT,
  ADD COLUMN IF NOT EXISTS dernier_evenement_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renouvele_at TIMESTAMPTZ;

-- « perdu » : Microsoft a supprimé l'abonnement de son côté. Il faut en
-- recréer un, et rattraper ce qu'on a manqué entre-temps.
ALTER TABLE graph_abonnements
  DROP CONSTRAINT IF EXISTS graph_abonnements_statut_check;
ALTER TABLE graph_abonnements
  ADD CONSTRAINT graph_abonnements_statut_check
  CHECK (statut IN ('actif', 'expire', 'supprime', 'erreur', 'perdu'));

-- =============================================================================
-- 2. Ce qu'il faut renouveler
-- =============================================================================

-- Un abonnement à des messages Outlook vit au plus 10 080 minutes, soit un
-- peu moins de 7 jours. On renouvelle bien avant : le coût d'un renouvellement
-- inutile est nul, celui d'un abonnement expiré est une boîte non surveillée.
CREATE OR REPLACE FUNCTION public.abonnements_a_renouveler(
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
  tentatives INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.subscription_id, a.company_id, a.boite_id,
         t.tenant_id, b.graph_user_id, b.upn, a.expire_at, a.statut,
         a.tentatives_renouvellement
    FROM graph_abonnements a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE t.statut = 'actif'
     AND b.actif
     AND a.statut IN ('actif', 'perdu', 'erreur')
     AND (
       -- Expire bientôt, ou déjà expiré.
       a.expire_at < now() + make_interval(hours => GREATEST(1, p_marge_heures))
       -- Ou Microsoft nous a dit qu'il n'existe plus.
       OR a.statut = 'perdu'
     )
     -- On n'insiste pas indéfiniment sur un abonnement qui refuse de revivre.
     AND a.tentatives_renouvellement < 10
   ORDER BY a.expire_at
   LIMIT 50;
$$;

-- =============================================================================
-- 3. Résultat d'un renouvellement
-- =============================================================================

-- ⚠ p_client_state N'EST PAS FACULTATIF QUAND ON RECRÉE. Un abonnement
--   recréé porte un nouveau secret partagé ; garder l'ancien en base ferait
--   refuser toutes les notifications suivantes, silencieusement, et la boîte
--   ne serait plus surveillée sans que rien ne le signale.
CREATE OR REPLACE FUNCTION public.maj_abonnement_graph(
  p_abonnement_id UUID,
  p_subscription_id TEXT,
  p_expire_at TIMESTAMPTZ,
  p_statut TEXT,
  p_erreur TEXT DEFAULT NULL,
  p_client_state TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_abonnements
     SET subscription_id = COALESCE(p_subscription_id, subscription_id),
         client_state = COALESCE(p_client_state, client_state),
         expire_at = COALESCE(p_expire_at, expire_at),
         statut = p_statut,
         derniere_erreur = p_erreur,
         renouvele_at = CASE WHEN p_statut = 'actif' THEN now() ELSE renouvele_at END,
         -- Un succès remet le compteur à zéro ; un échec l'incrémente.
         tentatives_renouvellement = CASE
           WHEN p_statut = 'actif' THEN 0
           ELSE tentatives_renouvellement + 1
         END,
         updated_at = now()
   WHERE id = p_abonnement_id;
$$;

-- =============================================================================
-- 4. Notification de cycle de vie
-- =============================================================================

-- Microsoft envoie trois événements :
--
--   reauthorizationRequired — il faut réautoriser l'abonnement.
--   subscriptionRemoved     — il a été supprimé, il faut en recréer un.
--   missed                  — des notifications ont été perdues, il faut
--                             rattraper par delta.
--
-- Comme pour les notifications ordinaires, le clientState est la SEULE
-- authentification : Graph ne signe pas ces charges utiles. On le vérifie ici,
-- et on marque l'abonnement dans le même aller-retour.
CREATE OR REPLACE FUNCTION public.enregistrer_evenement_cycle_vie(
  p_subscription_id TEXT,
  p_client_state TEXT,
  p_evenement TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abonnement RECORD;
BEGIN
  SELECT a.id, a.boite_id INTO v_abonnement
    FROM graph_abonnements a
   WHERE a.subscription_id = p_subscription_id
     AND a.client_state = p_client_state
   LIMIT 1;

  IF v_abonnement.id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE graph_abonnements
     SET dernier_evenement = left(p_evenement, 60),
         dernier_evenement_at = now(),
         statut = CASE
           -- Supprimé chez Microsoft : à recréer, pas à renouveler.
           WHEN p_evenement = 'subscriptionRemoved' THEN 'perdu'
           WHEN p_evenement = 'reauthorizationRequired' THEN 'actif'
           ELSE statut
         END,
         updated_at = now()
   WHERE id = v_abonnement.id;

  -- « missed » et « subscriptionRemoved » veulent dire qu'on a perdu des
  -- messages : on force un rattrapage delta au prochain passage.
  IF p_evenement IN ('missed', 'subscriptionRemoved') THEN
    UPDATE boites_surveillees
       SET rattrapage_demande_at = now()
     WHERE id = v_abonnement.boite_id;
  END IF;

  RETURN true;
END;
$$;

-- =============================================================================
-- 5. Rattrapage delta
-- =============================================================================

ALTER TABLE boites_surveillees
  ADD COLUMN IF NOT EXISTS rattrapage_demande_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rattrapage_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delta_erreur TEXT;

-- Boîtes à rattraper : celles qu'on n'a pas vues depuis un moment, et celles
-- pour lesquelles Microsoft a signalé une perte.
CREATE OR REPLACE FUNCTION public.boites_a_rattraper(
  p_interval_minutes INTEGER DEFAULT 15,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
  boite_id UUID,
  company_id UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  delta_link TEXT,
  urgent BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.company_id, t.tenant_id, b.graph_user_id, b.upn, b.delta_link,
         b.rattrapage_demande_at IS NOT NULL
    FROM boites_surveillees b
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE t.statut = 'actif'
     AND b.actif
     AND (
       b.rattrapage_demande_at IS NOT NULL
       OR b.rattrapage_at IS NULL
       OR b.rattrapage_at < now() - make_interval(mins => GREATEST(1, p_interval_minutes))
     )
   ORDER BY b.rattrapage_demande_at NULLS LAST, b.rattrapage_at NULLS FIRST
   LIMIT GREATEST(1, LEAST(p_limite, 50));
$$;

CREATE OR REPLACE FUNCTION public.maj_delta_boite(
  p_boite_id UUID,
  p_delta_link TEXT,
  p_erreur TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE boites_surveillees
     SET delta_link = COALESCE(p_delta_link, delta_link),
         delta_maj_at = CASE WHEN p_delta_link IS NOT NULL THEN now() ELSE delta_maj_at END,
         rattrapage_at = now(),
         -- La demande explicite est honorée : on l'efface.
         rattrapage_demande_at = NULL,
         delta_erreur = p_erreur
   WHERE id = p_boite_id;
$$;

-- Met en file un message repéré par le delta.
--
-- Même clé d'idempotence que le webhook : (company_id, message_id). Un message
-- déjà vu en temps réel n'est pas retraité, et un message déjà analysé non
-- plus — c'est ce qui permet de lancer le rattrapage sans crainte.
CREATE OR REPLACE FUNCTION public.enregistrer_message_delta(
  p_boite_id UUID,
  p_message_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boite RECORD;
  v_id UUID;
BEGIN
  SELECT b.id, b.company_id INTO v_boite
    FROM boites_surveillees b WHERE b.id = p_boite_id AND b.actif LIMIT 1;
  IF v_boite.id IS NULL THEN RETURN false; END IF;

  -- Déjà analysé : inutile de le remettre en file.
  IF EXISTS (
    SELECT 1 FROM graph_analyses
     WHERE company_id = v_boite.company_id AND message_id = p_message_id
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO graph_file_attente (company_id, boite_id, message_id, origine)
  VALUES (v_boite.company_id, p_boite_id, p_message_id, 'delta')
  ON CONFLICT (company_id, message_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

-- =============================================================================
-- 6. Droits
-- =============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'abonnements_a_renouveler(INTEGER)',
    'maj_abonnement_graph(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT)',
    'boites_a_rattraper(INTEGER, INTEGER)',
    'maj_delta_boite(UUID, TEXT, TEXT)',
    'enregistrer_message_delta(UUID, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Celle-ci est appelée par le webhook, qui n'a que la clé anonyme — comme
-- enregistrer_notification_graph. Elle vérifie le clientState elle-même.
REVOKE ALL ON FUNCTION public.enregistrer_evenement_cycle_vie(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_evenement_cycle_vie(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 7. Vérification
-- =============================================================================

--   SELECT subscription_id, statut, expire_at,
--          expire_at - now() AS reste,
--          dernier_evenement, tentatives_renouvellement
--     FROM graph_abonnements ORDER BY expire_at;
--
--   SELECT upn, delta_link IS NOT NULL AS delta_amorce,
--          rattrapage_at, rattrapage_demande_at, delta_erreur
--     FROM boites_surveillees WHERE actif;
