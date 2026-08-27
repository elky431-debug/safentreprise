-- Déclenchement automatique du worker et de la maintenance
-- Appliquer via le SQL Editor Supabase, APRÈS avoir rempli la section 2.
--
-- OBJET : plus rien à lancer à la main.
--
--   worker      toutes les minutes   draine la file, analyse, pose la bannière
--   maintenance toutes les 10 min    renouvelle les abonnements, rattrape le delta
--
-- pg_cron déclenche, pg_net appelle. L'appel est ASYNCHRONE : pg_net dépose la
-- requête et rend la main aussitôt. La tâche planifiée ne bloque donc jamais,
-- même si une exécution du worker prend vingt secondes.
--
-- DEUX WORKERS EN MÊME TEMPS, EST-CE UN PROBLÈME ? Non. reclamer_travaux_graph
-- utilise FOR UPDATE SKIP LOCKED : deux exécutions concurrentes se partagent la
-- file au lieu de se marcher dessus. C'est vérifié par un test.

-- =============================================================================
-- 1. Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================================
-- 2. Paramètres — À REMPLIR AVANT D'EXÉCUTER
-- =============================================================================

-- Le secret du worker ne peut pas être écrit en dur dans la définition de la
-- tâche : cron.job est lisible par tout rôle ayant accès au schéma cron. On le
-- range dans une table dont personne d'autre que le propriétaire ne peut rien
-- lire.
CREATE TABLE IF NOT EXISTS parametres_systeme (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  maj_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE parametres_systeme ENABLE ROW LEVEL SECURITY;
-- Aucune politique : donc aucune ligne visible, pour personne. Seuls le
-- propriétaire de la table et les rôles qui contournent la RLS y accèdent.
REVOKE ALL ON TABLE parametres_systeme FROM PUBLIC, anon, authenticated;

-- ▼▼▼ REMPLACER LES DEUX VALEURS CI-DESSOUS ▼▼▼
--
--   base_url      l'adresse du déploiement, SANS barre oblique finale
--   worker_secret la valeur de WORKER_SECRET posée sur Netlify

INSERT INTO parametres_systeme (cle, valeur) VALUES
  ('base_url', 'https://claude-graph-webhook--majestic-clafoutis-c4bb87.netlify.app'),
  ('worker_secret', 'REMPLACER_PAR_LE_VRAI_SECRET')
ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_at = now();

-- ▲▲▲ REMPLACER LES DEUX VALEURS CI-DESSUS ▲▲▲

-- =============================================================================
-- 3. Appel HTTP
-- =============================================================================

-- Un seul endroit qui sait construire l'appel. Les tâches planifiées n'ont
-- ainsi jamais le secret dans leur définition.
CREATE OR REPLACE FUNCTION public.appeler_route_interne(p_chemin TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_base TEXT;
  v_secret TEXT;
BEGIN
  SELECT valeur INTO v_base FROM parametres_systeme WHERE cle = 'base_url';
  SELECT valeur INTO v_secret FROM parametres_systeme WHERE cle = 'worker_secret';

  IF v_base IS NULL OR v_secret IS NULL OR v_secret = 'REMPLACER_PAR_LE_VRAI_SECRET' THEN
    RAISE WARNING 'appeler_route_interne : paramètres absents ou non renseignés (%)', p_chemin;
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := v_base || p_chemin,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-safentreprise-worker', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.appeler_route_interne(TEXT) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Tâches planifiées
-- =============================================================================

-- Rejouable : on retire les tâches existantes avant de les reposer.
DO $$
DECLARE j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY['safentreprise-worker', 'safentreprise-maintenance'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- Le worker, toutes les minutes.
SELECT cron.schedule(
  'safentreprise-worker',
  '* * * * *',
  $$ SELECT public.appeler_route_interne('/api/microsoft/worker'); $$
);

-- La maintenance, toutes les 10 minutes. Le renouvellement n'a pas besoin de
-- plus — on renouvelle 24 h avant l'échéance — et le rattrapage delta ne
-- regarde chaque boîte qu'au quart d'heure.
SELECT cron.schedule(
  'safentreprise-maintenance',
  '*/10 * * * *',
  $$ SELECT public.appeler_route_interne('/api/microsoft/maintenance'); $$
);

-- =============================================================================
-- 5. Vérification
-- =============================================================================

-- Les tâches et leur prochaine exécution :
--
--   SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
--
-- Les dix dernières exécutions, et si elles ont abouti :
--
--   SELECT j.jobname, r.status, r.return_message, r.start_time
--     FROM cron.job_run_details r
--     JOIN cron.job j USING (jobid)
--    WHERE j.jobname LIKE 'safentreprise-%'
--    ORDER BY r.start_time DESC LIMIT 10;
--
-- Ce que les appels HTTP ont RÉELLEMENT renvoyé — c'est ici qu'on voit un 401
-- pour secret erroné, ou un 500 :
--
--   SELECT id, status_code, left(content, 300) AS reponse, created
--     FROM net._http_response ORDER BY created DESC LIMIT 10;
--
-- ⚠ net._http_response grossit sans fin sur certaines versions de pg_net.
--   Si la table dépasse quelques dizaines de milliers de lignes :
--
--   DELETE FROM net._http_response WHERE created < now() - INTERVAL '2 days';

-- =============================================================================
-- 6. Tout arrêter
-- =============================================================================

--   SELECT cron.unschedule('safentreprise-worker');
--   SELECT cron.unschedule('safentreprise-maintenance');
--
-- Cela suspend l'automatisation SANS rien défaire de ce qui a été posé. Pour
-- retirer les bannières : npm run graph:restaurer
