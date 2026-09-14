-- Les coordonnées du répondant au diagnostic
-- Appliquer via le SQL Editor Supabase. Idempotente.
-- Suite de 20261004_diagnostic_exposition.sql, qui doit être appliquée avant.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CE QUI CHANGE, ET POURQUOI ÇA COMPTE POUR L'AIPD.
--
-- Jusqu'ici la table portait au plus une adresse email, donnée par un
-- répondant qui voulait recevoir son résultat. Elle porte maintenant une
-- IDENTITÉ NOMINATIVE : prénom, nom, adresse et société d'un contact
-- professionnel, demandés pour accéder à l'analyse détaillée.
--
-- Ce n'est plus la même nature de donnée, et ce n'est plus la même base
-- légale : on passe d'un email facultatif à un formulaire dont le remplissage
-- conditionne l'accès au détail. L'AIPD est mise à jour en conséquence.
--
-- ⚠ LES QUATRE CHAMPS S'ÉCRIVENT ENSEMBLE, UNE SEULE FOIS. Ils arrivent d'un
--   seul formulaire ; les traiter séparément permettrait d'écraser un nom en
--   laissant l'adresse, ce qui ne correspond à aucun geste réel du répondant.
--   `email IS NULL` sert de marqueur unique : tant qu'il est vide, la ligne
--   n'a pas de coordonnées ; dès qu'il est posé, elles sont figées.
--
-- ⚠ LA PURGE À 12 MOIS LES EFFACE TOUS LES QUATRE. Laisser le nom en gardant
--   l'adresse, ou l'inverse, ne protégerait personne : c'est le rapprochement
--   qui identifie. Les sept réponses et le score, eux, restent — anonymes, ils
--   gardent leur valeur statistique.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. Les colonnes
-- =============================================================================

ALTER TABLE diagnostics_exposition ADD COLUMN IF NOT EXISTS prenom TEXT;
ALTER TABLE diagnostics_exposition ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE diagnostics_exposition ADD COLUMN IF NOT EXISTS entreprise TEXT;

COMMENT ON COLUMN diagnostics_exposition.prenom IS
  'Coordonnées du répondant. Écrites une seule fois, effacées à 12 mois par anonymiser_diagnostics().';
COMMENT ON COLUMN diagnostics_exposition.nom IS
  'Coordonnées du répondant. Écrites une seule fois, effacées à 12 mois par anonymiser_diagnostics().';
COMMENT ON COLUMN diagnostics_exposition.entreprise IS
  'Coordonnées du répondant. Écrites une seule fois, effacées à 12 mois par anonymiser_diagnostics().';

-- =============================================================================
-- 2. L'écriture
-- =============================================================================

-- ⚠ DROP PUIS CREATE, PAS `CREATE OR REPLACE`. PostgreSQL refuse de remplacer
--   une fonction dont la SIGNATURE change — et trois paramètres s'ajoutent.
--   Un `CREATE OR REPLACE` échouerait sur « cannot change name of input
--   parameter », ou pire, laisserait coexister deux surcharges dont PostgREST
--   choisirait la mauvaise.
DROP FUNCTION IF EXISTS public.enregistrer_diagnostic(
  SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE FUNCTION public.enregistrer_diagnostic(
  p_score SMALLINT,
  p_effectif TEXT DEFAULT NULL,
  p_messagerie TEXT DEFAULT NULL,
  p_validation TEXT DEFAULT NULL,
  p_second_canal TEXT DEFAULT NULL,
  p_exposition_dirigeants TEXT DEFAULT NULL,
  p_domaine_protege TEXT DEFAULT NULL,
  p_antecedent TEXT DEFAULT NULL,
  p_domaine TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_id UUID DEFAULT NULL,
  p_prenom TEXT DEFAULT NULL,
  p_nom TEXT DEFAULT NULL,
  p_entreprise TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email_actuel TEXT;
  v_existe BOOLEAN;
BEGIN
  -- ---- Cas 1 : on complète une ligne déjà écrite, avec les coordonnées ----
  --
  -- ⚠ ON DISTINGUE « LIGNE ABSENTE » DE « COORDONNÉES DÉJÀ POSÉES », ET C'EST
  --   CE QUI ÉVITE UNE LIGNE PARASITE. Une écriture qui se contentait d'un
  --   UPDATE conditionnel ne savait pas laquelle des deux situations l'avait
  --   fait échouer : une deuxième soumission sur la même ligne retombait sur
  --   l'insertion de secours et créait une ligne vide, à score 0, qui faussait
  --   la moyenne.
  --
  -- ⚠ LES COORDONNÉES NE SE REMPLACENT PAS. Une ligne dont l'adresse est déjà
  --   posée est rendue telle quelle : quiconque connaîtrait un identifiant ne
  --   peut y substituer ni son adresse, ni son nom, ni sa société.
  IF p_id IS NOT NULL THEN
    SELECT id, email INTO v_id, v_email_actuel
      FROM diagnostics_exposition WHERE id = p_id;
    v_existe := FOUND;

    IF v_existe THEN
      IF v_email_actuel IS NULL AND p_email IS NOT NULL THEN
        UPDATE diagnostics_exposition
           SET email      = left(p_email, 200),
               prenom     = left(p_prenom, 80),
               nom        = left(p_nom, 80),
               entreprise = left(p_entreprise, 160)
         WHERE id = p_id;
      END IF;
      RETURN p_id;
    END IF;

    -- Ligne absente (purgée, ou identifiant inventé) : on retombe sur une
    -- insertion plutôt que de perdre la réponse.
  END IF;

  -- ---- Cas 2 : première écriture -----------------------------------------
  INSERT INTO diagnostics_exposition (
    score, effectif, messagerie, validation, second_canal,
    exposition_dirigeants, domaine_protege, antecedent, domaine,
    email, prenom, nom, entreprise
  ) VALUES (
    greatest(0, least(100, p_score)),
    left(p_effectif, 40), left(p_messagerie, 40), left(p_validation, 40),
    left(p_second_canal, 40), left(p_exposition_dirigeants, 40),
    left(p_domaine_protege, 40), left(p_antecedent, 40),
    left(p_domaine, 253),
    left(p_email, 200), left(p_prenom, 80), left(p_nom, 80),
    left(p_entreprise, 160)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_diagnostic(
  SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_diagnostic(
  SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  TEXT, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- 3. La purge — les quatre champs, pas seulement l'adresse
-- =============================================================================

-- ⚠ ON EFFACE TOUTE L'IDENTITÉ, ON GARDE LA LIGNE. Effacer l'adresse en
--   laissant « Dupont / Acme » ne protégerait personne : le rapprochement
--   suffit à retrouver la personne. À l'inverse, supprimer la ligne entière
--   détruirait la seule mesure qu'on ait de ce que répondent les prospects,
--   pour protéger des données qu'il suffit de mettre à NULL.
CREATE OR REPLACE FUNCTION public.anonymiser_diagnostics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touchees INTEGER;
BEGIN
  UPDATE diagnostics_exposition
     SET email = NULL, prenom = NULL, nom = NULL, entreprise = NULL
   WHERE created_at < now() - interval '12 months'
     AND (email IS NOT NULL OR prenom IS NOT NULL
          OR nom IS NOT NULL OR entreprise IS NOT NULL);

  GET DIAGNOSTICS v_touchees = ROW_COUNT;
  RETURN v_touchees;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymiser_diagnostics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymiser_diagnostics() TO service_role;

-- La tâche `purge-diagnostics` de 20261004 appelle déjà cette fonction : elle
-- n'a pas à être replanifiée. On vérifie seulement qu'elle est toujours là.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron absent : planifier anonymiser_diagnostics() à la main.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-diagnostics') THEN
    PERFORM cron.schedule('purge-diagnostics', '5 4 * * *',
      $c$ SELECT public.anonymiser_diagnostics(); $c$);
    RAISE NOTICE 'Tâche purge-diagnostics recréée.';
  END IF;
END $$;

-- =============================================================================
-- 4. La lecture, pour le back-office
-- =============================================================================

-- ⚠ DROP PUIS CREATE, POUR LA MÊME RAISON QUE LA FONCTION PLUS HAUT.
--   `CREATE OR REPLACE VIEW` sait ajouter des colonnes à la fin, mais pas en
--   RENOMMER une : il refuse avec « cannot change name of view column
--   "avec_email" to "avec_coordonnees" ». Le remplacement en deux temps est la
--   seule voie — et il est sans risque ici, la vue ne portant aucune donnée.
DROP VIEW IF EXISTS public.repartition_diagnostics;

CREATE VIEW public.repartition_diagnostics AS
  SELECT
    count(*)                                            AS reponses,
    -- ⚠ « AVEC COORDONNÉES » REMPLACE « AVEC EMAIL » : c'est le taux qui dit
    --   si le formulaire convertit, et c'est la mesure qui décidera de le
    --   garder ou de le retirer.
    count(*) FILTER (WHERE email IS NOT NULL)           AS avec_coordonnees,
    count(*) FILTER (WHERE messagerie <> 'microsoft-365') AS hors_perimetre,
    round(avg(score))                                   AS score_moyen,
    min(score)                                          AS score_min,
    max(score)                                          AS score_max,
    count(*) FILTER (WHERE score >= 70)                 AS palier_eleve,
    count(*) FILTER (WHERE score >= 50 AND score < 70)  AS palier_significatif,
    count(*) FILTER (WHERE score < 50)                  AS palier_modere,
    max(created_at)                                     AS derniere_reponse
  FROM diagnostics_exposition;

REVOKE ALL ON public.repartition_diagnostics FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 5. Vérification
-- =============================================================================

-- 5.1 Colonnes, signature et fermeture. UNE SEULE REQUÊTE :
--
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'diagnostics_exposition'
--         AND column_name IN ('prenom', 'nom', 'entreprise'))       AS colonnes,
--     (SELECT count(*) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname = 'enregistrer_diagnostic')                 AS versions,
--     (SELECT count(*) FROM pg_policies
--       WHERE tablename = 'diagnostics_exposition')                 AS politiques,
--     (SELECT count(*) FROM cron.job
--       WHERE jobname = 'purge-diagnostics')                        AS purge;
--
--   Attendu : colonnes = 3, VERSIONS = 1, POLITIQUES = 0, purge = 1.
--
--   ⚠ `versions` DOIT VALOIR 1. À 2, l'ancienne signature a survécu au DROP et
--     PostgREST peut appeler celle qui ignore les coordonnées — le formulaire
--     paraîtrait fonctionner en n'enregistrant rien.
--
-- 5.2 Un essai complet : réponses, puis coordonnées sur la même ligne.
--
--   SELECT enregistrer_diagnostic(
--     82::SMALLINT, '26-75', 'microsoft-365', 'une-personne', 'non',
--     'oui', 'inconnu', 'oui-reperee', 'acme.fr') AS id \gset
--
--   SELECT enregistrer_diagnostic(
--     0::SMALLINT, p_id := :'id'::uuid, p_email := 'jean@acme.fr',
--     p_prenom := 'Jean', p_nom := 'Dupont', p_entreprise := 'Acme');
--
--   SELECT score, prenom, nom, entreprise, email
--     FROM diagnostics_exposition WHERE id = :'id'::uuid;
--   -- Attendu : 82, Jean, Dupont, Acme, jean@acme.fr — et UNE SEULE ligne.
--
-- 5.3 Ce que répondent les prospects :
--
--   SELECT created_at, score, effectif, messagerie, validation, second_canal,
--          exposition_dirigeants, domaine_protege, antecedent, domaine,
--          prenom, nom, entreprise, email
--     FROM diagnostics_exposition
--    ORDER BY created_at DESC LIMIT 50;
--
--   SELECT * FROM repartition_diagnostics;
