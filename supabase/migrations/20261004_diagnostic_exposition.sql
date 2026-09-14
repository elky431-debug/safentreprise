-- Le diagnostic d'exposition de la vitrine
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CE QUE CETTE TABLE CONTIENT, ET CE QU'ELLE NE CONTIENT PAS.
--
-- Elle reçoit les réponses au questionnaire public /diagnostic : sept choix
-- dans des listes fermées, un domaine d'entreprise facultatif, un score, et
-- une adresse email UNIQUEMENT si le répondant la donne pour recevoir son
-- résultat. Rien d'autre. Pas de nom, pas de téléphone, pas d'adresse IP, pas
-- de commentaire libre.
--
-- ⚠ AUCUNE POLITIQUE RLS N'EST CRÉÉE, ET C'EST LE POINT DE SÉCURITÉ.
--
--   `demandes_demo` a une politique d'INSERT publique parce que le formulaire
--   écrit depuis le navigateur avec la clé anonyme. Ici, non : le navigateur
--   n'écrit jamais directement. Il appelle /api/diagnostic, qui appelle
--   `enregistrer_diagnostic` avec la clé de service.
--
--   Résultat : RLS activé + zéro politique = les rôles `anon` et
--   `authenticated` ne peuvent NI LIRE NI ÉCRIRE cette table, par aucun
--   chemin. Le seul écrivain est une fonction dont on maîtrise le contenu.
--
-- ⚠ LE SCORE ENVOYÉ PAR LE NAVIGATEUR N'EST PAS CELUI QUI EST ENREGISTRÉ.
--   La route le recalcule à partir des réponses avant d'appeler cette
--   fonction. Sans ça, n'importe qui pourrait remplir la table de scores
--   fantaisistes et fausser la seule mesure qu'on ait de ce que répondent les
--   prospects.
--
-- ⚠ L'EMAIL NE PEUT ÊTRE ÉCRIT QU'UNE FOIS, ET SEULEMENT S'IL EST VIDE.
--   L'identifiant de ligne circule jusqu'au navigateur (il faut bien pouvoir
--   rattacher l'adresse au questionnaire déjà enregistré). Quelqu'un qui
--   connaîtrait un identifiant ne peut donc ni relire la ligne, ni remplacer
--   une adresse déjà posée, ni toucher aux réponses.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. La table
-- =============================================================================

CREATE TABLE IF NOT EXISTS diagnostics_exposition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Score recalculé côté serveur, borné par le barème (35 à 95 aujourd'hui).
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),

  -- Les sept réponses. Listes fermées, vérifiées par la route avant d'arriver
  -- ici ; on ne pose pas de CHECK sur les valeurs pour ne pas avoir à migrer la
  -- table chaque fois qu'une option est reformulée.
  effectif TEXT,
  messagerie TEXT,
  validation TEXT,
  second_canal TEXT,
  exposition_dirigeants TEXT,
  domaine_protege TEXT,
  antecedent TEXT,

  -- Domaine de l'entreprise, facultatif. Donnée d'entreprise, pas de personne.
  domaine TEXT,

  -- ⚠ LA SEULE DONNÉE PERSONNELLE DE LA TABLE. Facultative, et effacée au bout
  --   de douze mois par `anonymiser_diagnostics()` — les réponses, elles,
  --   restent : anonymes, elles gardent leur valeur statistique.
  email TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_exposition_date
  ON diagnostics_exposition(created_at DESC);

COMMENT ON TABLE diagnostics_exposition IS
  'Réponses au questionnaire public /diagnostic. Écriture par enregistrer_diagnostic() uniquement ; aucune politique RLS.';

ALTER TABLE diagnostics_exposition ENABLE ROW LEVEL SECURITY;

-- Aucune politique. Volontaire : voir l'en-tête. Toute politique ajoutée ici
-- ouvrirait la table au navigateur.

-- =============================================================================
-- 2. L'écriture
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enregistrer_diagnostic(
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
  p_id UUID DEFAULT NULL
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
  -- ---- Cas 1 : on complète une ligne déjà écrite, avec l'adresse ----------
  --
  -- ⚠ ON DISTINGUE « LIGNE ABSENTE » DE « ADRESSE DÉJÀ POSÉE », ET C'EST CE
  --   QUI ÉVITE UNE LIGNE PARASITE. Une première écriture qui se contentait
  --   d'un UPDATE conditionnel ne savait pas laquelle des deux situations
  --   l'avait fait échouer : une deuxième soumission d'adresse sur la même
  --   ligne retombait sur l'insertion de secours et créait une ligne vide, à
  --   score 0, qui faussait la moyenne.
  --
  -- ⚠ L'ADRESSE NE SE REMPLACE PAS. Une ligne connue dont l'adresse est déjà
  --   posée est rendue telle quelle : quiconque connaîtrait un identifiant ne
  --   peut pas substituer la sienne.
  IF p_id IS NOT NULL THEN
    SELECT id, email INTO v_id, v_email_actuel
      FROM diagnostics_exposition WHERE id = p_id;
    v_existe := FOUND;

    IF v_existe THEN
      IF v_email_actuel IS NULL AND p_email IS NOT NULL THEN
        UPDATE diagnostics_exposition
           SET email = left(p_email, 200)
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
    exposition_dirigeants, domaine_protege, antecedent, domaine, email
  ) VALUES (
    greatest(0, least(100, p_score)),
    left(p_effectif, 40), left(p_messagerie, 40), left(p_validation, 40),
    left(p_second_canal, 40), left(p_exposition_dirigeants, 40),
    left(p_domaine_protege, 40), left(p_antecedent, 40),
    left(p_domaine, 253), left(p_email, 200)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_diagnostic(
  SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_diagnostic(
  SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;

-- =============================================================================
-- 3. La purge — l'adresse seulement, pas les réponses
-- =============================================================================

-- ⚠ ON EFFACE L'ADRESSE, ON GARDE LA LIGNE. Supprimer la ligne entière
--   détruirait la seule mesure qu'on ait de ce que répondent les prospects,
--   pour protéger une donnée qu'il suffit de mettre à NULL. Une ligne sans
--   adresse ne se rattache plus à personne : la minimisation est atteinte, et
--   la statistique survit.
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
     SET email = NULL
   WHERE email IS NOT NULL
     AND created_at < now() - interval '12 months';

  GET DIAGNOSTICS v_touchees = ROW_COUNT;
  RETURN v_touchees;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymiser_diagnostics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymiser_diagnostics() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron absent : planifier anonymiser_diagnostics() à la main.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-diagnostics') THEN
    PERFORM cron.unschedule('purge-diagnostics');
  END IF;

  -- 04:05 UTC — après les cinq purges existantes (03:15 à 03:55).
  PERFORM cron.schedule('purge-diagnostics', '5 4 * * *',
    $c$ SELECT public.anonymiser_diagnostics(); $c$);
END $$;

-- =============================================================================
-- 4. La lecture, pour le back-office
-- =============================================================================

-- ⚠ CETTE VUE N'OUVRE RIEN. Elle s'utilise depuis le SQL Editor Supabase, qui
--   travaille déjà avec des droits d'administration. Elle existe pour que la
--   question « qu'est-ce que répondent les prospects ? » se pose en une
--   requête au lieu de cinq.
CREATE OR REPLACE VIEW public.repartition_diagnostics AS
  SELECT
    count(*)                                            AS reponses,
    count(*) FILTER (WHERE email IS NOT NULL)           AS avec_email,
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

-- 5.1 Table fermée, fonctions en place. UNE SEULE REQUÊTE :
--
--   SELECT
--     (SELECT count(*) FROM pg_tables
--       WHERE tablename = 'diagnostics_exposition')                AS table_creee,
--     (SELECT rowsecurity FROM pg_tables
--       WHERE tablename = 'diagnostics_exposition')                AS rls_active,
--     (SELECT count(*) FROM pg_policies
--       WHERE tablename = 'diagnostics_exposition')                AS politiques,
--     (SELECT count(*) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('enregistrer_diagnostic',
--                           'anonymiser_diagnostics'))             AS fonctions,
--     (SELECT count(*) FROM cron.job
--       WHERE jobname = 'purge-diagnostics')                       AS purge;
--
--   Attendu : table_creee = 1, rls_active = t, POLITIQUES = 0, fonctions = 2,
--   purge = 1.
--
--   ⚠ `politiques` DOIT VALOIR 0. Toute autre valeur veut dire que la table est
--     joignable depuis le navigateur avec la clé anonyme.
--
-- 5.2 Un essai d'écriture, puis ce qu'on en lit :
--
--   SELECT enregistrer_diagnostic(
--     72::SMALLINT, '26-75', 'microsoft-365', 'une-personne', 'parfois',
--     'oui', 'inconnu', 'oui-reperee', 'exemple.fr');
--
--   SELECT * FROM repartition_diagnostics;
--
-- 5.3 Ce que répondent les prospects, en clair :
--
--   SELECT created_at, score, effectif, messagerie, validation, second_canal,
--          exposition_dirigeants, domaine_protege, antecedent, domaine,
--          email IS NOT NULL AS a_laisse_son_adresse
--     FROM diagnostics_exposition
--    ORDER BY created_at DESC LIMIT 50;
