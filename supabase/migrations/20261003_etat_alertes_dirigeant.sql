-- Distinguer « en attente de la fenêtre » de « l'envoi ne passe pas »
-- Appliquer via le SQL Editor Supabase. Idempotente. Lecture seule.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UN VOYANT QUI CRIE À LA PANNE PENDANT QUE LE MÉCANISME FONCTIONNE.
--
-- Le contrôle « alertes dirigeant en attente » annonçait « L'envoi ne passe
-- pas » dès qu'une alerte attendait depuis plus de 60 minutes. Il a fait
-- chercher une panne d'expédition pendant que le mécanisme anti-rafale faisait
-- exactement son travail : les 12 alertes sont parties en un seul résumé dès
-- la fenêtre close.
--
-- ⚠ LE DÉFAUT N'EST PAS DANS LE LIBELLÉ, IL EST DANS LE CRITÈRE.
--
--   La fenêtre ne se compte pas depuis l'alerte, elle se compte depuis le
--   DERNIER ENVOI : `reclamer_resumes_alertes` refuse de servir une société
--   qui a reçu quelque chose il y a moins de `p_fenetre_minutes`. Une alerte
--   peut donc légitimement attendre des heures — tant que la société reçoit
--   des alertes, chaque envoi repousse l'échéance suivante.
--
--   Mesurer l'âge de l'alerte revient à mesurer la mauvaise chose. Ce qui
--   décide, c'est : LA FENÊTRE DE CETTE SOCIÉTÉ EST-ELLE OUVERTE ?
--
--     fenêtre fermée  → l'attente est le fonctionnement normal, et on peut
--                       dire à quelle heure elle s'ouvrira ;
--     fenêtre ouverte
--     et ça n'est pas
--     parti depuis
--     plusieurs minutes → là, et là seulement, l'envoi ne passe pas.
--
-- ⚠ UNE MARGE DE COURTOISIE. Le worker passe toutes les minutes : entre
--   l'ouverture de la fenêtre et l'envoi, il s'écoule normalement moins d'une
--   minute. On attend cinq minutes avant de rougir — sans cette marge, le
--   contrôle passerait au rouge à chaque ouverture de fenêtre, et on
--   réapprendrait à l'ignorer.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.etat_alertes_dirigeant(
  p_fenetre_minutes INTEGER DEFAULT 60,
  p_marge_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  en_attente BIGINT,
  societes BIGINT,
  plus_ancienne TIMESTAMPTZ,
  prochaine_fenetre TIMESTAMPTZ,
  en_retard BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH attente AS (
    -- Exactement les mêmes conditions d'éligibilité que
    -- `reclamer_resumes_alertes`. Si les deux divergent, le contrôle décrit
    -- une file que l'expédition ne lit pas — et ment donc par construction.
    SELECT a.id, a.company_id, a.analyse_at
      FROM graph_analyses a
      JOIN boites_surveillees b ON b.id = a.boite_id
     WHERE a.alerte
       AND a.niveau = 'eleve'
       AND a.notifiee_at IS NULL
       AND a.banniere_posee_at IS NOT NULL
       AND a.restauree_at IS NULL
       AND b.actif
  ),
  -- La fenêtre se compte depuis le dernier envoi de LA SOCIÉTÉ. Sans envoi
  -- antérieur, elle est ouverte depuis toujours.
  fenetres AS (
    SELECT t.company_id,
           COALESCE(
             (SELECT max(r.notifiee_at) FROM graph_analyses r
               WHERE r.company_id = t.company_id AND r.notifiee_at IS NOT NULL)
             + make_interval(mins => GREATEST(1, p_fenetre_minutes)),
             '-infinity'::timestamptz
           ) AS ouverture
      FROM (SELECT DISTINCT company_id FROM attente) t
  )
  SELECT
    (SELECT count(*) FROM attente),
    (SELECT count(DISTINCT company_id) FROM attente),
    (SELECT min(analyse_at) FROM attente),
    -- La première fenêtre à s'ouvrir parmi les sociétés qui attendent : c'est
    -- l'heure qu'on annonce. Null si toutes sont déjà ouvertes.
    (SELECT min(f.ouverture) FROM fenetres f WHERE f.ouverture > now()),
    -- Le seul chiffre qui justifie de rougir.
    (SELECT count(*) FROM attente a
       JOIN fenetres f ON f.company_id = a.company_id
      WHERE f.ouverture < now() - make_interval(mins => GREATEST(0, p_marge_minutes)));
$$;

REVOKE ALL ON FUNCTION public.etat_alertes_dirigeant(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_alertes_dirigeant(INTEGER, INTEGER)
  TO service_role;

-- =============================================================================
-- Vérification
-- =============================================================================

-- 1. La fonction est en place et fermée au navigateur :
--
--   SELECT count(*) AS versions,
--          bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS ouverte
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'etat_alertes_dirigeant';
--   -- Attendu : versions = 1, ouverte = f.
--
-- 2. L'état actuel :
--
--   SELECT * FROM etat_alertes_dirigeant();
--
--   `en_attente` > 0 avec `en_retard` = 0 et une `prochaine_fenetre` dans le
--   futur : c'est le fonctionnement NORMAL de l'anti-rafale, et c'est ce que
--   le contrôle doit afficher en vert, avec l'heure.
--
--   `en_retard` > 0 : la fenêtre est ouverte depuis plus de cinq minutes et
--   rien n'est parti. Là, l'envoi ne passe pas — clé Resend, adresse
--   d'expédition, destinataires. C'est le seul cas rouge.
