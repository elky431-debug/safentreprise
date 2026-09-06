-- Une boîte retirée de la surveillance doit cesser d'être surveillée
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI A ÉTÉ CONSTATÉ, EN ÉCRIVANT L'ÉCRAN D'ÉTAT. Une boîte que le client
-- décoche reste dans boites_surveillees avec actif = FALSE. Or actif = FALSE
-- veut déjà dire autre chose : « choisie, en attente de la vérification de
-- restriction ». Les deux situations étaient donc indiscernables, et trois
-- fonctions s'y trompaient :
--
--   1. boites_choisies_graph rendait la boîte retirée. Elle repartait alors
--      dans le FILTRE du script PowerShell : le périmètre Exchange continuait
--      d'autoriser Safentreprise sur une boîte que le client avait retirée.
--      C'est exactement la promesse du produit qui tombe.
--
--   2. marquer_restriction_verifiee réactivait TOUTES les boîtes du locataire,
--      « WHERE tenant_uid = ... » sans autre condition. La vérification
--      suivante remettait donc en service la boîte retirée.
--
--   3. enregistrer_notification_graph ne regardait pas boites_surveillees du
--      tout : elle ne vérifiait que l'abonnement. Les messages d'une boîte
--      retirée continuaient d'être mis en file, analysés, et de recevoir une
--      bannière.
--
-- L'écran de sélection avait le même défaut, par ricochet : il recochait la
-- boîte retirée à chaque retour du client.
--
-- CE QUI EST CORRIGÉ. Une colonne dit ce que le client VEUT ; actif continue
-- de dire ce que la vérification a AUTORISÉ. Les deux ne se confondent plus.
--
-- CE QUI N'EST PAS CORRIGÉ ICI, ET QUI EST DÉJÀ COUVERT. L'abonnement Graph
-- d'une boîte retirée n'est pas annulé chez Microsoft. Il n'est plus renouvelé
-- — abonnements_a_renouveler exige déjà b.actif — donc il expire de lui-même
-- sous sept jours. Pendant ce délai, c'est le point 3 ci-dessus qui protège :
-- les notifications sont refusées à l'entrée.

-- =============================================================================
-- 1. Ce que le client a choisi
-- =============================================================================

-- Valeur par défaut TRUE : les lignes existantes ont toutes été choisies à un
-- moment. Certaines ont pu être retirées depuis, et cette reprise les
-- réintègre à tort ; le premier appel à choisir_boites_graph rétablit la
-- vérité exacte, puisqu'il repose la colonne des deux côtés.
ALTER TABLE boites_surveillees
  ADD COLUMN IF NOT EXISTS choisie BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN boites_surveillees.choisie IS
  'Ce que le client veut surveiller. « actif » dit ce que la vérification de restriction a autorisé. Une boîte retirée garde sa ligne — pour son abonnement et son historique — mais choisie = FALSE.';

CREATE INDEX IF NOT EXISTS idx_boites_choisies
  ON boites_surveillees(tenant_uid) WHERE choisie;

-- =============================================================================
-- 2. Choisir, et retirer
-- =============================================================================

CREATE OR REPLACE FUNCTION public.choisir_boites_graph(
  p_tenant_uid UUID,
  p_boites JSONB
)
RETURNS TABLE (retenues INTEGER, retirees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_temoin TEXT;
  v_temoin_upn TEXT;
  v_retenues INTEGER := 0;
  v_retirees INTEGER := 0;
BEGIN
  SELECT t.company_id, t.temoin_graph_user_id, t.temoin_upn
    INTO v_company, v_temoin, v_temoin_upn
    FROM microsoft_tenants t
   WHERE t.id = p_tenant_uid AND t.company_id = get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Locataire inconnu ou n''appartenant pas à cette société.';
  END IF;

  IF p_boites IS NULL OR jsonb_array_length(p_boites) = 0 THEN
    RAISE EXCEPTION 'Aucune boîte sélectionnée.';
  END IF;

  -- La boîte témoin porte la preuve : la surveiller reviendrait à la faire
  -- entrer dans le périmètre, donc à perdre le seul moyen de vérifier.
  IF v_temoin IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_boites) e
        WHERE e ->> 'graph_user_id' = v_temoin
     ) THEN
    RAISE EXCEPTION
      'La boîte % sert à vérifier que l''accès est bien restreint : elle doit rester hors surveillance. Choisissez une autre boîte témoin d''abord.',
      COALESCE(v_temoin_upn, v_temoin);
  END IF;

  WITH entrantes AS (
    SELECT e ->> 'graph_user_id' AS graph_user_id, e ->> 'upn' AS upn
      FROM jsonb_array_elements(p_boites) e
     WHERE COALESCE(e ->> 'graph_user_id', '') <> ''
       AND COALESCE(e ->> 'upn', '') <> ''
  ),
  posees AS (
    INSERT INTO boites_surveillees
      (company_id, tenant_uid, graph_user_id, upn, actif, choisie)
    SELECT v_company, p_tenant_uid, n.graph_user_id, lower(n.upn), FALSE, TRUE
      FROM entrantes n
    ON CONFLICT (tenant_uid, graph_user_id) DO UPDATE
       SET upn = EXCLUDED.upn,
           -- Une boîte remise dans la sélection redevient choisie ; elle
           -- reste INACTIVE tant que la restriction n'a pas été reconstatée.
           choisie = TRUE
    RETURNING 1
  )
  SELECT count(*) INTO v_retenues FROM posees;

  -- Retirée : plus choisie, plus active, et sans preuve. Sa ligne demeure —
  -- son abonnement Graph et son historique y pendent — mais plus rien du
  -- schéma ne la traitera comme surveillée.
  UPDATE boites_surveillees b
     SET choisie = FALSE, actif = FALSE, restriction_verifiee_at = NULL
   WHERE b.tenant_uid = p_tenant_uid
     AND b.choisie
     AND b.graph_user_id NOT IN (
       SELECT e ->> 'graph_user_id' FROM jsonb_array_elements(p_boites) e
     );
  GET DIAGNOSTICS v_retirees = ROW_COUNT;

  -- Le périmètre a changé : la preuve d'hier ne prouve plus celui d'aujourd'hui.
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = NULL, restriction_preuve = NULL
   WHERE id = p_tenant_uid;

  RETURN QUERY SELECT v_retenues, v_retirees;
END;
$$;

REVOKE ALL ON FUNCTION public.choisir_boites_graph(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choisir_boites_graph(UUID, JSONB)
  TO authenticated, service_role;

-- =============================================================================
-- 3. Ce que le client voit, et ce qui entre dans le script PowerShell
-- =============================================================================

-- ⚠ C'EST LA CORRECTION LA PLUS IMPORTANTE DE CETTE MIGRATION. Cette fonction
--   alimente le filtre du script de restriction. Y laisser une boîte retirée
--   revenait à écrire son adresse dans le périmètre Exchange, c'est-à-dire à
--   autoriser durablement ce que le client venait d'interdire.
CREATE OR REPLACE FUNCTION public.boites_choisies_graph(p_tenant_uid UUID)
RETURNS TABLE (graph_user_id TEXT, upn TEXT, actif BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.graph_user_id, b.upn, b.actif, b.created_at
    FROM boites_surveillees b
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE b.tenant_uid = p_tenant_uid
     AND b.choisie
     AND t.company_id = get_my_company_id()
   ORDER BY b.upn;
$$;

REVOKE ALL ON FUNCTION public.boites_choisies_graph(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boites_choisies_graph(UUID)
  TO authenticated, service_role;

-- =============================================================================
-- 4. La vérification n'active que ce qui est choisi
-- =============================================================================

DROP FUNCTION IF EXISTS public.marquer_restriction_verifiee(UUID, TEXT);

CREATE FUNCTION public.marquer_restriction_verifiee(
  p_tenant_uid UUID,
  p_preuve TEXT
)
RETURNS TABLE (boites_activees INTEGER, boites_verifiees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activees INTEGER;
  v_verifiees INTEGER;
BEGIN
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = now(),
         restriction_preuve = left(p_preuve, 500),
         raccorde_at = COALESCE(raccorde_at, now())
   WHERE id = p_tenant_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;

  SELECT count(*) INTO v_activees
    FROM boites_surveillees
   WHERE tenant_uid = p_tenant_uid AND choisie AND NOT actif;

  -- ⚠ « AND choisie ». Sans cette condition, la vérification réactivait toutes
  --   les lignes du locataire, y compris celles que le client venait de
  --   retirer : une boîte décochée revenait sous surveillance au contrôle
  --   suivant, sans que personne ne l'ait demandé.
  UPDATE boites_surveillees
     SET actif = TRUE, restriction_verifiee_at = now()
   WHERE tenant_uid = p_tenant_uid AND choisie;
  GET DIAGNOSTICS v_verifiees = ROW_COUNT;

  RETURN QUERY SELECT v_activees, v_verifiees;
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 5. Une notification qui vise une boîte non surveillée est refusée
-- =============================================================================

-- ⚠ LE DERNIER VERROU, ET LE PLUS PROCHE DU MAL. L'abonnement Graph d'une
--   boîte retirée survit jusqu'à son expiration : Microsoft continue de nous
--   notifier. Sans cette condition, ces messages étaient mis en file, lus,
--   analysés, et pouvaient recevoir une bannière — dans une boîte que le
--   client avait explicitement retirée de la surveillance.
--
--   On refuse à l'entrée, comme pour un abonnement inconnu, et sans dire
--   pourquoi : le point d'entrée est public.
CREATE OR REPLACE FUNCTION public.enregistrer_notification_graph(
  p_subscription_id TEXT,
  p_client_state TEXT,
  p_message_id TEXT,
  p_resource TEXT DEFAULT NULL,
  p_change_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  abonnement RECORD;
  ligne_id UUID;
BEGIN
  IF p_subscription_id IS NULL OR p_client_state IS NULL OR p_message_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.id, a.company_id, a.boite_id, a.client_state,
         b.actif AND b.choisie AS surveillee
    INTO abonnement
    FROM graph_abonnements a
    JOIN boites_surveillees b ON b.id = a.boite_id
   WHERE a.subscription_id = p_subscription_id
     AND a.statut = 'actif'
   LIMIT 1;

  -- Abonnement inconnu, secret qui ne correspond pas, ou boîte qui n'est plus
  -- surveillée : on ne dit pas lequel des trois, et on n'enregistre rien.
  IF abonnement.id IS NULL
     OR abonnement.client_state <> p_client_state
     OR NOT abonnement.surveillee THEN
    RETURN NULL;
  END IF;

  INSERT INTO graph_file_attente (
    company_id, boite_id, abonnement_id, message_id,
    resource_brut, change_type, origine
  )
  VALUES (
    abonnement.company_id, abonnement.boite_id, abonnement.id, p_message_id,
    left(p_resource, 500), left(p_change_type, 40), 'webhook'
  )
  ON CONFLICT (company_id, message_id) DO UPDATE
    SET recu_at = graph_file_attente.recu_at
  RETURNING id INTO ligne_id;

  RETURN ligne_id;
END;
$$;

COMMENT ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Vérifie le clientState d''un abonnement Graph, s''assure que la boîte est encore surveillée, et met le message en file. Renvoie NULL sinon.';

-- ⚠ ON REPOSE EXACTEMENT LES DROITS D'ORIGINE, ET SURTOUT PAS DES DROITS PLUS
--   STRICTS. Le point d'entrée des notifications n'a pas de clé de service :
--   Microsoft appelle une adresse publique, et c'est le clientState qui fait
--   authentification. La route webhook s'adresse à Supabase avec la clé
--   ANONYME. Retirer anon d'ici arrêterait toute l'analyse, sans erreur
--   visible ailleurs que dans les journaux.
REVOKE ALL ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;
