-- Lot 3 du parcours de raccordement : le script et la vérification, par jeton.
-- Appliquer via : npm run db:apply — ou le SQL Editor Supabase.
--
-- Référence : docs/PARCOURS-RACCORDEMENT.md
--
-- ============================================================================
-- UNE SEULE FONCTION, ET PAS DE SECONDE COPIE DE 600 LIGNES
-- ============================================================================
--
-- La route `/api/microsoft/restriction` fait 606 lignes : elle produit le
-- script PowerShell, cherche ou crée la boîte témoin, sonde, conclut. Tout
-- cela tourne DÉJÀ en `service_role` et ne dépend pas de la session.
--
-- La seule partie qui en dépend est son résolveur de contexte, qui lit
-- `microsoft_tenants` et `companies` à travers la RLS. C'est donc la seule
-- chose à doubler — pas les 600 lignes.
--
-- ⚠ ET CETTE FOIS ON NE DUPLIQUE PAS. La dette ouverte au lot 2 sur
--   `choisir_boites_par_jeton` était acceptable pour une fonction de trente
--   lignes ; elle ne le serait pas pour six cents. La route reçoit donc une
--   seconde VOIE d'entrée, pas un second exemplaire : quand `jeton` est
--   absent, elle se comporte exactement comme avant, au caractère près.
--
-- ⚠ ACCORDÉE AU SEUL `service_role`, PAS À `anon`. La route l'appelle côté
--   serveur avec la clé secrète, après avoir validé le jeton. Un appelant
--   anonyme n'a aucune raison de lire l'identifiant de service principal ni le
--   nom de la société : ce sont des éléments d'exploitation, pas d'affichage.
--
-- Cette migration est idempotente.

CREATE OR REPLACE FUNCTION public.contexte_restriction_par_jeton(p_jeton TEXT)
RETURNS TABLE (
  tenant_uid UUID,
  tenant_id TEXT,
  temoin_graph_user_id TEXT,
  temoin_upn TEXT,
  sp_object_id TEXT,
  societe_id UUID,
  societe_nom TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  SELECT j.company_id INTO v_company
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton
     AND j.revoque_at IS NULL
     AND j.termine_at IS NULL
     AND j.expire_at > now();

  IF v_company IS NULL THEN
    RETURN;                      -- aucune ligne : la route répondra 404
  END IF;

  RETURN QUERY
    SELECT t.id, t.tenant_id, t.temoin_graph_user_id, t.temoin_upn,
           t.sp_object_id, c.id, c.nom
      FROM microsoft_tenants t
      JOIN companies c ON c.id = t.company_id
     WHERE t.company_id = v_company
     ORDER BY t.created_at DESC
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.contexte_restriction_par_jeton(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contexte_restriction_par_jeton(TEXT)
  TO service_role;

-- =============================================================================
-- Clore le raccordement
-- =============================================================================

-- ⚠ LE JETON MEURT QUAND LE TRAVAIL EST FINI, PAS À SON EXPIRATION. Un lien
--   qui resterait ouvert après coup laisserait n'importe quel détenteur
--   relancer un consentement ou changer le périmètre sans que le dirigeant le
--   voie. `termine_at` le referme, et la page devient un constat en lecture
--   seule.
--
-- ⚠ IDEMPOTENTE : la vérification peut aboutir deux fois — un rechargement,
--   un double clic. Le `WHERE termine_at IS NULL` garde la PREMIÈRE date,
--   celle qui correspond au moment où le raccordement a réellement abouti.
CREATE OR REPLACE FUNCTION public.clore_jeton_raccordement(p_jeton TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE raccordement_jetons
     SET termine_at = now()
   WHERE jeton = p_jeton AND revoque_at IS NULL AND termine_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.clore_jeton_raccordement(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clore_jeton_raccordement(TEXT) TO service_role;

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
--   DROP FUNCTION IF EXISTS public.clore_jeton_raccordement(TEXT);
--   DROP FUNCTION IF EXISTS public.contexte_restriction_par_jeton(TEXT);
--
-- Rien d'autre à défaire : cette migration ne crée ni table ni colonne, et ne
-- redéfinit aucune fonction existante.
