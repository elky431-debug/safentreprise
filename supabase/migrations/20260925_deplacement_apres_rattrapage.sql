-- Le déplacement doit suivre TOUTE pose de bannière, pas seulement celle du worker
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CE QUE LE DIAGNOSTIC A MONTRÉ.
--
-- Trois chemins posent une bannière dans ce produit :
--
--   1. le worker, quand il analyse le message           → déplace ✅
--   2. `rattraperBannieres`, quand la pose du worker a échoué   → ne déplaçait pas ❌
--   3. `convertirBannieres`, quand la bannière était en texte    → ne déplaçait pas ❌
--
-- Un seul des trois rafraîchissait l'affichage. Une bannière posée par les
-- chemins 2 ou 3 restait donc invisible dans Outlook desktop — exactement le
-- défaut qu'on croyait corrigé, avec en prime `deplacements = 0` et aucune
-- raison consignée, puisqu'aucun déplacement n'avait été TENTÉ.
--
-- ⚠ ET UN SECOND DÉFAUT, PLUS GRAVE, QUE LA CORRECTION AURAIT INTRODUIT.
--   Les bannières des chemins 2 et 3 ne portent pas de jeton `data-ref` :
--   les deux fonctions qui les alimentent ne renvoient pas l'identifiant de
--   la ligne d'analyse. Les faire déplacer sans le jeton, c'était garantir le
--   webhook rejoué non rattaché — donc DEUX ALERTES ET DEUX EMAILS pour un
--   seul message. « Pire que le problème qu'on corrige. »
--
--   D'où cette migration : elle ne fait qu'une chose, rendre l'identifiant de
--   la ligne aux deux fonctions, pour que la bannière puisse le porter.
-- ─────────────────────────────────────────────────────────────────────────

-- ⚠ DROP PUIS CREATE, ET NON CREATE OR REPLACE. PostgreSQL refuse de changer
--   le type de retour d'une fonction en place. Les deux sont en lecture seule
--   et sans dépendance : la reconstruction ne perd rien.

-- =============================================================================
-- 1. Le rattrapage rend l'identifiant de ligne
-- =============================================================================

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
  action_tentatives INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.message_id, a.company_id, a.boite_id, t.tenant_id,
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

REVOKE ALL ON FUNCTION public.alertes_a_bannieriser(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertes_a_bannieriser(INTEGER) TO service_role;

-- =============================================================================
-- 2. La conversion aussi — et la boîte, qu'elle ne renvoyait même pas
-- =============================================================================

-- Sans `boite_id`, ce chemin ne pouvait pas mémoriser le dossier de service
-- de la boîte : le balayage de la maintenance serait resté aveugle sur les
-- messages qu'il aurait laissés en route.
DROP FUNCTION IF EXISTS public.bannieres_a_convertir(INTEGER);

CREATE FUNCTION public.bannieres_a_convertir(p_limite INTEGER DEFAULT 10)
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
  banniere_format TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.message_id, a.company_id, a.boite_id, t.tenant_id,
         b.graph_user_id, b.upn, a.niveau, a.score, a.signaux,
         a.banniere_format
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

REVOKE ALL ON FUNCTION public.bannieres_a_convertir(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bannieres_a_convertir(INTEGER) TO service_role;

-- =============================================================================
-- 3. Vérification
-- =============================================================================

-- 3.1 Les deux fonctions renvoient bien l'identifiant de ligne :
--
--   SELECT p.proname,
--          'analyse_id' = ANY(p.proargnames) AS rend_analyse_id,
--          'boite_id'   = ANY(p.proargnames) AS rend_boite_id
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('alertes_a_bannieriser', 'bannieres_a_convertir');
--   -- Attendu : deux lignes, les deux colonnes à t.
--
-- 3.2 Elles restent fermées au navigateur :
--
--   SELECT p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS ouverte
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('alertes_a_bannieriser', 'bannieres_a_convertir');
--   -- Attendu : ouverte = f pour les deux. Un t serait une brèche : ces
--   -- fonctions traversent les sociétés.
--
-- 3.3 Après le prochain passage de la maintenance sur une alerte :
--
--   SELECT * FROM etat_dossiers_service();
--   -- `deplacees_24h` doit enfin suivre `bannieres_24h`.
