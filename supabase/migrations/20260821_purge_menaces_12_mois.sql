-- Purge automatique des alertes de l'extension au-delà de 12 mois
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- POURQUOI : la politique de confidentialité (section 2.5) engage
-- Safentreprise sur une conservation des alertes limitée à 12 mois, « puis
-- suppression automatique ». Sans tâche planifiée, cet engagement n'est pas
-- tenu — et il sera vérifié lors de la revue du Chrome Web Store.
--
-- LA DURÉE EST UN ENGAGEMENT JURIDIQUE, PAS UN RÉGLAGE. Elle est écrite en
-- dur dans la fonction ci-dessous. La changer impose de modifier d'abord le
-- texte de /politique-de-confidentialite, sans quoi les deux divergent.
--
-- HORS PÉRIMÈTRE : activations_extension n'est pas purgée ici. Ces données
-- sont conservées « pendant la durée de l'abonnement, supprimées à la
-- résiliation » : c'est un événement contractuel, pas une échéance de date.
-- La suppression se fait par la cascade sur companies à la clôture du compte.
--
-- Cette migration est idempotente : elle peut être relancée sans dommage.

-- =============================================================================
-- 1. Extension pg_cron
-- =============================================================================

-- pg_cron s'installe dans son propre schéma « cron ».
-- Si cette ligne échoue faute de privilèges, active l'extension depuis
-- l'interface Supabase : Database → Extensions → pg_cron, puis relance la
-- migration à partir de la section 2.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================================================
-- 2. Index de purge
-- =============================================================================

-- L'index existant est (company_id, detecte_at DESC) : il sert l'affichage
-- par société, mais ne permet pas de balayer efficacement toutes sociétés
-- confondues sur la seule date. La purge a besoin du sien.
CREATE INDEX IF NOT EXISTS idx_menaces_detecte_at
  ON menaces_detectees(detecte_at);

-- =============================================================================
-- 3. Fonction de purge
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purger_menaces_expirees()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supprimees INTEGER;
BEGIN
  -- 12 mois glissants à compter de la détection, pas de la création de la
  -- ligne : c'est la date de l'événement qui fait courir la conservation.
  DELETE FROM menaces_detectees
   WHERE detecte_at < now() - INTERVAL '12 months';

  GET DIAGNOSTICS supprimees = ROW_COUNT;

  -- Trace lisible dans cron.job_run_details et dans les logs Postgres.
  RAISE LOG 'purger_menaces_expirees : % alerte(s) supprimée(s)', supprimees;

  RETURN supprimees;
END;
$$;

COMMENT ON FUNCTION public.purger_menaces_expirees() IS
  'Supprime les alertes de plus de 12 mois. Durée alignée sur la politique de confidentialité, section 2.5. Exécutée quotidiennement par pg_cron.';

-- La fonction est SECURITY DEFINER et supprime des données : elle ne doit
-- être appelable ni par l'API publique, ni par un utilisateur connecté.
-- Seul pg_cron, qui s'exécute en tant que propriétaire, l'invoque.
REVOKE ALL ON FUNCTION public.purger_menaces_expirees() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purger_menaces_expirees() FROM anon;
REVOKE ALL ON FUNCTION public.purger_menaces_expirees() FROM authenticated;

-- =============================================================================
-- 4. Planification quotidienne
-- =============================================================================

-- pg_cron raisonne en UTC. 03:30 UTC = 04:30 en heure d'hiver française,
-- 05:30 en heure d'été : dans tous les cas hors des heures d'usage.
--
-- On retire d'abord l'éventuelle tâche existante : selon la version de
-- pg_cron, cron.schedule() remplace ou duplique une tâche de même nom.
SELECT cron.unschedule('purge-menaces-12-mois')
 WHERE EXISTS (
   SELECT 1 FROM cron.job WHERE jobname = 'purge-menaces-12-mois'
 );

SELECT cron.schedule(
  'purge-menaces-12-mois',
  '30 3 * * *',
  $cron$ SELECT public.purger_menaces_expirees(); $cron$
);

-- =============================================================================
-- 5. Vérification
-- =============================================================================

-- La tâche est-elle enregistrée et active ?
--
--   SELECT jobid, jobname, schedule, active, command
--     FROM cron.job
--    WHERE jobname = 'purge-menaces-12-mois';
--
-- Les dernières exécutions et leur résultat :
--
--   SELECT status, return_message, start_time, end_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job
--                    WHERE jobname = 'purge-menaces-12-mois')
--    ORDER BY start_time DESC
--    LIMIT 10;
--
-- Combien d'alertes seraient supprimées à l'instant, sans rien supprimer :
--
--   SELECT count(*) FROM menaces_detectees
--    WHERE detecte_at < now() - INTERVAL '12 months';
--
-- Déclencher la purge manuellement (à exécuter en tant que postgres, donc
-- depuis le SQL Editor et non via l'API) :
--
--   SELECT public.purger_menaces_expirees();
