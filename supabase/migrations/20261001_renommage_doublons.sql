-- Le renommage survit au webhook rejoué
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LE 409 CONSTATÉ EN PRODUCTION.
--
--   renommer_message_graph : HTTP 409 — code 23505,
--   Key (company_id, message_id) already exists.
--
-- La fonction ne vérifiait le conflit que sur `graph_analyses`. Elle basculait
-- ensuite `graph_corps_originaux` et `graph_file_attente` sans regarder, alors
-- que les deux portent la même contrainte d'unicité. Le webhook rejoué a
-- sauvegardé un corps sous le NOUVEL identifiant avant que le renommage
-- n'arrive : l'UPDATE viole la clé primaire, la fonction entière échoue, et la
-- ligne garde l'ancien identifiant.
--
-- Conséquences en chaîne, toutes observées :
--   • la base pointe un message_id qui n'existe plus côté Graph ;
--   • `deplacement_at` n'est jamais effacé, donc le marqueur reste posé ;
--   • « messages en transit » rougit alors que le dossier de service est VIDE ;
--   • le balayage cherche un identifiant mort : examinees 1, ramenes 0.
--
-- ⚠ QUELLE SAUVEGARDE GARDER, ET POURQUOI CE N'EST PAS INDIFFÉRENT.
--
--   La ligne sous l'ANCIEN identifiant a été écrite AVANT la pose de la
--   bannière : c'est le corps d'origine véritable. Celle sous le NOUVEL
--   identifiant a été écrite après le déplacement, donc après la pose : elle
--   CONTIENT la bannière.
--
--   Garder la seconde reviendrait à « restaurer » un message en y remettant
--   l'avertissement qu'on cherchait à retirer. On écarte donc le doublon et
--   on conserve l'original — c'est la garantie de restauration qui est en jeu,
--   pas un détail d'implémentation.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.renommer_message_graph(
  p_company_id UUID,
  p_ancien_id TEXT,
  p_nouveau_id TEXT
)
RETURNS TABLE (table_modifiee TEXT, lignes INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
  v_doublons INTEGER;
BEGIN
  IF p_ancien_id IS NULL OR p_nouveau_id IS NULL OR p_ancien_id = p_nouveau_id THEN
    RETURN;
  END IF;

  -- ⚠ SI LE NOUVEL IDENTIFIANT EXISTE DÉJÀ EN ANALYSE, ON NE RENOMME PAS.
  --   Deux lignes d'analyse sont deux alertes et deux emails au dirigeant :
  --   c'est à l'appelant de trancher, via `rattacher_message_graph`.
  IF EXISTS (SELECT 1 FROM graph_analyses
              WHERE company_id = p_company_id AND message_id = p_nouveau_id) THEN
    table_modifiee := 'conflit'; lignes := 0; RETURN NEXT; RETURN;
  END IF;

  UPDATE graph_analyses
     SET message_id = p_nouveau_id,
         deplacement_at = NULL,
         deplacements = deplacements + 1
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_analyses'; lignes := v_n; RETURN NEXT;

  -- ⚠ LE DOUBLON EST ÉCARTÉ, PAS LE PLUS ANCIEN. Voir l'en-tête : la
  --   sauvegarde sous le nouvel identifiant est postérieure à la pose de la
  --   bannière, donc elle la contient. Seule celle sous l'ancien identifiant
  --   est le corps d'origine.
  DELETE FROM graph_corps_originaux
   WHERE company_id = p_company_id AND message_id = p_nouveau_id;
  GET DIAGNOSTICS v_doublons = ROW_COUNT;
  IF v_doublons > 0 THEN
    table_modifiee := 'corps_doublon_ecarte'; lignes := v_doublons; RETURN NEXT;
  END IF;

  UPDATE graph_corps_originaux
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_corps_originaux'; lignes := v_n; RETURN NEXT;

  -- La file est un tampon de travail : le doublon n'a aucune valeur, et le
  -- laisser ferait retenter un message qui n'existe plus.
  DELETE FROM graph_file_attente
   WHERE company_id = p_company_id AND message_id = p_nouveau_id;
  GET DIAGNOSTICS v_doublons = ROW_COUNT;
  IF v_doublons > 0 THEN
    table_modifiee := 'file_doublon_ecarte'; lignes := v_doublons; RETURN NEXT;
  END IF;

  UPDATE graph_file_attente
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_file_attente'; lignes := v_n; RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.renommer_message_graph(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renommer_message_graph(UUID, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- Réparer les lignes déjà bloquées par ce défaut
-- =============================================================================

-- ⚠ ON NE TOUCHE QU'AU MARQUEUR, JAMAIS AU message_id. Une ligne dont le
--   renommage a échoué porte un identifiant périmé ; le corriger d'ici
--   demanderait de connaître le nouvel identifiant, que seul Graph détient.
--   Le rattachement par jeton s'en chargera à la prochaine notification.
--
--   Ce qu'on lève ici, c'est le faux positif : ces messages sont dans leur
--   boîte de réception, le dossier de service est vide, et le voyant
--   « messages en transit » rougit pour rien. Un voyant qui rougit à tort
--   s'apprend à être ignoré — il est aussi nuisible qu'un voyant muet.
--
--   À COLLER UNE FOIS, après avoir vérifié que le dossier « Safentreprise —
--   en cours » est bien vide dans la boîte concernée :
--
--   UPDATE graph_analyses
--      SET deplacement_at = NULL,
--          deplacement_note = left(COALESCE(NULLIF(deplacement_note,'') || ' | ', '')
--            || 'marqueur levé à la main : dossier de service vérifié vide', 800)
--    WHERE deplacement_at IS NOT NULL
--      AND deplacement_at < now() - interval '1 hour';
--
--   Attendu : autant de lignes que le contrôle en signalait. Ensuite
--   `SELECT * FROM etat_deplacements();` doit rendre bloques = 0.

-- =============================================================================
-- Vérification
-- =============================================================================

-- 1. La fonction rend bien les nouvelles lignes de compte rendu :
--
--   SELECT count(*) AS versions
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'renommer_message_graph';
--   -- Attendu : 1.
--
-- 2. Plus aucun message marqué en transit depuis plus d'une heure :
--
--   SELECT * FROM etat_deplacements();
--   -- Attendu après la réparation ci-dessus : bloques = 0.
