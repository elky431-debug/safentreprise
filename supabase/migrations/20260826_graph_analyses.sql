-- Analyses des messages Microsoft 365 — verdicts du moteur de détection
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- OBJET : le worker draine graph_file_attente, récupère chaque message,
-- l'analyse, et écrit ici son verdict. À ce stade il ne touche PAS au mail :
-- on veut observer les scores sur de vrais messages avant de donner le droit
-- d'écrire, parce qu'un faux positif défigure définitivement un mail légitime.
--
-- AUCUN CONTENU DE MESSAGE N'EST STOCKÉ. Le corps transite en mémoire le temps
-- de l'analyse et n'est jamais écrit. Seules des métadonnées et le verdict
-- sont conservés — même principe que menaces_detectees.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Statut « en_cours » dans la file
-- =============================================================================

-- Un travail réclamé par un worker passe en « en_cours » : un second worker,
-- ou la même fonction rappelée avant la fin, ne le reprend pas.
ALTER TABLE graph_file_attente
  DROP CONSTRAINT IF EXISTS graph_file_attente_statut_check;

ALTER TABLE graph_file_attente
  ADD CONSTRAINT graph_file_attente_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'traite', 'echec', 'ignore'));

-- Quand un travail a été réclamé, pour repérer ceux qui restent coincés.
ALTER TABLE graph_file_attente
  ADD COLUMN IF NOT EXISTS reclame_at TIMESTAMPTZ;

-- =============================================================================
-- 2. Table des analyses
-- =============================================================================

CREATE TABLE IF NOT EXISTS graph_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boite_id UUID NOT NULL REFERENCES boites_surveillees(id) ON DELETE CASCADE,

  message_id TEXT NOT NULL,

  -- Métadonnées du message. Mêmes champs que menaces_detectees, volontairement.
  expediteur_nom TEXT,
  expediteur_email TEXT,
  nom_signe TEXT,
  objet TEXT,
  employe_email TEXT,
  recu_at TIMESTAMPTZ,

  -- Verdict du moteur
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  niveau TEXT NOT NULL CHECK (niveau IN ('faible', 'modere', 'eleve')),
  alerte BOOLEAN NOT NULL DEFAULT false,
  signaux JSONB NOT NULL DEFAULT '[]'::jsonb,
  raisons JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Ce que la conversion HTML a dû faire. Sert à diagnostiquer un verdict
  -- surprenant : une signature introuvable vient souvent d'une citation mal
  -- découpée ou d'un corps entièrement masqué.
  citation_retiree BOOLEAN,
  marqueur_citation TEXT,
  blocs_masques INTEGER,
  invisibles_retires INTEGER,
  format_corps TEXT,
  longueur_texte INTEGER,

  duree_ms INTEGER,
  analyse_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Volontairement absentes : aucune colonne de corps, d'extrait, de pièce
  -- jointe ou d'en-têtes bruts. Ne pas en ajouter.

  UNIQUE (company_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_analyses_company_date
  ON graph_analyses(company_id, analyse_at DESC);

-- Pour lister rapidement ce qui a déclenché une alerte.
CREATE INDEX IF NOT EXISTS idx_analyses_alertes
  ON graph_analyses(company_id, analyse_at DESC) WHERE alerte;

ALTER TABLE graph_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analyses_select_own ON graph_analyses;
CREATE POLICY analyses_select_own ON graph_analyses FOR SELECT
  USING (company_id = public.get_my_company_id());

-- =============================================================================
-- 3. Réclamer un lot de travaux
-- =============================================================================

-- FOR UPDATE SKIP LOCKED : deux workers lancés en même temps se partagent la
-- file au lieu de se marcher dessus. Indispensable dès que la tâche planifiée
-- peut se déclencher pendant qu'une exécution précédente traîne.
--
-- Renvoie tout ce dont le worker a besoin pour appeler Graph, y compris le
-- locataire et l'identifiant de boîte — qui viennent de NOS enregistrements,
-- jamais de la notification.
CREATE OR REPLACE FUNCTION public.reclamer_travaux_graph(p_limite INTEGER DEFAULT 5)
RETURNS TABLE (
  travail_id UUID,
  company_id UUID,
  boite_id UUID,
  message_id TEXT,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  tentatives INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH pris AS (
    SELECT f.id
      FROM graph_file_attente f
      JOIN boites_surveillees b ON b.id = f.boite_id
      JOIN microsoft_tenants t ON t.id = b.tenant_uid
        -- Le filtre sur le locataire est ICI, pas après la mise à jour :
        -- sinon les lignes d'un locataire révoqué passeraient quand même en
        -- « en_cours » à chaque tour, sans jamais être remises en file par le
        -- worker qui ne les voit pas — une tentative brûlée toutes les dix
        -- minutes, indéfiniment.
     WHERE t.statut = 'actif'
       AND b.actif
       AND (f.statut = 'en_attente'
            -- Reprise d'un travail resté coincé (worker interrompu).
            OR (f.statut = 'en_cours'
                AND f.reclame_at < now() - INTERVAL '10 minutes'))
     ORDER BY f.recu_at
     LIMIT GREATEST(1, LEAST(p_limite, 25))
     -- « OF f » : ne verrouiller QUE la ligne de file. Un FOR UPDATE nu
     -- verrouillerait aussi la boîte et le locataire, partagés par toutes les
     -- lignes — deux workers sur la même boîte s'excluraient entièrement au
     -- lieu de se partager la file.
     FOR UPDATE OF f SKIP LOCKED
  ),
  marques AS (
    UPDATE graph_file_attente f
       SET statut = 'en_cours',
           reclame_at = now(),
           tentatives = f.tentatives + 1
      FROM pris
     WHERE f.id = pris.id
     RETURNING f.id, f.company_id, f.boite_id, f.message_id, f.tentatives
  )
  SELECT m.id, m.company_id, m.boite_id, m.message_id,
         t.tenant_id, b.graph_user_id, b.upn, m.tentatives
    FROM marques m
    JOIN boites_surveillees b ON b.id = m.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid;
END;
$$;

-- =============================================================================
-- 4. Enregistrer un verdict
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enregistrer_analyse_graph(
  p_travail_id UUID,
  p_expediteur_nom TEXT,
  p_expediteur_email TEXT,
  p_nom_signe TEXT,
  p_objet TEXT,
  p_employe_email TEXT,
  p_recu_at TIMESTAMPTZ,
  p_score INTEGER,
  p_niveau TEXT,
  p_alerte BOOLEAN,
  p_signaux JSONB,
  p_raisons JSONB,
  p_citation_retiree BOOLEAN,
  p_marqueur_citation TEXT,
  p_blocs_masques INTEGER,
  p_invisibles_retires INTEGER,
  p_format_corps TEXT,
  p_longueur_texte INTEGER,
  p_duree_ms INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  travail RECORD;
  analyse_id UUID;
BEGIN
  SELECT f.id, f.company_id, f.boite_id, f.message_id
    INTO travail
    FROM graph_file_attente f
   WHERE f.id = p_travail_id
   LIMIT 1;

  IF travail.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO graph_analyses (
    company_id, boite_id, message_id,
    expediteur_nom, expediteur_email, nom_signe, objet, employe_email, recu_at,
    score, niveau, alerte, signaux, raisons,
    citation_retiree, marqueur_citation, blocs_masques, invisibles_retires,
    format_corps, longueur_texte, duree_ms
  )
  VALUES (
    travail.company_id, travail.boite_id, travail.message_id,
    left(p_expediteur_nom, 200), left(p_expediteur_email, 320),
    left(p_nom_signe, 200), left(p_objet, 300), left(p_employe_email, 320),
    p_recu_at,
    p_score, p_niveau, COALESCE(p_alerte, false),
    COALESCE(p_signaux, '[]'::jsonb), COALESCE(p_raisons, '[]'::jsonb),
    p_citation_retiree, left(p_marqueur_citation, 60),
    p_blocs_masques, p_invisibles_retires,
    left(p_format_corps, 10), p_longueur_texte, p_duree_ms
  )
  -- Message déjà analysé : on met le verdict à jour plutôt que d'échouer.
  -- Cas normal après une reprise sur erreur.
  ON CONFLICT (company_id, message_id) DO UPDATE SET
    score = EXCLUDED.score,
    niveau = EXCLUDED.niveau,
    alerte = EXCLUDED.alerte,
    signaux = EXCLUDED.signaux,
    raisons = EXCLUDED.raisons,
    analyse_at = now()
  RETURNING id INTO analyse_id;

  UPDATE graph_file_attente
     SET statut = 'traite', traite_at = now(), erreur = NULL
   WHERE id = p_travail_id;

  RETURN analyse_id;
END;
$$;

-- =============================================================================
-- 5. Marquer un échec
-- =============================================================================

-- Au-delà de 5 tentatives on abandonne : un message supprimé de la boîte ne
-- reviendra jamais, et une ligne qui retente sans fin masque les vrais
-- problèmes dans les journaux.
CREATE OR REPLACE FUNCTION public.echec_travail_graph(
  p_travail_id UUID,
  p_erreur TEXT,
  p_definitif BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE graph_file_attente
     SET statut = CASE
           WHEN p_definitif OR tentatives >= 5 THEN 'echec'
           ELSE 'en_attente'
         END,
         erreur = left(p_erreur, 500),
         reclame_at = NULL
   WHERE id = p_travail_id;
END;
$$;

-- =============================================================================
-- 6. Droits
-- =============================================================================

-- Ces trois fonctions ne sont PAS accessibles avec la clé anonyme :
-- elles lisent des métadonnées de messages et modifient la file. Seul le
-- worker les appelle, avec la clé de service.
REVOKE ALL ON FUNCTION public.reclamer_travaux_graph(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enregistrer_analyse_graph(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT, BOOLEAN, JSONB, JSONB, BOOLEAN, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.echec_travail_graph(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reclamer_travaux_graph(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.enregistrer_analyse_graph(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT, BOOLEAN, JSONB, JSONB, BOOLEAN, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.echec_travail_graph(UUID, TEXT, BOOLEAN) TO service_role;

-- =============================================================================
-- 7. Vérification
-- =============================================================================

-- Les verdicts, du plus récent au plus ancien :
--
--   SELECT analyse_at, niveau, score, alerte, expediteur_email, nom_signe, objet
--     FROM graph_analyses ORDER BY analyse_at DESC LIMIT 20;
--
-- Ce qui reste à traiter, et ce qui a échoué :
--
--   SELECT statut, count(*) FROM graph_file_attente GROUP BY statut;
--   SELECT message_id, tentatives, erreur FROM graph_file_attente
--    WHERE statut = 'echec';
