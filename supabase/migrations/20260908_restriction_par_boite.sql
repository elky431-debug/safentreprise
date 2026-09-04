-- La restriction se constate boîte par boîte, pas locataire par locataire
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI N'ALLAIT PAS. Sur un locataire raccordé À LA MAIN avant l'existence
-- du parcours, tenants_en_alerte affichait :
--
--   « PÉRIMÈTRE MODIFIÉ — 1 boîte(s) déjà vérifiée(s) restent surveillées »
--
-- C'était faux. Aucune restriction n'avait jamais été vérifiée sur ce
-- locataire : aucun script PowerShell n'avait été exécuté, et l'application
-- pouvait atteindre toutes les boîtes.
--
-- LA CAUSE. La migration précédente n'a rien écrit dans
-- restriction_verifiee_at — un ALTER TABLE ... ADD COLUMN laisse NULL, et
-- c'était le bon comportement. Le défaut était dans la VUE : elle déduisait
-- « vérifiée » de « active ». Or boites_surveillees.actif portait deux sens à
-- la fois — « le client l'a choisie » et « la restriction a été constatée » —
-- et graph-abonner.mjs, le script historique, crée les boîtes actives par
-- défaut sans rien vérifier.
--
-- LA CORRECTION. La preuve descend au niveau de la boîte. Une boîte est
-- vérifiée, ou elle ne l'est pas, et la vue le lit au lieu de le déduire.
-- Toutes les boîtes existantes sont NON vérifiées — ce qui est la vérité.

-- =============================================================================
-- 1. La preuve, par boîte
-- =============================================================================

-- NULL pour toutes les lignes existantes, et c'est exact : aucune n'est passée
-- par une vérification. On ne rattrape rien, on ne suppose rien.
ALTER TABLE boites_surveillees
  ADD COLUMN IF NOT EXISTS restriction_verifiee_at TIMESTAMPTZ;

COMMENT ON COLUMN boites_surveillees.restriction_verifiee_at IS
  'Date à laquelle on a CONSTATÉ que l''accès de l''application est restreint à cette boîte. NULL = jamais vérifié, y compris pour les boîtes créées avant le parcours.';

CREATE INDEX IF NOT EXISTS idx_boites_non_verifiees
  ON boites_surveillees(tenant_uid) WHERE actif AND restriction_verifiee_at IS NULL;

-- =============================================================================
-- 2. Constater la restriction marque les boîtes concernées
-- =============================================================================

-- La preuve est « une boîte NON choisie a été refusée par Microsoft ». Elle
-- vaut donc pour le périmètre entier au moment du constat : toutes les boîtes
-- choisies sont couvertes, celles déjà actives comme celles qui s'activent.
--
-- Le type de retour change : il faut supprimer avant de recréer.
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
   WHERE tenant_uid = p_tenant_uid AND NOT actif;

  -- Seul endroit du schéma qui active une boîte, et seul endroit qui la
  -- déclare vérifiée. Les deux vont ensemble, toujours.
  UPDATE boites_surveillees
     SET actif = TRUE, restriction_verifiee_at = now()
   WHERE tenant_uid = p_tenant_uid;
  GET DIAGNOSTICS v_verifiees = ROW_COUNT;

  RETURN QUERY SELECT v_activees, v_verifiees;
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT) TO service_role;

-- =============================================================================
-- 3. Une boîte retirée du périmètre perd sa preuve
-- =============================================================================

-- Sans cela, une boîte retirée puis remise plus tard reviendrait avec une
-- vieille preuve, établie sur un périmètre qui n'existe plus.
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
  v_retenues INTEGER := 0;
  v_retirees INTEGER := 0;
BEGIN
  SELECT t.company_id INTO v_company
    FROM microsoft_tenants t
   WHERE t.id = p_tenant_uid AND t.company_id = get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Locataire inconnu ou n''appartenant pas à cette société.';
  END IF;

  IF p_boites IS NULL OR jsonb_array_length(p_boites) = 0 THEN
    RAISE EXCEPTION 'Aucune boîte sélectionnée.';
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
-- 4. LA VUE — elle lit la preuve, elle ne la déduit plus
-- =============================================================================

-- Deux colonnes s'insèrent AVANT « motif » : CREATE OR REPLACE VIEW ne sait
-- qu'ajouter en fin de liste. On supprime pour recréer.
--
-- problemes_de_veille() lit cette vue mais n'en dépend pas au sens du
-- catalogue — Postgres n'enregistre pas de dépendance depuis le corps d'une
-- fonction. Elle retrouve la vue recréée juste après, dans la même migration.
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

           -- LE CAS LE PLUS GRAVE, ET LE PLUS FACILE À MANQUER : des boîtes
           -- sont surveillées alors que l'accès n'a jamais été restreint. Le
           -- produit tourne, tout semble aller — mais on ne peut pas dire au
           -- client ce que l'application peut atteindre.
           WHEN c.non_verifiees > 0 THEN
             'RESTRICTION JAMAIS VÉRIFIÉE — ' || c.non_verifiees ||
             ' boîte(s) surveillée(s) sans que l''accès ait été restreint. ' ||
             'L''application peut atteindre TOUTES les boîtes de ce locataire. ' ||
             'Faire exécuter le script PowerShell, puis vérifier.'

           WHEN c.actives = 0 AND t.restriction_verifiee_at IS NULL THEN
             'RACCORDEMENT INACHEVÉ — la restriction des boîtes n''a pas été ' ||
             'vérifiée, donc rien n''est surveillé.'

           -- Ici, et seulement ici, « déjà vérifiée » est exact : ces boîtes
           -- portent chacune la date de leur constat.
           WHEN t.restriction_verifiee_at IS NULL THEN
             'PÉRIMÈTRE MODIFIÉ — ' || c.actives ||
             ' boîte(s) vérifiée(s) restent surveillées ; ' || c.en_attente ||
             ' attendent que la restriction soit vérifiée à nouveau.'

           WHEN c.actives = 0 THEN
             'Aucune boîte active : rien n''est surveillé.'
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
      OR t.verifie_at IS NULL
      OR t.verifie_at < now() - INTERVAL '48 hours';

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires dont le raccordement est inachevé, retiré, non contrôlé, ou dont des boîtes sont surveillées sans restriction vérifiée. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

-- =============================================================================
-- 5. Le compteur du diagnostic
-- =============================================================================

DROP FUNCTION IF EXISTS public.compter_tenants_en_alerte();

CREATE FUNCTION public.compter_tenants_en_alerte()
RETURNS TABLE (
  total BIGINT,
  revoques BIGINT,
  boites_non_verifiees BIGINT,
  inacheves BIGINT,
  non_controles BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM microsoft_tenants),
         (SELECT count(*) FROM microsoft_tenants WHERE statut = 'revoque'),
         -- Un COMPTE DE BOÎTES, pas de locataires : c'est le nombre de boîtes
         -- réellement surveillées sans restriction constatée.
         (SELECT count(*) FROM boites_surveillees b
            JOIN microsoft_tenants t ON t.id = b.tenant_uid
           WHERE b.actif AND b.restriction_verifiee_at IS NULL
             AND t.statut <> 'revoque'),
         (SELECT count(*) FROM microsoft_tenants t
           WHERE t.restriction_verifiee_at IS NULL AND t.statut <> 'revoque'),
         (SELECT count(*) FROM microsoft_tenants
           WHERE verifie_at IS NULL OR verifie_at < now() - INTERVAL '48 hours');
$$;

REVOKE ALL ON FUNCTION public.compter_tenants_en_alerte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compter_tenants_en_alerte() TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

--   SELECT tenant_id, boites_actives, boites_non_verifiees, motif
--     FROM tenants_en_alerte;
--
-- Sur un locataire raccordé à la main avant le parcours, elle doit dire
-- « RESTRICTION JAMAIS VÉRIFIÉE ». C'est exact, et c'est le but.
--
-- Le détail, boîte par boîte :
--
--   SELECT upn, actif, restriction_verifiee_at FROM boites_surveillees
--    ORDER BY upn;
--
-- ─────────────────────────────────────────────────────────────────────────
-- POUR ARRÊTER une surveillance dont la restriction n'a jamais été vérifiée,
-- en attendant de passer le locataire par le parcours :
--
--   UPDATE boites_surveillees SET actif = FALSE
--    WHERE actif AND restriction_verifiee_at IS NULL;
--
-- Ce n'est PAS fait automatiquement : cela couperait une surveillance qui
-- tourne, et c'est une décision d'exploitation, pas une migration.
