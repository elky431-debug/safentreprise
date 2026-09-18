-- Le webhook réveille le worker au lieu de le laisser attendre le tour de cron.
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- ============================================================================
-- POURQUOI, ET CE QUE ÇA VAUT
-- ============================================================================
--
-- Mesuré le 17 septembre 2026 sur trois trajets réels, après la migration
-- 20260917 qui a bouché le dernier trou de la chaîne :
--
--   t1  réception Microsoft -> webhook        1,2  1,6  4,2  s
--   t2  attente en file                      13,9 24,7 57,7  s   <-- 80 %
--   t3  worker (Graph + analyse)              0,6  1,1  0,9  s
--   t4  écriture de la bannière               1,0  1,0  0,8  s
--   t5  déplacement, retour en boîte          0,8    –    –  s
--
-- L'attente en file représente 80 % du délai vécu, et ce n'est pas une
-- lenteur : c'est une LOTERIE entre 0 et 60 s selon l'instant où le message
-- tombe dans la minute de cron. Microsoft notifie en 1,2 s et l'analyse
-- complète prend moins d'une seconde — il n'y a rien à optimiser ailleurs.
--
-- ⚠ CE N'EST PAS « FAIRE TOURNER LE WORKER PLUS SOUVENT ». En régime
--   permanent il tournera MOINS : aujourd'hui il s'exécute 1 440 fois par jour
--   quoi qu'il arrive, dont l'immense majorité à vide. Ici il s'exécute quand
--   il y a quelque chose à faire. Le cron à la minute reste en place comme
--   filet, pour les notifications perdues et le rattrapage delta.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. L'anti-rafale
-- =============================================================================

-- ⚠ SANS LUI, VINGT MESSAGES SIMULTANÉS FONT VINGT APPELS. Une rafale — un
--   envoi groupé, une boîte qui se synchronise — insérerait vingt lignes en
--   file, donc vingt réveils, donc vingt fonctions Netlify en parallèle pour
--   un travail que le premier worker aurait déjà réclamé. `FOR UPDATE SKIP
--   LOCKED` empêche qu'ils se marchent dessus, mais pas qu'on les paie.
--
--   La fenêtre est volontairement courte : 5 secondes. Assez pour absorber une
--   rafale, assez peu pour qu'un message isolé arrivé juste après un réveil
--   n'attende pas. Dans le pire cas il attend 5 s, contre 60 s aujourd'hui.
INSERT INTO parametres_systeme (cle, valeur)
VALUES ('worker_dernier_reveil', to_char(now() - interval '1 hour',
                                         'YYYY-MM-DD"T"HH24:MI:SS.USOF'))
ON CONFLICT (cle) DO NOTHING;

-- =============================================================================
-- 2. Le réveil
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reveiller_worker_graph()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gagne BOOLEAN := false;
BEGIN
  -- ⚠ L'ANTI-RAFALE EST DANS LE `WHERE`, PAS DANS UN `IF`. Lire la date puis
  --   décider puis écrire laisserait passer deux réveils concurrents entre la
  --   lecture et l'écriture. Ici c'est un seul UPDATE conditionnel : Postgres
  --   verrouille la ligne, et le second appel ne trouve plus la condition
  --   vraie. Un seul gagne, toujours.
  UPDATE parametres_systeme
     SET valeur = to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
         maj_at = now()
   WHERE cle = 'worker_dernier_reveil'
     AND valeur::timestamptz < now() - interval '5 seconds';

  GET DIAGNOSTICS v_gagne = ROW_COUNT;
  IF NOT v_gagne THEN
    RETURN false;                 -- un réveil vient de partir, celui-ci suffit
  END IF;

  -- ⚠ `appeler_route_interne` PASSE PAR pg_net, DONC C'EST ASYNCHRONE, ET
  --   C'EST TOUTE LA RAISON DE PASSER PAR LA BASE. Depuis la fonction Netlify
  --   du webhook, un `fetch` non attendu peut être tué au moment où la réponse
  --   part — le réveil serait perdu silencieusement, une fois sur deux, sans
  --   que rien ne le signale. pg_net met la requête en file dans la base et la
  --   livre depuis son propre processus : elle ne dépend plus de la durée de
  --   vie de la fonction.
  --
  --   Elle porte aussi le `worker_secret`, qui reste dans `parametres_systeme`
  --   et n'a donc pas à être exposé à la route du webhook.
  PERFORM public.appeler_route_interne('/api/microsoft/worker');
  RETURN true;
EXCEPTION
  -- ⚠ UN RÉVEIL RATÉ NE DOIT JAMAIS FAIRE ÉCHOUER LA MISE EN FILE. Le message
  --   en file est l'essentiel ; le réveil n'est qu'une accélération. Si pg_net
  --   est indisponible ou la base_url absente, on perd 30 secondes — le cron
  --   reprendra — mais on ne perd pas la notification.
  WHEN OTHERS THEN
    RAISE WARNING 'reveiller_worker_graph : %', SQLERRM;
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.reveiller_worker_graph() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. Le déclencheur
-- =============================================================================

-- ⚠ UN DÉCLENCHEUR SUR L'INSERTION, PAS UN APPEL DANS LA RPC. Même raison que
--   pour `visible_at` : la mise en file se fait aujourd'hui par
--   `enregistrer_notification_graph`, mais le rattrapage delta insère aussi
--   dans cette table, et un troisième chemin ajouté demain ferait pareil.
--   Accrocher le réveil à l'INSERTION les couvre tous.
--
-- ⚠ ET `ON CONFLICT DO UPDATE` NE DÉCLENCHE PAS `AFTER INSERT`, ce qui tombe
--   bien : une notification rejouée pour un message déjà en file emprunte le
--   chemin UPDATE, donc ne réveille personne. C'est le comportement voulu — il
--   n'y a rien de nouveau à traiter.
CREATE OR REPLACE FUNCTION public.reveil_sur_mise_en_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.reveiller_worker_graph();
  RETURN NULL;                    -- AFTER trigger : la valeur est ignorée
END;
$$;

DROP TRIGGER IF EXISTS trg_file_reveil ON graph_file_attente;

-- AFTER INSERT : le réveil part une fois la ligne écrite, jamais avant. Si la
-- transaction est annulée, la requête pg_net l'est avec elle — on ne réveille
-- pas pour un travail qui n'existe pas.
CREATE TRIGGER trg_file_reveil
  AFTER INSERT ON graph_file_attente
  FOR EACH ROW
  EXECUTE FUNCTION public.reveil_sur_mise_en_file();

-- =============================================================================
-- 4. Vérification
-- =============================================================================
--
-- Le déclencheur est en place :
--
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'graph_file_attente'::regclass AND NOT tgisinternal;
--
-- Le cron est TOUJOURS là — il doit l'être, c'est le filet :
--
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'safentreprise-worker';
--
-- Les réveils effectivement partis, et leur sort :
--
--   SELECT id, created, url, status_code, error_msg
--     FROM net._http_response
--    ORDER BY created DESC LIMIT 20;
--
-- ⚠ REMESURER APRÈS, AVEC `supabase/mesures/delai-banniere.sql`. Le chiffre à
--   regarder est `t2_attente_file` : il doit passer d'une loterie 0–60 s à
--   quelques secondes. Si `t2` ne bouge pas, le réveil ne part pas — regarder
--   `net._http_response` ci-dessus AVANT de toucher à autre chose.
