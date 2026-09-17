-- Mesure du délai réel entre la réception d'un message et le moment où le
-- salarié voit la bannière.
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- OBJET : combler le seul trou de la chaîne. `banniere_posee_at` marque la
-- réponse de Graph à l'écriture du corps — mais sur Outlook pour Windows le
-- message n'est PAS relu à ce moment-là. Il faut le déplacer hors de la boîte
-- puis l'y ramener, et c'est seulement au retour que le salarié voit la
-- bannière. Ces appels-là n'étaient horodatés nulle part.
--
-- ⚠ CE QU'ON NE MESURE PAS, ON NE PEUT PAS LE RÉDUIRE. C'est la raison d'être
--   de cette migration : le chronomètre du dirigeant affichait deux minutes
--   quand la base, elle, ne savait rendre compte que d'une partie du trajet.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. L'instant où le message redevient visible
-- =============================================================================

-- ⚠ CE N'EST PAS UN DOUBLON DE `deplacement_at`, C'EST SON INVERSE.
--   `deplacement_at` est une INTENTION : posé avant le déplacement, effacé au
--   retour. Une ligne qui le porte encore désigne un message peut-être resté
--   dans le dossier de service. Il ne peut donc pas servir de mesure : la
--   valeur qui dirait « c'est fini » est précisément celle qu'on efface.
--
--   `visible_at` est un FAIT, et il ne s'efface jamais : l'instant où le
--   message est revenu en boîte de réception avec sa bannière. C'est le seul
--   horodatage de la table qui corresponde à ce qu'un salarié voit.
ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS visible_at TIMESTAMPTZ;

COMMENT ON COLUMN graph_analyses.visible_at IS
  'Retour en boîte de réception après le déplacement de rafraîchissement : '
  'l''instant où la bannière devient visible pour le salarié. '
  'NULL = jamais revenu, ou aucun déplacement (niveau faible, mode catégorie).';

-- Pour sortir les trajets complets sans balayer la table.
CREATE INDEX IF NOT EXISTS idx_analyses_visible
  ON graph_analyses(company_id, visible_at DESC) WHERE visible_at IS NOT NULL;

-- =============================================================================
-- 2. Le déclencheur
-- =============================================================================

-- ⚠ UN DÉCLENCHEUR, ET PAS TROIS FONCTIONS RÉÉCRITES. Le retour en boîte est
--   acté à TROIS endroits : `renommer_message_graph`, et les deux sorties
--   « déjà à jour » et « rattachée » de `rattacher_message_graph`. Les trois
--   font la même chose — remettre `deplacement_at` à NULL — et un quatrième
--   chemin ajouté demain ferait pareil.
--
--   Poser la mesure sur la TRANSITION plutôt que dans chaque fonction lui fait
--   couvrir les trois d'un coup, et celles qui n'existent pas encore. C'est
--   aussi ce qui évite de rouvrir trois fonctions `SECURITY DEFINER` pour y
--   ajouter une ligne, avec le risque d'en abîmer une au passage.
CREATE OR REPLACE FUNCTION public.marquer_message_visible()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ⚠ SEULEMENT LA PREMIÈRE FOIS. Un message peut être redéplacé — restauration,
  --   webhook rejoué, seconde passe. Le délai qui nous intéresse est celui que
  --   le salarié a vécu : la première apparition. Sans cette garde, une
  --   restauration trois jours plus tard écraserait la mesure par un chiffre
  --   qui ne veut plus rien dire.
  IF OLD.deplacement_at IS NOT NULL
     AND NEW.deplacement_at IS NULL
     AND NEW.visible_at IS NULL THEN
    NEW.visible_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analyses_visible ON graph_analyses;

-- BEFORE UPDATE : on modifie NEW avant l'écriture, donc sans second UPDATE.
CREATE TRIGGER trg_analyses_visible
  BEFORE UPDATE ON graph_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.marquer_message_visible();

-- =============================================================================
-- 3. Vérification
-- =============================================================================
--
-- Le déclencheur est en place :
--
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'graph_analyses'::regclass AND NOT tgisinternal;
--
-- ⚠ LES LIGNES ANTÉRIEURES RESTENT À NULL, ET C'EST NORMAL. La colonne ne peut
--   pas être reconstituée : l'instant du retour n'a jamais été écrit nulle
--   part. La mesure ne vaut donc que pour les messages traités APRÈS
--   l'application de cette migration. Ne pas conclure d'un `visible_at` vide
--   sur un message ancien que le déplacement a échoué.
