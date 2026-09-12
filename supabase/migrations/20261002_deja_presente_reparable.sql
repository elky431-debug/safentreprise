-- « Déjà présente » redevient réparable
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UNE ALERTE COMPTÉE « SANS BANNIÈRE » ALORS QUE LE MESSAGE PORTE LA SIENNE.
--
-- Constaté en production, et vérifié dans Outlook : le message porte bien son
-- avertissement. Ce n'est donc pas un défaut de protection mais de
-- comptabilité — et il bloquait le contrôle en rouge de façon définitive.
--
-- L'enchaînement : le message est déplacé, il revient en boîte de réception,
-- Graph notifie, le worker le reprend sous son NOUVEL identifiant, ne parvient
-- pas à le rattacher par jeton, l'analyse — et trouve SA PROPRE BANNIÈRE déjà
-- posée. Il rend `deja-presente`, état qui n'écrit pas `banniere_posee_at`.
-- La ligne devient une « alerte sans bannière » permanente.
--
-- ⚠ ET LE SEUL CHEMIN CAPABLE DE LA RÉPARER NE LA VOYAIT PAS.
--
--   `rattraperBannieres` sait exactement traiter ce cas : il lit le message,
--   constate que la bannière y est, et corrige la trace. Mais il est alimenté
--   par `alertes_a_bannieriser`, qui EXCLUAIT `deja-presente`. La ligne était
--   donc bloquée pour toujours, et le contrôle condamné à rester rouge.
--
--   Un voyant rouge en permanence est un voyant mort : on cesse de le lire, et
--   le jour où il signale une vraie fraude non signalée, personne ne regarde.
--
-- ⚠ POURQUOI L'EXCLUSION SE JUSTIFIAIT, ET POURQUOI ELLE NE SE JUSTIFIE PLUS.
--
--   Avant le déplacement, `deja-presente` voulait dire « une bannière est là
--   et ce n'est pas nous qui l'avons mise — ne touchons à rien ». Depuis que
--   le produit déplace ses propres messages, cet état signifie presque
--   toujours l'inverse : « c'est la nôtre, et nous ne l'avons pas notée ».
--   C'est devenu le cas le PLUS facile à réparer, pas le plus impossible.
--
--   La réparation reste sûre : le rattrapage relit le message avant d'agir. Si
--   la bannière y est, il corrige la trace sans rien modifier ; si elle n'y est
--   pas, il la pose comme pour n'importe quelle alerte. Dans les deux cas il
--   constate, il ne suppose pas.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. Le rattrapage voit à nouveau ces lignes
-- =============================================================================

-- ⚠ DROP PUIS CREATE : on ajoute `deplacement_etat` au retour, et PostgreSQL
--   refuse de changer le type de retour d'une fonction en place.
--
--   Cette colonne sert à ne PAS redéplacer un message pour rien. Corriger une
--   trace ne justifie pas de sortir et rentrer un message dont le déplacement
--   a déjà réussi : ce serait une mutation inutile de la boîte du client, et
--   une occasion de plus pour le webhook d'être rejoué.
DROP FUNCTION IF EXISTS public.alertes_a_bannieriser(INTEGER);

CREATE FUNCTION public.alertes_a_bannieriser(p_limite INTEGER DEFAULT 10)
RETURNS TABLE (
  analyse_id UUID,
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
  action_tentatives INTEGER,
  deplacement_etat TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.message_id, a.company_id, a.boite_id, t.tenant_id,
         b.graph_user_id, b.upn, a.niveau, a.score, a.signaux,
         a.action_etat, a.action_tentatives, a.deplacement_etat
    FROM graph_analyses a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE a.alerte
     AND a.banniere_posee_at IS NULL
     AND a.restauree_at IS NULL
     AND t.statut = 'actif'
     AND b.actif
     -- « deja-presente » n'est plus exclu : voir l'en-tête. Restent les deux
     -- cas où retenter ne sert réellement à rien.
     AND COALESCE(a.action_etat, '') NOT IN ('ignoree-texte', 'abandonnee')
     AND a.action_tentatives < 5
   ORDER BY a.analyse_at DESC
   LIMIT GREATEST(1, LEAST(p_limite, 25));
$$;

REVOKE ALL ON FUNCTION public.alertes_a_bannieriser(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertes_a_bannieriser(INTEGER) TO service_role;

-- =============================================================================
-- 2. Le compteur dit la même chose que le rattrapage
-- =============================================================================

-- ⚠ LES DEUX DÉFINITIONS DOIVENT RESTER IDENTIQUES. Si le compteur annonce
--   « 0 réparable » sur une ligne que le rattrapage va traiter — ou l'inverse —
--   le contrôle ment, et c'est ce mensonge-là qui envoie chercher un défaut
--   ailleurs. Toute modification de l'une doit être reportée dans l'autre.
CREATE OR REPLACE FUNCTION public.compter_alertes_sans_banniere()
RETURNS TABLE (total BIGINT, reparables BIGINT, plus_ancienne TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         count(*) FILTER (
           WHERE COALESCE(action_etat, '') NOT IN ('ignoree-texte', 'abandonnee')
             AND action_tentatives < 5
         ),
         min(analyse_at)
    FROM graph_analyses
   WHERE alerte AND banniere_posee_at IS NULL AND restauree_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.compter_alertes_sans_banniere()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compter_alertes_sans_banniere() TO service_role;

-- =============================================================================
-- 3. Le motif affiché cesse d'annoncer une impasse
-- =============================================================================

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
             'une bannière était déjà là — LE MESSAGE EST DONC PROTÉGÉ. ' ||
             'C''est la trace qui manque, pas l''avertissement ; la maintenance ' ||
             'la corrige au prochain passage.'
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
-- 4. Vérification
-- =============================================================================

-- 4.1 La fonction rend l'état du déplacement, et reste fermée au navigateur :
--
--   SELECT 'deplacement_etat' = ANY(p.proargnames)                        AS rend_etat,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE')      AS ouverte
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'alertes_a_bannieriser';
--   -- Attendu : rend_etat = t, ouverte = f.
--
-- 4.2 LE COMPTEUR ET LE RATTRAPAGE DOIVENT S'ACCORDER. Le nombre de
--     réparables annoncé doit être exactement le nombre de lignes que le
--     rattrapage va traiter :
--
--   SELECT (SELECT reparables FROM compter_alertes_sans_banniere()) AS annonce,
--          (SELECT count(*) FROM alertes_a_bannieriser(25))          AS a_traiter;
--   -- Attendu : les deux colonnes égales. Une différence veut dire que le
--   -- contrôle ment, et c'est ce mensonge qui fait chercher ailleurs.
--
-- 4.3 Après le prochain passage de la maintenance :
--
--   SELECT * FROM alertes_sans_banniere;
--   -- Attendu : vide. La ligne « une bannière était déjà là » doit avoir été
--   -- corrigée, avec pose_par = 'maintenance-rattrapage-trace-corrigee'.
