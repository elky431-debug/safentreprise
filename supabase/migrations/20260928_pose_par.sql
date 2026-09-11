-- Qui a posé cette bannière
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POURQUOI. Trois fois de suite, j'ai conclu par déduction quel chemin avait
-- posé une bannière, et trois fois je me suis trompé. Le recensement
-- mécanique donne ONZE appels à `marquer_action_graph`, répartis sur cinq
-- chemins qui écrivent réellement la pose. Aucun ne laisse son nom.
--
-- Une trace qui demande un raisonnement pour être lue n'est pas une trace.
-- Chaque chemin écrit désormais SON PROPRE NOM, et `pose_par` à NULL après
-- cette migration signifie « un chemin non instrumenté » — donc un chemin
-- oublié, ce qui est précisément l'erreur qu'on a répétée.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS pose_par TEXT;

COMMENT ON COLUMN graph_analyses.pose_par IS
  'Nom du chemin de code qui a écrit la pose de bannière. NULL = pose antérieure à cette colonne, ou chemin non instrumenté.';

-- ⚠ DROP PUIS CREATE : on ajoute un paramètre. `CREATE OR REPLACE` créerait
--   une SURCHARGE et laisserait l'ancienne version — donc un chemin capable
--   de poser sans laisser son nom, ce qu'on veut rendre impossible.
--
--   Le paramètre a une valeur par défaut : le code déjà déployé, qui appelle
--   avec sept arguments nommés, continue de fonctionner sans interruption
--   pendant le redéploiement. Il écrira simplement `pose_par` à NULL.
DROP FUNCTION IF EXISTS public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT);

CREATE FUNCTION public.marquer_action_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_categorie TEXT,
  p_banniere_posee BOOLEAN,
  p_erreur TEXT DEFAULT NULL,
  p_action_etat TEXT DEFAULT NULL,
  p_banniere_format TEXT DEFAULT NULL,
  p_pose_par TEXT DEFAULT NULL
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
         -- ⚠ LE NOM N'EST ÉCRIT QUE SUR UNE POSE. Un chemin qui constate un
         --   échec n'est pas celui qui a posé : écraser le nom du poseur avec
         --   le sien effacerait la réponse qu'on cherche.
         pose_par = CASE
           WHEN p_banniere_posee THEN COALESCE(p_pose_par, 'chemin-non-instrumente')
           ELSE pose_par END,
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

REVOKE ALL ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- Le contrôle nomme les poseurs
-- =============================================================================

DROP FUNCTION IF EXISTS public.etat_dossiers_service();

CREATE FUNCTION public.etat_dossiers_service()
RETURNS TABLE (
  boites_actives BIGINT,
  avec_dossier BIGINT,
  bannieres_24h BIGINT,
  deplacees_24h BIGINT,
  reussis_24h BIGINT,
  echecs_24h BIGINT,
  non_tentes_24h BIGINT,
  sans_trace_24h BIGINT,
  discordances_24h BIGINT,
  poseurs_24h TEXT,
  derniere_note TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recentes AS (
    SELECT * FROM graph_analyses WHERE banniere_posee_at > now() - interval '24 hours'
  )
  SELECT
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif'),
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif' AND b.dossier_service_id IS NOT NULL),
    (SELECT count(*) FROM recentes),
    (SELECT count(*) FROM recentes WHERE deplacements > 0),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'reussi'),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'echec'),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'non-tente'),
    (SELECT count(*) FROM recentes WHERE deplacement_etat IS NULL),
    (SELECT count(*) FROM recentes WHERE deplacement_note LIKE 'discordance%'),
    -- La réponse à « qui pose ? », sans aucune déduction.
    (SELECT string_agg(nom || ' ×' || n, ', ' ORDER BY n DESC)
       FROM (SELECT COALESCE(pose_par, 'inconnu') AS nom, count(*) AS n
               FROM recentes GROUP BY 1) AS r),
    (SELECT deplacement_note FROM recentes
      WHERE deplacement_note IS NOT NULL
      ORDER BY analyse_at DESC LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.etat_dossiers_service()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_dossiers_service() TO service_role;

-- =============================================================================
-- Vérification
-- =============================================================================

-- 1. La colonne est là, et il n'existe QU'UNE version de la fonction —
--    à huit paramètres. Deux versions voudraient dire qu'un chemin peut
--    encore poser sans laisser son nom :
--
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'graph_analyses' AND column_name = 'pose_par') AS colonne,
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'marquer_action_graph')  AS versions,
--     (SELECT max(p.pronargs) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'marquer_action_graph')  AS parametres;
--
--   Attendu : colonne = 1, versions = 1, parametres = 8.
--
-- 2. Au prochain message, la question est répondue sans raisonnement :
--
--   SELECT message_id, pose_par, deplacement_etat, deplacement_note
--     FROM graph_analyses ORDER BY analyse_at DESC LIMIT 1;
--
--   pose_par nomme le chemin. S'il vaut « chemin-non-instrumente », c'est
--   qu'il reste un appel que le recensement a manqué.
