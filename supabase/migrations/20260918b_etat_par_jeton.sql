-- Lot 2 du parcours de raccordement : l'état, lisible depuis un jeton.
-- Appliquer via : npm run db:apply — ou le SQL Editor Supabase.
--
-- Référence : docs/PARCOURS-RACCORDEMENT.md
--
-- ⚠ ENCORE UNE FONCTION NOUVELLE, ENCORE RIEN DE MODIFIÉ. Même principe que le
--   lot 1 : la rétrocompatibilité par construction plutôt que par relecture.
--   `lire_jeton_raccordement` n'est pas touchée — on ajoute à côté plutôt que
--   d'en changer le type de retour, ce qui aurait exigé un DROP puis un
--   CREATE, donc une fenêtre pendant laquelle la fonction n'existe pas.
--
-- ⚠ POURQUOI UNE SECONDE FONCTION PLUTÔT QU'UN CHAMP EN PLUS. `lire_jeton`
--   répond à « ce lien est-il valable, et pour qui ». Celle-ci répond à « où
--   en est le raccordement ». La première est appelée une fois au chargement,
--   la seconde après chaque action — les mélanger ferait redater l'ouverture
--   du lien à chaque rafraîchissement, et l'alerte des 48 h ne partirait
--   jamais.
--
-- Cette migration est idempotente.

CREATE OR REPLACE FUNCTION public.etat_raccordement_par_jeton(p_jeton TEXT)
RETURNS TABLE (
  accord_donne BOOLEAN,
  tenant_id TEXT,
  statut TEXT,
  restriction_verifiee_at TIMESTAMPTZ,
  boites_choisies INTEGER,
  boites_actives INTEGER,
  temoin_upn TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_tenant RECORD;
BEGIN
  SELECT j.company_id INTO v_company
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton
     AND j.revoque_at IS NULL
     AND j.termine_at IS NULL
     AND j.expire_at > now();

  -- ⚠ UN JETON INVALIDE NE LÈVE PAS D'EXCEPTION ICI, IL REND UNE LIGNE VIDE.
  --   Cette fonction est appelée en boucle pendant que l'informaticien
  --   travaille ; une exception à chaque appel après l'expiration remplirait
  --   les journaux d'erreurs qui ne sont pas des erreurs. C'est la page qui
  --   décide quoi afficher, et elle a déjà `lire_jeton_raccordement` pour ça.
  IF v_company IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
                        0, 0, NULL::TEXT;
    RETURN;
  END IF;

  SELECT t.tenant_id, t.statut, t.id
    INTO v_tenant
    FROM microsoft_tenants t
   WHERE t.company_id = v_company
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
                        0, 0, NULL::TEXT;
    RETURN;
  END IF;

  -- ⚠ LE `tenant_id` EST RENDU, ET C'EST VOULU : l'informaticien doit pouvoir
  --   vérifier qu'il travaille sur le bon locataire avant de donner un accord.
  --   C'est un GUID public de son propre annuaire, pas un secret.
  RETURN QUERY
    SELECT
      true,
      v_tenant.tenant_id,
      v_tenant.statut,
      (SELECT max(b.restriction_verifiee_at) FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.choisie),
      (SELECT count(*)::INTEGER FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.choisie),
      (SELECT count(*)::INTEGER FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.actif),
      (SELECT b.upn FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND NOT b.choisie
        ORDER BY b.created_at LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION public.etat_raccordement_par_jeton(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etat_raccordement_par_jeton(TEXT)
  TO anon, authenticated, service_role;

-- =============================================================================
-- Choisir les boîtes depuis un jeton
-- =============================================================================
--
-- ⚠ CETTE FONCTION DUPLIQUE LE CORPS DE `choisir_boites_graph`, ET C'EST
--   TEMPORAIRE — ASSUMÉ, DATÉ, À SUPPRIMER.
--
--   La version en session résout la société par `get_my_company_id()`, qui rend
--   NULL pour un appelant anonyme : on ne peut donc pas l'appeler depuis ici.
--   Deux sorties existaient :
--
--     a) extraire le corps commun dans une fonction interne et faire appeler
--        les deux — plus propre, mais ça MODIFIE une fonction dont dépend le
--        raccordement en production, au milieu d'une refonte ;
--     b) dupliquer, et l'écrire.
--
--   (b) a été retenu pour la durée de la refonte. Le principe tenu depuis le
--   lot 1 est que rien d'existant ne bouge tant que le nouveau parcours n'est
--   pas validé de bout en bout.
--
--   ⚠ À FAIRE QUAND LE NOUVEAU PARCOURS SERA VALIDÉ : supprimer
--     `choisir_boites_graph(UUID, JSONB)` et son écran, ou extraire le corps
--     commun. Deux copies qui dérivent valent pire que l'une ou l'autre.
--     Toute correction apportée à l'une DOIT être reportée à l'autre d'ici là.
CREATE OR REPLACE FUNCTION public.choisir_boites_par_jeton(
  p_jeton TEXT,
  p_boites JSONB,
  p_temoin_upn TEXT DEFAULT NULL
)
RETURNS TABLE (retenues INTEGER, retirees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_tenant UUID;
  v_temoin TEXT;
  v_temoin_upn TEXT;
  v_retenues INTEGER := 0;
  v_retirees INTEGER := 0;
BEGIN
  SELECT j.company_id INTO v_company
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton
     AND j.revoque_at IS NULL AND j.termine_at IS NULL AND j.expire_at > now();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Lien de raccordement invalide ou expiré.';
  END IF;

  -- ⚠ LE LOCATAIRE VIENT DU JETON, PAS D'UN PARAMÈTRE. C'est ce qui interdit
  --   de rattacher le locataire d'une entreprise à la société d'une autre.
  SELECT t.id, t.temoin_graph_user_id, t.temoin_upn
    INTO v_tenant, v_temoin, v_temoin_upn
    FROM microsoft_tenants t
   WHERE t.company_id = v_company
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Aucun locataire Microsoft : l''accord n''a pas été donné.';
  END IF;

  IF p_boites IS NULL OR jsonb_array_length(p_boites) = 0 THEN
    RAISE EXCEPTION 'Aucune boîte sélectionnée.';
  END IF;

  -- Le témoin choisi à cet écran remplace le précédent, s'il y en avait un.
  IF p_temoin_upn IS NOT NULL AND p_temoin_upn <> '' THEN
    UPDATE microsoft_tenants
       SET temoin_upn = lower(p_temoin_upn),
           temoin_graph_user_id = (
             SELECT b.graph_user_id FROM boites_surveillees b
              WHERE b.tenant_uid = v_tenant AND b.upn = lower(p_temoin_upn)
              LIMIT 1)
     WHERE id = v_tenant;
    v_temoin_upn := lower(p_temoin_upn);
    SELECT t.temoin_graph_user_id INTO v_temoin
      FROM microsoft_tenants t WHERE t.id = v_tenant;
  END IF;

  -- La boîte témoin porte la preuve : la surveiller reviendrait à la faire
  -- entrer dans le périmètre, donc à perdre le seul moyen de vérifier.
  IF v_temoin_upn IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_boites) e
        WHERE lower(e ->> 'upn') = v_temoin_upn
     ) THEN
    RAISE EXCEPTION
      'La boîte % sert à vérifier que l''accès est bien restreint : elle doit rester hors surveillance.',
      v_temoin_upn;
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
    SELECT v_company, v_tenant, n.graph_user_id, lower(n.upn), FALSE, TRUE
      FROM entrantes n
    ON CONFLICT (tenant_uid, graph_user_id) DO UPDATE
       SET upn = EXCLUDED.upn, choisie = TRUE
    RETURNING 1
  )
  SELECT count(*) INTO v_retenues FROM posees;

  UPDATE boites_surveillees b
     SET choisie = FALSE, actif = FALSE, restriction_verifiee_at = NULL
   WHERE b.tenant_uid = v_tenant
     AND b.choisie
     AND b.graph_user_id NOT IN (
       SELECT e ->> 'graph_user_id' FROM jsonb_array_elements(p_boites) e
     );
  GET DIAGNOSTICS v_retirees = ROW_COUNT;

  -- Le périmètre a changé : la preuve d'hier ne prouve plus celui d'aujourd'hui.
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = NULL, restriction_preuve = NULL
   WHERE id = v_tenant;

  RETURN QUERY SELECT v_retenues, v_retirees;
END;
$$;

REVOKE ALL ON FUNCTION public.choisir_boites_par_jeton(TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.choisir_boites_par_jeton(TEXT, JSONB, TEXT)
  TO anon, authenticated, service_role;


-- =============================================================================
-- Le jeton voyage avec l'état OAuth
-- =============================================================================
--
-- ⚠ SANS ÇA, LE RETOUR DE MICROSOFT EST UN CUL-DE-SAC — le pire du parcours,
--   celui que le principe 2 vise nommément. Microsoft nous renvoie un `state`
--   et un `tenant`, rien d'autre : sans cette colonne, la route de retour ne
--   sait pas SUR QUEL LIEN renvoyer l'informaticien, et ne peut que lui
--   afficher « prévenez la personne qui a lancé ça ».
--
-- ⚠ LA COLONNE EST FACULTATIVE, ET C'EST CE QUI PROTÈGE L'ANCIEN PARCOURS. Un
--   consentement lancé en session la laisse NULL ; la route de retour voit
--   NULL et sert exactement la page d'avant. Les deux voies cohabitent sans se
--   connaître.
ALTER TABLE graph_consentements
  ADD COLUMN IF NOT EXISTS jeton_raccordement TEXT;

COMMENT ON COLUMN graph_consentements.jeton_raccordement IS
  'Le lien de raccordement d''où part ce consentement, pour savoir où '
  'renvoyer au retour de Microsoft. NULL = parcours en session.';

-- La même fonction qu'au lot 1, qui garde en plus la trace du jeton.
CREATE OR REPLACE FUNCTION public.demarrer_consentement_par_jeton(
  p_jeton TEXT,
  p_email TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL
)
RETURNS TABLE (etat TEXT, expire_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_etat TEXT;
BEGIN
  SELECT j.company_id INTO v_company
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton
     AND j.revoque_at IS NULL
     AND j.termine_at IS NULL
     AND j.expire_at > now();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Lien de raccordement invalide ou expiré.';
  END IF;

  v_etat := replace(gen_random_uuid()::TEXT, '-', '')
         || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO graph_consentements
    (company_id, etat, demande_par, demande_ip, jeton_raccordement)
  VALUES
    (v_company, v_etat, left(p_email, 200), left(COALESCE(p_ip, ''), 60), p_jeton);

  RETURN QUERY
    SELECT c.etat, c.expire_at FROM graph_consentements c WHERE c.etat = v_etat;
END;
$$;

REVOKE ALL ON FUNCTION public.demarrer_consentement_par_jeton(TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demarrer_consentement_par_jeton(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- Où renvoyer après Microsoft. Rend NULL pour un consentement en session.
CREATE OR REPLACE FUNCTION public.jeton_de_l_etat_consentement(p_etat TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.jeton_raccordement FROM graph_consentements c WHERE c.etat = p_etat
$$;

REVOKE ALL ON FUNCTION public.jeton_de_l_etat_consentement(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jeton_de_l_etat_consentement(TEXT) TO service_role;

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
--   DROP FUNCTION IF EXISTS public.jeton_de_l_etat_consentement(TEXT);
--   DROP FUNCTION IF EXISTS public.choisir_boites_par_jeton(TEXT, JSONB, TEXT);
--   DROP FUNCTION IF EXISTS public.etat_raccordement_par_jeton(TEXT);
--   ALTER TABLE graph_consentements DROP COLUMN IF EXISTS jeton_raccordement;
--
-- ⚠ `demarrer_consentement_par_jeton` EST REDÉFINIE ICI, PAS CRÉÉE. Pour
--   revenir en arrière complètement il faut rejouer sa version du lot 1
--   (20260918_jetons_raccordement.sql, section 6) — celle qui n'écrit pas la
--   colonne. La laisser telle quelle après un DROP COLUMN la ferait échouer.
--   Retirer la colonne SANS rejouer la fonction est donc le seul ordre qui
--   casse quelque chose : ne pas le faire.
