-- L'adresse que la tâche planifiée appelle vraiment
-- Appliquer via le SQL Editor Supabase. Idempotente. Lecture seule.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT QUI A COÛTÉ UNE SEMAINE ENTIÈRE.
--
-- Le worker n'est pas appelé par l'hébergeur : il est appelé DEPUIS LA BASE,
-- par pg_cron + pg_net, à une adresse rangée dans `parametres_systeme`. Cette
-- adresse pointait sur un PERMALIEN DE DÉPLOIEMENT — un instantané figé et
-- immuable. Quatre déploiements successifs n'ont donc rien changé au
-- comportement observé : le code poussé n'a jamais été exécuté.
--
-- Rien ne le signalait. Le produit paraissait fonctionner : les messages
-- étaient analysés, les bannières posées, les alertes envoyées — par du code
-- vieux de trois semaines. Chaque diagnostic portait sur des lignes que la
-- production n'exécutait pas.
--
-- ⚠ LE SECRET N'EST JAMAIS RENDU. Cette fonction dit s'il est renseigné, pas
--   ce qu'il vaut. Un contrôle de diagnostic ne doit pas devenir un moyen de
--   lire les secrets : c'est la raison pour laquelle il est en base plutôt
--   que dans la définition de la tâche, lisible par tout rôle du schéma cron.
--
-- ⚠ NI AUCUN CONTENU DE RÉPONSE. On rend le code HTTP et l'horodatage du
--   dernier appel, pas le corps : une réponse du worker contient des
--   identifiants de messages, qui n'ont rien à faire dans un diagnostic.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.etat_planification()
RETURNS TABLE (
  base_url TEXT,
  secret_renseigne BOOLEAN,
  taches TEXT,
  dernier_appel TIMESTAMPTZ,
  dernier_statut INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT valeur INTO base_url FROM parametres_systeme WHERE cle = 'base_url';
  SELECT valeur INTO v_secret FROM parametres_systeme WHERE cle = 'worker_secret';

  secret_renseigne :=
    v_secret IS NOT NULL
    AND v_secret <> ''
    AND v_secret <> 'REMPLACER_PAR_LE_VRAI_SECRET';

  -- ⚠ CHAQUE LECTURE EST ISOLÉE. `cron` et `net` sont des schémas
  --   d'extension : selon les droits, ils peuvent être hors de portée. Une
  --   lecture impossible ne doit pas faire échouer tout le contrôle — ce
  --   serait remplacer un angle mort par un autre.
  BEGIN
    SELECT string_agg(j.jobname || ' (' || j.schedule || ')' ||
                      CASE WHEN j.active THEN '' ELSE ' — DÉSACTIVÉE' END, ', '
                      ORDER BY j.jobname)
      INTO taches
      FROM cron.job j
     WHERE j.jobname LIKE 'safentreprise-%';
  EXCEPTION WHEN OTHERS THEN
    taches := 'illisible (' || SQLERRM || ')';
  END;

  BEGIN
    SELECT r.created, r.status_code
      INTO dernier_appel, dernier_statut
      FROM net._http_response r
     ORDER BY r.created DESC
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    dernier_appel := NULL;
    dernier_statut := NULL;
  END;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.etat_planification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_planification() TO service_role;

-- =============================================================================
-- Vérification
-- =============================================================================

-- 1. La fonction existe et reste fermée au navigateur :
--
--   SELECT count(*) AS versions,
--          bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS ouverte
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'etat_planification';
--   -- Attendu : versions = 1, ouverte = f.
--
-- 2. CE QU'ELLE DOIT DIRE AUJOURD'HUI :
--
--   SELECT * FROM etat_planification();
--
--   `base_url` doit être le domaine de production, et RIEN D'AUTRE. Une
--   adresse de la forme https://<identifiant>--<site>.netlify.app est un
--   permalien de déploiement : il est figé pour toujours, et tout ce qui sera
--   poussé ensuite n'aura aucun effet. C'est exactement ce qui s'est produit.
--
--   `secret_renseigne` doit valoir t, et les deux tâches doivent apparaître
--   sans la mention « DÉSACTIVÉE ».
