-- Le marqueur d'entrée du déplacement, et sa libération
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POURQUOI. Le déplacement ne s'exécute pas en production, et l'état en base
-- ne permet pas de dire s'il n'est PAS APPELÉ ou s'il est COUPÉ EN ROUTE :
-- les deux laissent exactement la même trace — `deplacement_at` NULL,
-- `deplacements` à 0, aucune raison consignée.
--
-- On cesse de deviner. `deplacement_at` sera désormais posé à la PREMIÈRE
-- ligne de la fonction, avant tout appel à Microsoft. Au prochain essai :
--
--   marqueur absent          → la fonction n'est pas entrée ;
--   marqueur seul            → elle est entrée et coupée avant la fin ;
--   marqueur + raison écrite → elle est allée jusqu'à l'échec, qui est nommé.
--
-- ⚠ MAIS UN MARQUEUR QUI NE SE LÈVE PAS DEVIENT UNE FAUSSE ALARME. Posé avant
--   le déplacement, il signifie « ce message est peut-être hors de sa boîte de
--   réception » : le voyant « messages en transit » rougit, et le balayage part
--   chercher dans le dossier de service un message qui n'en a jamais bougé.
--   D'où le second paramètre : quand l'échec survient AVANT la sortie de la
--   boîte, on sait que le message n'a pas bougé, et on libère.
-- ─────────────────────────────────────────────────────────────────────────

-- DROP puis CREATE : on ajoute un paramètre, et une surcharge laisserait deux
-- versions de la fonction en place — dont l'ancienne, qui ne libère rien.
DROP FUNCTION IF EXISTS public.marquer_echec_deplacement(UUID, TEXT);

CREATE FUNCTION public.marquer_echec_deplacement(
  p_analyse_id UUID,
  p_erreur TEXT,
  /** Le message a-t-il quitté la boîte de réception avant l'échec ? */
  p_sorti BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET action_erreur = left(
           COALESCE(NULLIF(action_erreur, '') || ' | ', '')
             || 'déplacement : ' || COALESCE(p_erreur, 'raison inconnue'),
           500),
         action_at = now(),
         -- ⚠ ON NE LIBÈRE QUE CE QU'ON SAIT ÊTRE RESTÉ EN PLACE. Si le message
         --   est sorti, le drapeau est la seule chose qui dise au balayage
         --   d'aller le rechercher : l'effacer abandonnerait un message
         --   légitime hors de sa boîte de réception.
         deplacement_at = CASE WHEN p_sorti THEN deplacement_at ELSE NULL END
   WHERE id = p_analyse_id;
$$;

REVOKE ALL ON FUNCTION public.marquer_echec_deplacement(UUID, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_echec_deplacement(UUID, TEXT, BOOLEAN)
  TO service_role;

-- =============================================================================
-- Vérification
-- =============================================================================

-- 1. Une seule version de la fonction, celle à trois paramètres :
--
--   SELECT count(*) AS versions, bool_or(p.pronargs = 3) AS trois_parametres
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'marquer_echec_deplacement';
--   -- Attendu : versions = 1, trois_parametres = t. Deux versions
--   -- signifieraient que l'ancienne, qui ne libère pas le marqueur, est
--   -- encore là et peut être appelée.
--
-- 2. Après le prochain message d'essai, la question tranchée :
--
--   SELECT message_id, deplacement_at, deplacements, action_erreur
--     FROM graph_analyses ORDER BY analyse_at DESC LIMIT 1;
--
--   deplacement_at NULL et action_erreur sans « déplacement : »
--       → la fonction n'a PAS été appelée. Le défaut est en amont.
--   deplacement_at renseigné et rien d'autre
--       → elle est entrée et a été coupée. Le défaut est une interruption.
--   action_erreur contenant « déplacement : … »
--       → elle est allée au bout, et la raison est écrite là.
