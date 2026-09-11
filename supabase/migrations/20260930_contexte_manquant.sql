-- Un verdict rendu sans contexte doit se voir
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LE PIRE CAS DU PRODUIT : UNE FRAUDE SOUS-ÉVALUÉE EN SILENCE.
--
-- `contexte_detection_graph` fournit au moteur les domaines internes, les
-- domaines autorisés et les correspondants de confiance. Quand il manque, le
-- worker n'interrompt pas l'analyse — il la rend SANS les règles qui en
-- dépendent : correspondant connu, usurpation d'identité annuaire,
-- typosquattage. C'est-à-dire les règles à 75 points.
--
-- Le raisonnement d'origine tenait : mieux vaut un verdict partiel qu'un
-- message non analysé. Mais la dégradation ne laissait qu'un `console.error`
-- et un champ dans une réponse HTTP que personne ne lit. Le même message
-- pouvait donc ressortir « Risque élevé » à un passage et « À vérifier » au
-- suivant, sans que rien n'explique l'écart.
--
-- Un avertissement affaibli sans que personne le sache est pire qu'un
-- avertissement absent : le client le lit, et il rassure.
--
-- ⚠ LA COLONNE PORTE LA RAISON, PAS UN BOOLÉEN. « Sans contexte » recouvre
--   deux pannes différentes — l'appel a échoué, ou il a répondu sans aucun
--   domaine interne — qui ne se corrigent pas au même endroit. Un booléen
--   aurait obligé à rouvrir les journaux pour savoir laquelle.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS contexte_manquant TEXT;

COMMENT ON COLUMN graph_analyses.contexte_manquant IS
  'NULL = verdict rendu avec le contexte complet. Sinon, la raison de son absence : ce verdict est PARTIEL, les règles à 75 points n''ont pas pu s''appliquer.';

-- Un index partiel : ces lignes sont rares par construction, et ce sont
-- exactement celles qu'on veut retrouver vite.
CREATE INDEX IF NOT EXISTS idx_analyses_contexte_manquant
  ON graph_analyses(analyse_at) WHERE contexte_manquant IS NOT NULL;

-- =============================================================================
-- 1. Le marquage
-- =============================================================================

-- ⚠ PAR L'IDENTIFIANT DE LIGNE. Même règle que pour le déplacement : le
--   message_id peut changer sous nos pieds, l'identifiant de ligne jamais.
--
-- ⚠ APPELÉE SEULEMENT DANS LE CAS DÉGRADÉ. Le cas nominal ne coûte donc rien :
--   pas d'appel, pas de colonne à écrire. `contexte_manquant` à NULL veut dire
--   « contexte complet », et c'est la valeur par défaut.
CREATE OR REPLACE FUNCTION public.marquer_contexte_manquant(
  p_analyse_id UUID,
  p_raison TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET contexte_manquant = left(COALESCE(p_raison, 'raison inconnue'), 300)
   WHERE id = p_analyse_id;
$$;

REVOKE ALL ON FUNCTION public.marquer_contexte_manquant(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_contexte_manquant(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 2. Le contrôle
-- =============================================================================

-- ⚠ ON COMPTE LES ALERTES SÉPARÉMENT, et c'est le chiffre qui compte. Une
--   analyse anodine rendue sans contexte n'a probablement rien changé. Une
--   ALERTE rendue sans contexte est un message dont le niveau est peut-être
--   faux — et sous-évalué, jamais sur-évalué, puisque les règles perdues
--   n'ajoutent que des points.
CREATE OR REPLACE FUNCTION public.etat_contexte_detection()
RETURNS TABLE (
  analyses_24h BIGINT,
  sans_contexte_24h BIGINT,
  alertes_sans_contexte_24h BIGINT,
  derniere_raison TEXT,
  dernier_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recentes AS (
    SELECT * FROM graph_analyses WHERE analyse_at > now() - interval '24 hours'
  )
  SELECT
    (SELECT count(*) FROM recentes),
    (SELECT count(*) FROM recentes WHERE contexte_manquant IS NOT NULL),
    (SELECT count(*) FROM recentes WHERE contexte_manquant IS NOT NULL AND alerte),
    (SELECT contexte_manquant FROM recentes
      WHERE contexte_manquant IS NOT NULL ORDER BY analyse_at DESC LIMIT 1),
    (SELECT analyse_at FROM recentes
      WHERE contexte_manquant IS NOT NULL ORDER BY analyse_at DESC LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.etat_contexte_detection()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_contexte_detection() TO service_role;

-- =============================================================================
-- 3. Vérification
-- =============================================================================

-- 3.1 Colonne et fonctions en place :
--
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'graph_analyses'
--         AND column_name = 'contexte_manquant')                    AS colonne,
--     (SELECT count(*) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('marquer_contexte_manquant',
--                           'etat_contexte_detection'))             AS fonctions;
--
--   Attendu : colonne = 1, fonctions = 2.
--
-- 3.2 L'état. Sur une base saine, tout doit être à zéro :
--
--   SELECT * FROM etat_contexte_detection();
--
-- 3.3 LA QUESTION EN COURS — pourquoi deux messages identiques n'ont pas eu
--     le même verdict. À comparer ligne à ligne :
--
--   SELECT recu_at, score, niveau, nom_signe, longueur_texte,
--          citation_retiree, marqueur_citation, blocs_masques, format_corps,
--          contexte_manquant, signaux
--     FROM graph_analyses
--    WHERE expediteur_email = '<l''expéditeur>'
--      AND recu_at > now() - interval '6 hours'
--    ORDER BY recu_at;
--
--   `nom_signe` est le plus parlant : c'est le nom lu dans la signature. S'il
--   est NULL sur la ligne au score le plus bas, la signature n'a pas été
--   reconnue — et la règle des correspondants ne peut pas se déclencher, quel
--   que soit l'état du contexte. `citation_retiree` et `longueur_texte`
--   diront alors si le texte analysé était le même.
