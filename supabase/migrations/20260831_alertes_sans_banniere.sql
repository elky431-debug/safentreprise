-- Aucune alerte ne doit rester sans bannière
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- LE PROBLÈME QU'ELLE RÈGLE. Une alerte pouvait rester sans bannière SANS
-- QU'AUCUNE LIGNE NE LE DISE :
--
--   1. Quand GRAPH_ACTIONS valait « off », le worker n'écrivait rien du tout.
--      Ni bannière, ni erreur : indiscernable d'une pose réussie si on ne
--      regarde que action_erreur.
--   2. Une fois le verdict enregistré, le travail passe à « traite » et ne
--      revient jamais. L'action n'était donc jamais retentée — un message
--      analysé pendant une panne, ou avant l'activation de l'écriture,
--      n'aurait jamais eu sa bannière.
--
-- CE QU'ELLE AJOUTE :
--
--   • action_etat — ce qui s'est réellement passé, TOUJOURS renseigné quand
--     il y a alerte. « rien à dire » n'est plus une valeur possible.
--   • alertes_sans_banniere — la vue à consulter à tout moment.
--   • alertes_a_bannieriser — de quoi retenter, sans réanalyser le message :
--     les signaux sont déjà en base.

-- =============================================================================
-- 1. État de l'action
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS action_etat TEXT,
  ADD COLUMN IF NOT EXISTS action_tentatives INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMPTZ;

COMMENT ON COLUMN graph_analyses.action_etat IS
  'posee | categorie-seule | mode-off | ignoree-texte | deja-presente | echec | annulee-non-verifiable | abandonnee';

-- =============================================================================
-- 2. Enregistrer une action — remplace la version précédente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marquer_action_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_categorie TEXT,
  p_banniere_posee BOOLEAN,
  p_erreur TEXT DEFAULT NULL,
  p_action_etat TEXT DEFAULT NULL
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
         action_erreur = p_erreur,
         action_etat = COALESCE(p_action_etat, action_etat),
         action_at = now(),
         -- Le compteur ne monte que sur un échec : une pose réussie ou un cas
         -- où il n'y a rien à faire ne doit pas rapprocher de l'abandon.
         action_tentatives = CASE
           WHEN p_banniere_posee OR p_action_etat IN ('ignoree-texte', 'deja-presente')
             THEN action_tentatives
           ELSE action_tentatives + 1
         END,
         restauree_at = CASE
           WHEN p_categorie IS NOT NULL OR p_banniere_posee THEN NULL
           ELSE restauree_at END
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- =============================================================================
-- 3. LA VUE À CONSULTER — alertes sans bannière
-- =============================================================================

-- security_invoker : la vue respecte la RLS de graph_analyses, chaque
-- dirigeant ne voit donc que les alertes de SA société.
CREATE OR REPLACE VIEW public.alertes_sans_banniere
WITH (security_invoker = true) AS
  SELECT a.company_id,
         a.message_id,
         a.analyse_at,
         a.niveau,
         a.score,
         a.expediteur_email,
         a.objet,
         a.categorie IS NOT NULL AS categorie_posee,
         a.action_etat,
         a.action_tentatives,
         a.action_erreur,
         a.action_at,
         -- Pourquoi il n'y a pas de bannière, en clair.
         CASE
           WHEN a.action_etat IS NULL THEN
             'jamais tentée — message analysé avant l''activation de l''écriture'
           WHEN a.action_etat = 'mode-off' THEN
             'écriture désactivée (GRAPH_ACTIONS) au moment de l''analyse'
           WHEN a.action_etat = 'ignoree-texte' THEN
             'corps en texte brut : une bannière HTML y afficherait ses balises'
           WHEN a.action_etat = 'deja-presente' THEN
             'une bannière était déjà là'
           WHEN a.action_etat = 'annulee-non-verifiable' THEN
             'posée puis retirée : elle n''aurait pas pu être défaite'
           WHEN a.action_etat = 'abandonnee' THEN
             'abandonnée — ' || COALESCE(a.action_erreur, 'sans détail')
           -- Le plafond de tentatives doit être dit : sans lui, on croirait
           -- que la maintenance va finir par y arriver.
           WHEN a.action_tentatives >= 5 THEN
             'PLUS RETENTÉE (' || a.action_tentatives || ' échecs) — ' ||
             COALESCE(a.action_erreur, 'sans détail')
           WHEN a.action_etat = 'echec' THEN
             COALESCE(a.action_erreur, 'échec sans détail') ||
             ' (tentative ' || a.action_tentatives || '/5)'
           ELSE COALESCE(a.action_erreur, a.action_etat)
         END AS motif
    FROM graph_analyses a
   WHERE a.alerte
     AND a.banniere_posee_at IS NULL
     AND a.restauree_at IS NULL;

COMMENT ON VIEW public.alertes_sans_banniere IS
  'Alertes dont le message ne porte pas de bannière. Doit rester vide.';

GRANT SELECT ON public.alertes_sans_banniere TO authenticated, service_role;

-- =============================================================================
-- 4. Compter — pour le diagnostic du worker
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compter_alertes_sans_banniere()
RETURNS TABLE (total BIGINT, reparables BIGINT, plus_ancienne TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         count(*) FILTER (
           WHERE COALESCE(action_etat, '') NOT IN
             ('ignoree-texte', 'deja-presente', 'abandonnee')
             AND action_tentatives < 5
         ),
         min(analyse_at)
    FROM graph_analyses
   WHERE alerte AND banniere_posee_at IS NULL AND restauree_at IS NULL;
$$;

-- =============================================================================
-- 5. Ce qu'il faut retenter
-- =============================================================================

-- Les signaux sont DÉJÀ en base : on reconstruit la bannière sans réanalyser
-- le message, donc sans dépendre du moteur ni du contexte du moment.
--
-- Sont exclus les cas où retenter ne servirait à rien : un corps en texte
-- brut le restera, une bannière déjà présente l'est toujours, et on abandonne
-- au bout de 5 échecs plutôt que de boucler indéfiniment.
CREATE OR REPLACE FUNCTION public.alertes_a_bannieriser(p_limite INTEGER DEFAULT 10)
RETURNS TABLE (
  message_id TEXT,
  company_id UUID,
  boite_id UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  niveau TEXT,
  score INTEGER,
  signaux JSONB,
  action_etat TEXT,
  action_tentatives INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.message_id, a.company_id, a.boite_id, t.tenant_id,
         b.graph_user_id, b.upn, a.niveau, a.score, a.signaux,
         a.action_etat, a.action_tentatives
    FROM graph_analyses a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE a.alerte
     AND a.banniere_posee_at IS NULL
     AND a.restauree_at IS NULL
     AND t.statut = 'actif'
     AND b.actif
     AND COALESCE(a.action_etat, '') NOT IN
       ('ignoree-texte', 'deja-presente', 'abandonnee')
     AND a.action_tentatives < 5
   ORDER BY a.analyse_at DESC
   LIMIT GREATEST(1, LEAST(p_limite, 25));
$$;

-- Abandon définitif, pour cesser de retenter ce qui ne marchera jamais.
CREATE OR REPLACE FUNCTION public.abandonner_action_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_erreur TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET action_etat = 'abandonnee',
         action_erreur = left(p_erreur, 500),
         action_at = now()
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- =============================================================================
-- 6. Droits
-- =============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT)',
    'compter_alertes_sans_banniere()',
    'alertes_a_bannieriser(INTEGER)',
    'abandonner_action_graph(UUID, TEXT, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- =============================================================================
-- 7. Rattrapage des lignes déjà en base
-- =============================================================================

-- Les alertes analysées AVANT cette migration n'ont pas d'action_etat. On ne
-- les marque pas « mode-off » — on n'en sait rien — mais NULL est déjà
-- explicite dans la vue : « jamais tentée ». Elles seront reprises par le
-- rattrapage automatique.
--
-- Celles qui ont bien reçu une bannière sont marquées, pour que la colonne
-- soit renseignée partout.
UPDATE graph_analyses
   SET action_etat = 'posee'
 WHERE banniere_posee_at IS NOT NULL AND action_etat IS NULL;

-- =============================================================================
-- 8. Vérification — LA REQUÊTE À CONNAÎTRE
-- =============================================================================

--   SELECT * FROM alertes_sans_banniere ORDER BY analyse_at DESC;
--
-- Elle doit être VIDE. Chaque ligne dit en clair pourquoi la bannière manque.
--
-- Compte rapide :
--
--   SELECT * FROM compter_alertes_sans_banniere();
