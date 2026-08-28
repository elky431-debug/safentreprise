-- Un corps en texte brut reçoit une bannière en texte brut
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QU'ELLE CORRIGE. « ignoree-texte » était un état FINAL : un mail
-- frauduleux dont le corps était en text/plain restait sans le moindre
-- avertissement, définitivement, et la vue le présentait comme un choix
-- assumé. Le raisonnement était juste — injecter du HTML dans un corps texte
-- afficherait les balises — mais le résultat ne l'était pas.
--
-- Le code pose désormais une bannière EN TEXTE BRUT dans ces corps-là, avec le
-- même avertissement. « ignoree-texte » n'est plus jamais produit.
--
-- Cette migration remet dans le circuit les lignes qui le portent encore.

-- =============================================================================
-- 1. Les corps texte redeviennent réparables
-- =============================================================================

-- « ignoree-texte » sort de la liste des états qu'on ne retente pas. Reste
-- « deja-presente », qui décrit un message déjà bannièré, et « abandonnee ».
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
     AND COALESCE(a.action_etat, '') NOT IN ('deja-presente', 'abandonnee')
     AND a.action_tentatives < 5
   ORDER BY a.analyse_at DESC
   LIMIT GREATEST(1, LEAST(p_limite, 25));
$$;

CREATE OR REPLACE FUNCTION public.compter_alertes_sans_banniere()
RETURNS TABLE (total BIGINT, reparables BIGINT, plus_ancienne TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         count(*) FILTER (
           WHERE COALESCE(action_etat, '') NOT IN ('deja-presente', 'abandonnee')
             AND action_tentatives < 5
         ),
         min(analyse_at)
    FROM graph_analyses
   WHERE alerte AND banniere_posee_at IS NULL AND restauree_at IS NULL;
$$;

-- Le compteur de tentatives ne doit plus être gelé sur « ignoree-texte » :
-- c'est un échec comme un autre maintenant, il doit finir par s'abandonner
-- plutôt que de faire boucler la maintenance indéfiniment.
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
-- 2. Motif mis à jour
-- =============================================================================

DROP VIEW IF EXISTS public.alertes_sans_banniere;

CREATE VIEW public.alertes_sans_banniere
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
         CASE
           WHEN a.action_etat IS NULL THEN
             'jamais tentée — message analysé avant l''activation de l''écriture'
           WHEN a.action_etat = 'mode-off' THEN
             'écriture désactivée (GRAPH_ACTIONS) au moment de l''analyse'
           -- N'est plus produit : ne subsiste que sur d'anciennes lignes, que
           -- la maintenance reprend maintenant avec une bannière texte.
           WHEN a.action_etat = 'ignoree-texte' THEN
             'ancien état — corps en texte brut, repris avec une bannière ' ||
             'texte au prochain passage de la maintenance'
           WHEN a.action_etat = 'deja-presente' THEN
             'une bannière était déjà là'
           WHEN a.action_etat = 'annulee-non-verifiable' THEN
             'posée puis retirée : elle n''aurait pas pu être défaite'
           WHEN a.action_etat = 'abandonnee' THEN
             'abandonnée — ' || COALESCE(a.action_erreur, 'sans détail')
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
-- 3. Remise à zéro des compteurs
-- =============================================================================

-- Les lignes marquées « ignoree-texte » ont pu accumuler des tentatives sous
-- l'ancien régime. On leur rend leurs cinq essais : la cause de l'échec a
-- disparu, ce serait absurde de les abandonner pour des tentatives qui ne
-- pouvaient pas aboutir.
UPDATE graph_analyses
   SET action_tentatives = 0
 WHERE action_etat = 'ignoree-texte'
   AND banniere_posee_at IS NULL;

COMMENT ON COLUMN graph_analyses.action_etat IS
  'posee | categorie-seule | mode-off | deja-presente | echec | annulee-non-verifiable | abandonnee (ignoree-texte : ancien état, n''est plus produit)';

-- =============================================================================
-- 4. Vérification
-- =============================================================================

--   SELECT * FROM alertes_sans_banniere ORDER BY analyse_at DESC;
--   SELECT * FROM compter_alertes_sans_banniere();
--
-- Les lignes « ignoree-texte » doivent maintenant compter dans « reparables ».
