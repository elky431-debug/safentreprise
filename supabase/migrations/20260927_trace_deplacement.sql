-- La trace permanente du déplacement
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CE QUI A COÛTÉ TROIS JOURS DE DIAGNOSTIC.
--
-- `marquer_deplacement_graph` désigne la ligne PAR LE MESSAGE :
--
--   UPDATE graph_analyses SET deplacement_at = now()
--    WHERE company_id = … AND message_id = …;
--
-- Un UPDATE qui ne trouve aucune ligne ne lève pas et n'écrit rien. Si
-- l'identifiant cherché n'est pas celui que porte la ligne, l'ordre passe en
-- silence — et tous les suivants aussi, `renommer_message_graph` compris. Le
-- déplacement peut alors avoir lieu pour de bon tandis que la base affirme
-- que rien ne s'est passé : ni marqueur, ni compteur, ni erreur.
--
-- ⚠ ET CE N'EST PAS QU'UN PROBLÈME DE DIAGNOSTIC. Si le message est déplacé
--   sans que le renommage suive, la ligne garde un identifiant que le message
--   n'a plus : LA RESTAURATION D'UN FAUX POSITIF DEVIENT IMPOSSIBLE. C'est la
--   garantie sur laquelle repose tout l'argumentaire du produit.
--
-- Deux règles en sortent, et elles valent au-delà de ce chantier :
--
--   1. ON DÉSIGNE LA LIGNE PAR SON IDENTIFIANT DE LIGNE. Il ne change jamais.
--      Le message_id, lui, change au déplacement — s'en servir pour tracer un
--      déplacement, c'est faire dépendre la trace de ce qu'elle observe.
--   2. CHAQUE ISSUE S'ÉCRIT, y compris la réussite et y compris « pas tenté ».
--      Une branche muette est indistinguable d'un appel qui échoue sans bruit.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. Où la trace se lit
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS deplacement_etat TEXT;

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS deplacement_note TEXT;

COMMENT ON COLUMN graph_analyses.deplacement_etat IS
  'Issue du déplacement : non-tente, ouvert, reussi, echec. NULL = message antérieur au mécanisme.';
COMMENT ON COLUMN graph_analyses.deplacement_note IS
  'Détail lisible de cette issue : étape en échec, ou discordance d''identifiant.';

-- ⚠ ON NOMME LES ÉTATS UNE FOIS POUR TOUTES. Sans contrainte, une faute de
--   frappe dans le code créerait un état que les contrôles ne comptent nulle
--   part — soit, à nouveau, une panne muette.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'graph_analyses_deplacement_etat_check'
  ) THEN
    ALTER TABLE graph_analyses
      ADD CONSTRAINT graph_analyses_deplacement_etat_check
      CHECK (deplacement_etat IS NULL
             OR deplacement_etat IN ('non-tente', 'ouvert', 'reussi', 'echec'));
  END IF;
END $$;

-- =============================================================================
-- 2. L'ouverture — par l'identifiant de ligne, et elle dit ce qu'elle trouve
-- =============================================================================

-- Remplace `marquer_deplacement_graph` dans tous les appelants. Différence
-- décisive : elle désigne la ligne par son id, donc elle la trouve toujours,
-- et elle RÉPOND. Les trois réponses possibles :
--
--   'concordant'    — la ligne porte bien l'identifiant qu'on s'apprête à
--                     déplacer. Cas nominal.
--   'discordance'   — la ligne porte un AUTRE identifiant. Le déplacement peut
--                     continuer, mais le renommage ne retrouvera pas sa ligne :
--                     c'est écrit noir sur blanc, avec les deux identifiants.
--   'ligne-absente' — aucune ligne sous cet id. Rien ne peut être tracé.
CREATE OR REPLACE FUNCTION public.ouvrir_deplacement(
  p_analyse_id UUID,
  p_message_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligne TEXT;
BEGIN
  SELECT message_id INTO v_ligne FROM graph_analyses WHERE id = p_analyse_id;

  IF NOT FOUND THEN
    RETURN 'ligne-absente';
  END IF;

  UPDATE graph_analyses
     SET deplacement_at = now(),
         deplacement_etat = 'ouvert',
         deplacement_note = CASE
           WHEN v_ligne IS DISTINCT FROM p_message_id
             THEN left('discordance : déplacement de « ' || COALESCE(p_message_id, 'NULL')
                       || ' » alors que la ligne porte « ' || COALESCE(v_ligne, 'NULL')
                       || ' » — le renommage ne retrouvera pas sa ligne', 800)
           ELSE NULL
         END
   WHERE id = p_analyse_id;

  RETURN CASE WHEN v_ligne IS DISTINCT FROM p_message_id
              THEN 'discordance' ELSE 'concordant' END;
END;
$$;

REVOKE ALL ON FUNCTION public.ouvrir_deplacement(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ouvrir_deplacement(UUID, TEXT) TO service_role;

-- =============================================================================
-- 3. La clôture — une seule fonction pour TOUTES les issues
-- =============================================================================

-- ⚠ `p_sorti` COMMANDE LE SORT DU MARQUEUR, et de lui dépend qu'un message
--   légitime ne reste pas hors de sa boîte de réception :
--
--     sorti = false → le message n'a jamais quitté la boîte, on lève le
--                     marqueur. Le laisser ferait rougir « messages en
--                     transit » et enverrait le balayage chercher un message
--                     qui n'a pas bougé.
--     sorti = true  → il est dehors. Le marqueur RESTE : c'est la seule chose
--                     qui dise au balayage d'aller le récupérer.
--
--   Une réussite lève toujours le marqueur : le message est revenu. On ne s'en
--   remet pas au renommage pour ça — en cas de discordance il n'écrit rien, et
--   le marqueur resterait posé pour toujours.
CREATE OR REPLACE FUNCTION public.tracer_deplacement(
  p_analyse_id UUID,
  p_etat TEXT,
  p_note TEXT DEFAULT NULL,
  p_sorti BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET deplacement_etat = p_etat,
         -- La note d'ouverture — une discordance — ne doit pas disparaître
         -- sous celle de clôture : les deux comptent, on les cumule.
         deplacement_note = left(
           COALESCE(NULLIF(deplacement_note, '') || ' | ', '') || COALESCE(p_note, p_etat),
           800),
         deplacement_at = CASE
           WHEN p_etat = 'reussi' THEN NULL
           WHEN p_sorti THEN deplacement_at
           ELSE NULL
         END
   WHERE id = p_analyse_id
     AND p_etat IN ('non-tente', 'ouvert', 'reussi', 'echec');
$$;

REVOKE ALL ON FUNCTION public.tracer_deplacement(UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracer_deplacement(UUID, TEXT, TEXT, BOOLEAN)
  TO service_role;

-- =============================================================================
-- 4. Le contrôle, qui compte enfin les issues
-- =============================================================================

DROP FUNCTION IF EXISTS public.etat_dossiers_service();

CREATE FUNCTION public.etat_dossiers_service()
RETURNS TABLE (
  boites_actives BIGINT,
  avec_dossier BIGINT,
  bannieres_24h BIGINT,
  deplacees_24h BIGINT,
  reussis_24h BIGINT,
  echecs_24h BIGINT,
  non_tentes_24h BIGINT,
  sans_trace_24h BIGINT,
  discordances_24h BIGINT,
  derniere_note TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recentes AS (
    SELECT * FROM graph_analyses WHERE banniere_posee_at > now() - interval '24 hours'
  )
  SELECT
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif'),
    (SELECT count(*) FROM boites_surveillees b
       JOIN microsoft_tenants t ON t.id = b.tenant_uid
      WHERE b.actif AND t.statut = 'actif' AND b.dossier_service_id IS NOT NULL),
    (SELECT count(*) FROM recentes),
    (SELECT count(*) FROM recentes WHERE deplacements > 0),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'reussi'),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'echec'),
    (SELECT count(*) FROM recentes WHERE deplacement_etat = 'non-tente'),
    -- ⚠ LA COLONNE QUI COMPTE LE PLUS. Une bannière posée sans AUCUNE trace de
    --   déplacement veut dire qu'on est passé à côté d'un chemin de pose. C'est
    --   exactement ce qui s'est produit, et rien ne le disait.
    (SELECT count(*) FROM recentes WHERE deplacement_etat IS NULL),
    (SELECT count(*) FROM recentes WHERE deplacement_note LIKE 'discordance%'),
    (SELECT deplacement_note FROM recentes
      WHERE deplacement_note IS NOT NULL
      ORDER BY analyse_at DESC LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.etat_dossiers_service()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_dossiers_service() TO service_role;

-- =============================================================================
-- 5. Vérification
-- =============================================================================

-- 5.1 Colonnes, contrainte et fonctions en place. UNE SEULE REQUÊTE :
--
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'graph_analyses'
--         AND column_name IN ('deplacement_etat', 'deplacement_note'))  AS colonnes,
--     (SELECT count(*) FROM pg_constraint
--       WHERE conname = 'graph_analyses_deplacement_etat_check')        AS contrainte,
--     (SELECT count(*) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('ouvrir_deplacement', 'tracer_deplacement',
--                           'etat_dossiers_service'))                   AS fonctions;
--
--   Attendu : colonnes = 2, contrainte = 1, fonctions = 3.
--
-- 5.2 L'état actuel. Tant qu'aucun message n'est passé sur la nouvelle
--     version, `sans_trace_24h` vaut le nombre de bannières récentes :
--
--   SELECT * FROM etat_dossiers_service();
--
-- 5.3 Après le prochain message d'essai, la question enfin tranchée :
--
--   SELECT message_id, deplacement_etat, deplacement_note,
--          deplacement_at, deplacements
--     FROM graph_analyses ORDER BY analyse_at DESC LIMIT 1;
--
--   deplacement_etat NULL        → aucun chemin de pose n'a appelé le
--                                  déplacement. Le défaut est en amont.
--   'non-tente'                  → la condition n'était pas remplie ; la note
--                                  dit dans quel état était la bannière.
--   'ouvert' et rien de plus     → la fonction a été entrée puis INTERROMPUE.
--   'echec'                      → la note nomme l'étape et la raison.
--   'reussi'                     → le déplacement a eu lieu. Si la note
--                                  commence par « discordance », le message a
--                                  bougé SANS que la base suive : restauration
--                                  compromise, à traiter en priorité.
