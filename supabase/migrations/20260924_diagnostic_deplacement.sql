-- Rendre visible l'échec du déplacement
-- Appliquer via le SQL Editor Supabase. Idempotente. Lecture seule à une
-- écriture près, qui ne touche qu'une colonne de diagnostic.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POURQUOI CETTE MIGRATION EXISTE : UNE PANNE MUETTE, LA TROISIÈME.
--
-- Le déplacement du message a été mis en service le 11 septembre. Il n'a
-- jamais fonctionné une seule fois en production. Rien ne l'a signalé :
--
--   • la bannière était posée, donc `banniere_posee_at` renseigné ;
--   • `deplacement_at` restait NULL, car l'échec survenait AVANT le marquage ;
--   • `etat_deplacements()` ne voyait donc rien en transit, et affichait vert ;
--   • la seule trace était une ligne de log, écrite par un `.catch()` qui
--     jetait la raison.
--
-- Autrement dit : une fonctionnalité qui ne s'exécute jamais produisait
-- exactement la même trace qu'une fonctionnalité qui marche. C'est le même
-- défaut que l'alerte sans bannière et que le rapport mensuel silencieux.
-- Le principe qu'on applique désormais : UN ÉCHEC QUI NE S'ÉCRIT NULLE PART
-- N'EXISTE PAS, et ce qui n'existe pas ne se corrige jamais.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. L'échec du déplacement s'écrit sur la ligne
-- =============================================================================

-- ⚠ DÉSIGNÉE PAR L'IDENTIFIANT DE LIGNE, PAS PAR LE MESSAGE. C'est tout
--   l'intérêt : au moment où le déplacement échoue, on ne sait plus forcément
--   quel identifiant Graph porte le message — c'est précisément ce qui a pu
--   mal tourner. L'identifiant de la ligne, lui, ne bouge jamais.
--
-- ⚠ ELLE NE TOUCHE PAS `deplacement_at`. Si l'échec est survenu APRÈS le
--   marquage, le message est peut-être dans le dossier de service et c'est ce
--   drapeau qui permet au balayage de le ramener. L'effacer abandonnerait un
--   message légitime hors de sa boîte de réception.
CREATE OR REPLACE FUNCTION public.marquer_echec_deplacement(
  p_analyse_id UUID,
  p_erreur TEXT
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
         action_at = now()
   WHERE id = p_analyse_id;
$$;

REVOKE ALL ON FUNCTION public.marquer_echec_deplacement(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_echec_deplacement(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 2. Le contrôle qui aurait attrapé la panne le premier jour
-- =============================================================================

-- La question à laquelle il répond : « des bannières sont posées — sont-elles
-- déplacées ? » Elle ne se déduisait d'aucun compteur existant, et c'est
-- exactement la question qu'il fallait poser.
--
-- ⚠ LECTURE SEULE, ET SANS APPEL À MICROSOFT. Un contrôle qui créerait le
--   dossier pour vérifier qu'il est créable modifierait la boîte d'un client
--   à chaque diagnostic. Ce n'est pas le rôle d'une vérification.
CREATE OR REPLACE FUNCTION public.etat_dossiers_service()
RETURNS TABLE (
  boites_actives BIGINT,
  avec_dossier BIGINT,
  bannieres_24h BIGINT,
  deplacees_24h BIGINT,
  derniere_erreur TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif'),
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif' AND b.dossier_service_id IS NOT NULL),
    (SELECT count(*) FROM graph_analyses
      WHERE banniere_posee_at > now() - interval '24 hours'),
    -- Une bannière posée ET déplacée au moins une fois : la seule preuve que
    -- la chaîne va jusqu'au bout.
    (SELECT count(*) FROM graph_analyses
      WHERE banniere_posee_at > now() - interval '24 hours' AND deplacements > 0),
    (SELECT action_erreur FROM graph_analyses
      WHERE action_erreur LIKE '%déplacement : %'
        AND action_at > now() - interval '24 hours'
      ORDER BY action_at DESC LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.etat_dossiers_service()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_dossiers_service() TO service_role;

-- =============================================================================
-- 3. Vérification
-- =============================================================================

-- 3.1 Les deux fonctions sont en place :
--
--   SELECT count(*) FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('marquer_echec_deplacement', 'etat_dossiers_service');
--   -- Attendu : 2
--
-- 3.2 L'état actuel, qui doit décrire la panne en cours :
--
--   SELECT * FROM etat_dossiers_service();
--
--   Aujourd'hui, attendu : avec_dossier = 0 alors que bannieres_24h > 0 et
--   deplacees_24h = 0. C'est la signature exacte du défaut. Une fois corrigé,
--   deplacees_24h doit suivre bannieres_24h, et avec_dossier atteindre le
--   nombre de boîtes ayant reçu au moins une alerte.
