-- Compter les poses de bannière, pour mesurer les faux positifs
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : `banniere_posee_at` répond à « y a-t-il une bannière EN CE MOMENT ? »
-- et la restauration le remet à NULL. C'est cohérent — c'est un état, pas un
-- historique, et il fonctionne en bascule avec `restauree_at`. Mais une fois
-- restaurée, plus rien ne dit qu'une alerte a un jour porté une bannière :
-- l'information est détruite, et aucune requête ne peut la reconstituer.
--
-- Ce compteur la conserve. Il donne surtout ce qui manquait :
--
--   bannieres_posees = 0                          jamais bannièrisée
--   > 0 et restauree_at IS NOT NULL               posée puis restaurée
--   > 1                                            plusieurs cycles — un faux
--                                                  positif qui revient
--
-- Le rapport entre les alertes restaurées et les alertes bannièrisées est le
-- TAUX DE FAUX POSITIFS. C'est la mesure qu'on demandera au produit avant de
-- le revendre, et elle n'existait pas.
--
-- ⚠ IL EST PUREMENT ADDITIF. Ni `alertes_a_bannieriser` ni
--   `compter_alertes_sans_banniere` ne lisent cette colonne : la logique de
--   remise en file est inchangée. C'était la condition — cesser de remettre
--   `banniere_posee_at` à NULL aurait rendu toute alerte restaurée à nouveau
--   éligible, donc rebannièrisée en boucle après chaque restauration.

-- =============================================================================
-- 1. La colonne
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS bannieres_posees INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN graph_analyses.bannieres_posees IS
  'Nombre de fois qu''une bannière a été posée sur ce message. JAMAIS remis à zéro, pas même par la restauration : c''est l''historique que banniere_posee_at, qui est un état, ne conserve pas.';

-- =============================================================================
-- 2. Reprise de l'existant
-- =============================================================================

-- ⚠ ON NE PEUT COMPTER QU'UN SEUL CYCLE POUR LE PASSÉ, et c'est irréductible :
--   l'information détruite ne se reconstitue pas. Une alerte qui a été posée,
--   restaurée, reposée puis restaurée à nouveau ressortira à 1. Le compteur
--   n'est exact qu'à partir d'aujourd'hui ; les lignes antérieures donnent un
--   plancher, jamais une surestimation.
UPDATE graph_analyses
   SET bannieres_posees = 1
 WHERE bannieres_posees = 0
   AND (
     banniere_posee_at IS NOT NULL
     OR restauree_at IS NOT NULL
     OR action_etat = 'posee'
   );

-- =============================================================================
-- 3. L'incrément
-- =============================================================================

-- Reprise à l'identique de la version de 20260903 — sept paramètres, format de
-- bannière compris — avec la seule ligne qui change : `bannieres_posees`.
CREATE OR REPLACE FUNCTION public.marquer_action_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_categorie TEXT,
  p_banniere_posee BOOLEAN,
  p_erreur TEXT DEFAULT NULL,
  p_action_etat TEXT DEFAULT NULL,
  p_banniere_format TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET categorie = COALESCE(p_categorie, categorie),
         categorie_posee_at = CASE
           WHEN p_categorie IS NOT NULL THEN now() ELSE categorie_posee_at END,
         banniere_posee_at = CASE
           WHEN p_banniere_posee THEN now() ELSE banniere_posee_at END,
         banniere_format = CASE
           WHEN p_banniere_posee THEN COALESCE(p_banniere_format, banniere_format)
           ELSE banniere_format END,
         -- ⚠ LE COMPTEUR NE MONTE QUE SUR UNE POSE RÉELLE. Ni « déjà
         --   présente » — la bannière y était avant nous — ni un échec ne
         --   comptent : gonfler le numérateur fausserait le taux de faux
         --   positifs dans le sens flatteur, ce qui est le pire des biais
         --   pour une mesure qu'on présentera à un tiers.
         bannieres_posees = CASE
           WHEN p_banniere_posee THEN bannieres_posees + 1
           ELSE bannieres_posees
         END,
         action_erreur = p_erreur,
         action_etat = COALESCE(p_action_etat, action_etat),
         action_at = now(),
         action_tentatives = CASE
           WHEN p_banniere_posee OR p_action_etat = 'deja-presente'
             THEN action_tentatives
           ELSE action_tentatives + 1
         END,
         restauree_at = CASE
           WHEN p_categorie IS NOT NULL OR p_banniere_posee THEN NULL
           ELSE restauree_at END
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

REVOKE ALL ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)
  TO service_role;

-- ⚠ `marquer_restauration_graph` N'EST PAS TOUCHÉE, ET C'EST TOUT L'INTÉRÊT.
--   Elle continue de remettre `banniere_posee_at` à NULL — l'état bascule —
--   pendant que le compteur, lui, ne bouge pas. C'est l'écart entre les deux
--   qui porte l'information.

-- =============================================================================
-- 4. Le taux de faux positifs
-- =============================================================================

-- ⚠ « FAUX POSITIF » EST ICI UNE DÉFINITION OPÉRATIONNELLE, PAS UNE VÉRITÉ.
--   On compte les bannières qu'un humain a fait retirer. Une alerte juste mais
--   restaurée par confort compte donc comme un faux positif, et une alerte
--   fausse que personne n'a signalée n'y figure pas. C'est la seule mesure
--   dont on dispose sans jugement extérieur — la présenter pour autre chose
--   qu'elle n'est serait malhonnête.
CREATE OR REPLACE FUNCTION public.taux_faux_positifs(
  p_jours INTEGER DEFAULT 90
)
RETURNS TABLE (
  alertes BIGINT,
  bannieres_posees BIGINT,
  restaurees BIGINT,
  cycles_multiples BIGINT,
  taux_pourcent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FILTER (WHERE alerte),
         count(*) FILTER (WHERE bannieres_posees > 0),
         count(*) FILTER (WHERE bannieres_posees > 0 AND restauree_at IS NOT NULL),
         count(*) FILTER (WHERE bannieres_posees > 1),
         round(
           100.0 * count(*) FILTER (WHERE bannieres_posees > 0 AND restauree_at IS NOT NULL)
                 / NULLIF(count(*) FILTER (WHERE bannieres_posees > 0), 0),
           1)
    FROM graph_analyses
   WHERE analyse_at > now() - make_interval(days => GREATEST(1, p_jours));
$$;

REVOKE ALL ON FUNCTION public.taux_faux_positifs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.taux_faux_positifs(INTEGER) TO service_role;

-- =============================================================================
-- 5. Vérification
-- =============================================================================

-- 5.1 La colonne existe et l'existant est repris :
--
--   SELECT count(*)                                   AS analyses,
--          count(*) FILTER (WHERE bannieres_posees > 0) AS deja_banniere,
--          count(*) FILTER (WHERE bannieres_posees > 0
--                             AND restauree_at IS NOT NULL) AS posees_puis_restaurees
--     FROM graph_analyses;
--
--   Les six alertes restaurées doivent apparaître dans la troisième colonne.
--
-- 5.2 Le taux, sur les 90 derniers jours :
--
--   SELECT * FROM taux_faux_positifs();
--
-- 5.3 La file n'a pas bougé — ce compte doit être le même qu'avant :
--
--   SELECT * FROM compter_alertes_sans_banniere();
