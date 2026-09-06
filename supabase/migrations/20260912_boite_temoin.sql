-- La boîte témoin : de quoi prouver la restriction, toujours
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- LE PROBLÈME. Prouver que l'accès est restreint suppose une boîte HORS du
-- périmètre, que Microsoft refuse. Si le client coche toutes ses boîtes — une
-- PME de trois personnes qui veut surveiller les trois, cas courant — il n'en
-- reste aucune pour servir de témoin, et la restriction devient indémontrable.
--
-- LE CHOIX RETENU. Une boîte témoin dédiée, désignée une fois et conservée.
-- Cherchée d'abord parmi les boîtes existantes — une boîte partagée, une salle
-- de réunion — et créée seulement si le locataire n'en a aucune.
--
-- L'ALTERNATIVE ÉCARTÉE, et pourquoi. On aurait pu appliquer le périmètre sans
-- le prouver, et attendre qu'une boîte apparaisse. Cela aurait introduit un
-- troisième état, ni vérifié ni en panne, qui serait resté en permanence dans
-- tenants_en_alerte. Or c'est la règle « cette vue doit rester vide » qui a
-- fait trouver trois pannes en une semaine. On ne l'affaiblit pas pour éviter
-- une friction d'installation.

-- =============================================================================
-- 1. Le témoin, retenu sur le locataire
-- =============================================================================

ALTER TABLE microsoft_tenants
  ADD COLUMN IF NOT EXISTS temoin_graph_user_id TEXT,
  ADD COLUMN IF NOT EXISTS temoin_upn TEXT,
  -- « existant » : une boîte que le locataire avait déjà.
  -- « cree »     : une boîte partagée créée par le script de restriction.
  ADD COLUMN IF NOT EXISTS temoin_origine TEXT
    CHECK (temoin_origine IS NULL OR temoin_origine IN ('existant', 'cree'));

COMMENT ON COLUMN microsoft_tenants.temoin_upn IS
  'Boîte volontairement HORS du périmètre surveillé, qui sert à prouver que la restriction fonctionne. Ne doit jamais être surveillée.';

-- =============================================================================
-- 2. Le témoin ne peut pas devenir une boîte surveillée
-- =============================================================================

-- ⚠ L'INVARIANT QUI PORTE TOUTE LA PREUVE. Si le client cochait la boîte
--   témoin, elle entrerait dans le périmètre, cesserait d'être refusée, et la
--   vérification suivante conclurait à tort que la restriction ne fonctionne
--   plus — ou pire, on perdrait le seul moyen de la démontrer.
--
--   On refuse la sélection plutôt que de retirer silencieusement la boîte :
--   le client doit savoir pourquoi celle-là n'est pas disponible.
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
    INSERT INTO boites_surveillees (company_id, tenant_uid, graph_user_id, upn, actif)
    SELECT v_company, p_tenant_uid, n.graph_user_id, lower(n.upn), FALSE
      FROM entrantes n
    ON CONFLICT (tenant_uid, graph_user_id) DO UPDATE
       SET upn = EXCLUDED.upn
    RETURNING 1
  )
  SELECT count(*) INTO v_retenues FROM posees;

  UPDATE boites_surveillees b
     SET actif = FALSE, restriction_verifiee_at = NULL
   WHERE b.tenant_uid = p_tenant_uid
     AND b.graph_user_id NOT IN (
       SELECT e ->> 'graph_user_id' FROM jsonb_array_elements(p_boites) e
     );
  GET DIAGNOSTICS v_retirees = ROW_COUNT;

  UPDATE microsoft_tenants
     SET restriction_verifiee_at = NULL, restriction_preuve = NULL
   WHERE id = p_tenant_uid;

  RETURN QUERY SELECT v_retenues, v_retirees;
END;
$$;

REVOKE ALL ON FUNCTION public.choisir_boites_graph(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choisir_boites_graph(UUID, JSONB) TO authenticated, service_role;

-- =============================================================================
-- 3. Retenir le témoin
-- =============================================================================

-- Appelée par la route de restriction quand elle a trouvé — ou fait créer —
-- une boîte hors périmètre qui répond comme il faut.
CREATE OR REPLACE FUNCTION public.retenir_temoin_graph(
  p_tenant_uid UUID,
  p_graph_user_id TEXT,
  p_upn TEXT,
  p_origine TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_origine NOT IN ('existant', 'cree') THEN
    RAISE EXCEPTION 'Origine de témoin inconnue : %', p_origine;
  END IF;

  -- Un témoin déjà surveillé n'en est pas un.
  IF EXISTS (
    SELECT 1 FROM boites_surveillees
     WHERE tenant_uid = p_tenant_uid
       AND graph_user_id = p_graph_user_id
       AND actif
  ) THEN
    RAISE EXCEPTION
      'La boîte % est surveillée : elle ne peut pas servir de témoin.', p_upn;
  END IF;

  UPDATE microsoft_tenants
     SET temoin_graph_user_id = p_graph_user_id,
         temoin_upn = lower(p_upn),
         temoin_origine = p_origine
   WHERE id = p_tenant_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.retenir_temoin_graph(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retenir_temoin_graph(UUID, TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 4. La vue dit aussi quand le témoin manque
-- =============================================================================

-- Un locataire vérifié dont le témoin a disparu — boîte supprimée, ou cochée
-- entre-temps — ne peut plus prouver quoi que ce soit. Ce n'est pas une panne
-- de surveillance, mais c'est une promesse qu'on ne peut plus tenir : la vue
-- doit le dire.
DROP VIEW IF EXISTS public.tenants_en_alerte;

CREATE VIEW public.tenants_en_alerte
WITH (security_invoker = true) AS
  SELECT t.company_id,
         t.tenant_id,
         t.statut,
         t.consenti_par,
         t.consenti_at,
         t.verifie_at,
         t.restriction_verifiee_at,
         t.temoin_upn,
         t.derniere_erreur,
         c.actives AS boites_actives,
         c.non_verifiees AS boites_non_verifiees,
         c.en_attente AS boites_en_attente,
         CASE
           WHEN t.statut = 'revoque' THEN
             'CONSENTEMENT RETIRÉ — plus aucune boîte n''est surveillée. ' ||
             'Le client doit refaire le raccordement. ' ||
             COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'erreur' THEN
             'En erreur — ' || COALESCE(t.derniere_erreur, 'sans détail')

           WHEN c.non_verifiees > 0 THEN
             'RESTRICTION JAMAIS VÉRIFIÉE — ' || c.non_verifiees ||
             ' boîte(s) surveillée(s) sans que l''accès ait été restreint. ' ||
             'L''application peut atteindre TOUTES les boîtes de ce locataire. ' ||
             'Faire exécuter le script PowerShell, puis vérifier.'

           WHEN c.actives = 0 AND t.restriction_verifiee_at IS NULL THEN
             'RACCORDEMENT INACHEVÉ — la restriction des boîtes n''a pas été ' ||
             'vérifiée, donc rien n''est surveillé.'

           WHEN t.restriction_verifiee_at IS NULL THEN
             'PÉRIMÈTRE MODIFIÉ — ' || c.actives ||
             ' boîte(s) vérifiée(s) restent surveillées ; ' || c.en_attente ||
             ' attendent que la restriction soit vérifiée à nouveau.'

           WHEN c.actives = 0 THEN
             'Aucune boîte active : rien n''est surveillé.'

           -- Vérifié, mais plus rien pour le refaire.
           WHEN t.temoin_graph_user_id IS NULL THEN
             'TÉMOIN PERDU — la restriction a été vérifiée, mais aucune boîte ' ||
             'hors périmètre n''est plus retenue : elle ne peut plus être ' ||
             'démontrée. Désigner une nouvelle boîte témoin.'

           WHEN t.verifie_at IS NULL OR t.verifie_at < now() - INTERVAL '48 hours' THEN
             'Consentement non contrôlé depuis ' ||
             COALESCE(age(now(), t.verifie_at)::TEXT, 'toujours') ||
             ' — le contrôle quotidien ne tourne plus.'
           ELSE 'À surveiller'
         END AS motif
    FROM microsoft_tenants t
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE b.actif) AS actives,
             count(*) FILTER (WHERE b.actif AND b.restriction_verifiee_at IS NULL)
               AS non_verifiees,
             count(*) FILTER (WHERE NOT b.actif) AS en_attente
        FROM boites_surveillees b WHERE b.tenant_uid = t.id
    ) c
   WHERE t.statut <> 'actif'
      OR c.non_verifiees > 0
      OR t.restriction_verifiee_at IS NULL
      OR c.actives = 0
      OR t.temoin_graph_user_id IS NULL
      OR t.verifie_at IS NULL
      OR t.verifie_at < now() - INTERVAL '48 hours';

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires dont le raccordement est inachevé, retiré, non contrôlé, sans témoin, ou dont des boîtes sont surveillées sans restriction vérifiée. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

-- =============================================================================
-- 5. Vérification
-- =============================================================================

--   SELECT tenant_id, temoin_upn, temoin_origine, motif FROM tenants_en_alerte;
--   SELECT tenant_id, temoin_upn, temoin_origine FROM microsoft_tenants;
--
-- Le témoin ne doit JAMAIS figurer parmi les boîtes surveillées :
--
--   SELECT t.tenant_id, t.temoin_upn
--     FROM microsoft_tenants t
--     JOIN boites_surveillees b
--       ON b.tenant_uid = t.id AND b.graph_user_id = t.temoin_graph_user_id
--    WHERE b.actif;
--
-- Elle doit ne rien renvoyer.
