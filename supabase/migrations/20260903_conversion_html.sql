-- Conversion des corps texte en HTML
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- L'expérience a tranché : Graph accepte de faire passer un message REÇU de
-- « text » à « html » sur un PATCH, balise enregistrée non échappée, et la
-- remise en état rend le message identique. La bannière HTML devient donc le
-- comportement normal pour tous les messages, et la bannière texte devient un
-- repli pour le cas où la conversion échouerait sur un message donné.
--
-- Cela n'est possible que parce que le corps d'origine est désormais conservé
-- (20260902) : la restauration réécrit le texte exact avec son contentType
-- d'avant, au lieu de découper.
--
-- Cette migration ajoute de quoi RATTRAPER les messages qui portent
-- aujourd'hui une bannière texte.

-- =============================================================================
-- 1. Format de la bannière posée
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS banniere_format TEXT;

COMMENT ON COLUMN graph_analyses.banniere_format IS
  'html | texte — NULL sur les lignes antérieures, que le rattrapage inspecte.';

-- =============================================================================
-- 2. Enregistrer le format avec l'action
-- =============================================================================

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

-- =============================================================================
-- 3. Ce qu'il reste à convertir
-- =============================================================================

-- Les messages qui portent une bannière NON HTML — texte connu, ou format
-- inconnu parce qu'antérieur à cette colonne. Dans le doute on les inspecte :
-- le rattrapage lit le corps réel et, s'il est déjà en HTML, se contente
-- d'enregistrer le format sans rien modifier.
--
-- On ne renvoie QUE les messages dont le corps d'origine est encore conservé :
-- sans lui, convertir rendrait la restauration impossible — la découpe ne sait
-- pas défaire un changement de format.
CREATE OR REPLACE FUNCTION public.bannieres_a_convertir(p_limite INTEGER DEFAULT 10)
RETURNS TABLE (
  message_id TEXT,
  company_id UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  niveau TEXT,
  score INTEGER,
  signaux JSONB,
  banniere_format TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.message_id, a.company_id, t.tenant_id, b.graph_user_id, b.upn,
         a.niveau, a.score, a.signaux, a.banniere_format
    FROM graph_analyses a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
    JOIN graph_corps_originaux c
      ON c.company_id = a.company_id AND c.message_id = a.message_id
   WHERE a.alerte
     AND a.banniere_posee_at IS NOT NULL
     AND a.restauree_at IS NULL
     AND COALESCE(a.banniere_format, '') <> 'html'
     AND t.statut = 'actif'
     AND b.actif
     AND a.action_tentatives < 5
   ORDER BY a.analyse_at DESC
   LIMIT GREATEST(1, LEAST(p_limite, 25));
$$;

-- =============================================================================
-- 4. Droits
-- =============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)',
    'bannieres_a_convertir(INTEGER)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- ⚠ TOUTES les anciennes signatures doivent disparaître. Elles se sont
--   accumulées au fil des migrations (5, puis 6, puis 7 paramètres). Comme
--   PostgREST appelle par NOM de paramètre, un appel qui ne renseigne que les
--   cinq premiers correspondrait à plusieurs surcharges à la fois et Postgres
--   refuserait de trancher — l'action ne serait alors plus jamais enregistrée.
--
--   On supprime tout ce qui n'est pas la version courante à sept paramètres.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'marquer_action_graph'
       AND p.pronargs <> 7
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.signature);
    RAISE NOTICE 'Ancienne signature supprimée : %', r.signature;
  END LOOP;
END $$;

-- =============================================================================
-- 5. Vérification
-- =============================================================================

--   SELECT banniere_format, count(*) FROM graph_analyses
--    WHERE banniere_posee_at IS NOT NULL AND restauree_at IS NULL
--    GROUP BY 1;
--
-- Reste à convertir :
--
--   SELECT message_id, banniere_format FROM bannieres_a_convertir(25);
