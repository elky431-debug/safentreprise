-- Cloisonnement des modèles et des questions de quiz par société
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- PROBLÈME CORRIGÉ : message_templates et quiz_questions étaient des tables
-- partagées sans company_id, ouvertes en écriture à tout utilisateur connecté.
-- Un client pouvait donc modifier ou supprimer les modèles et les questions
-- de tous les autres.
--
-- STRATÉGIE : company_id IS NULL = entrée SYSTÈME, fournie par l'opérateur
-- Safentreprise. Visible par tous, modifiable par personne via l'API publique.
-- company_id = <société> = entrée du client, qu'il est seul à voir et à gérer.

-- =============================================================================
-- 1. Colonnes de rattachement
-- =============================================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_message_templates_company
  ON message_templates(company_id);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_company
  ON quiz_questions(company_id);

-- Les lignes existantes restent à NULL, donc « système ». C'est le bon
-- résultat pour les gabarits et questions livrés avec le produit (identifiants
-- préfixés a1000000-… et b1000000-…).
--
-- ATTENTION : si un client a déjà créé ses propres questions via l'onglet
-- Formations, elles deviendraient système elles aussi. La requête de contrôle
-- fournie dans la réponse liste ces lignes ; rattachez-les à leur société avec
--   UPDATE quiz_questions SET company_id = '<uuid-societe>' WHERE id = '<uuid>';

-- =============================================================================
-- 2. RLS message_templates
-- =============================================================================

-- Anciennes politiques trop larges
DROP POLICY IF EXISTS message_templates_select_actif ON message_templates;
DROP POLICY IF EXISTS message_templates_select_all_auth ON message_templates;
DROP POLICY IF EXISTS message_templates_update_auth ON message_templates;

-- Lecture : les gabarits système + les siens
DROP POLICY IF EXISTS message_templates_select_visible ON message_templates;
CREATE POLICY message_templates_select_visible
  ON message_templates FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR company_id = public.get_my_company_id()
  );

-- Création : uniquement rattachée à sa propre société
DROP POLICY IF EXISTS message_templates_insert_own ON message_templates;
CREATE POLICY message_templates_insert_own
  ON message_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

-- Modification : jamais un gabarit système, jamais celui d'un autre
DROP POLICY IF EXISTS message_templates_update_own ON message_templates;
CREATE POLICY message_templates_update_own
  ON message_templates FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

DROP POLICY IF EXISTS message_templates_delete_own ON message_templates;
CREATE POLICY message_templates_delete_own
  ON message_templates FOR DELETE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

-- =============================================================================
-- 3. RLS quiz_questions
-- =============================================================================

DROP POLICY IF EXISTS quiz_questions_select_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_insert_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_update_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_delete_auth ON quiz_questions;

DROP POLICY IF EXISTS quiz_questions_select_visible ON quiz_questions;
CREATE POLICY quiz_questions_select_visible
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR company_id = public.get_my_company_id()
  );

DROP POLICY IF EXISTS quiz_questions_insert_own ON quiz_questions;
CREATE POLICY quiz_questions_insert_own
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

DROP POLICY IF EXISTS quiz_questions_update_own ON quiz_questions;
CREATE POLICY quiz_questions_update_own
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

DROP POLICY IF EXISTS quiz_questions_delete_own ON quiz_questions;
CREATE POLICY quiz_questions_delete_own
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );

-- =============================================================================
-- 4. Quiz de la page piégée : questions système + celles de la société
-- =============================================================================

-- La page /t/[token] est publique : elle n'a pas de session, seulement le
-- jeton. La fonction résout donc la société à partir du jeton, puis renvoie
-- les questions système ET celles de cette société.
DROP FUNCTION IF EXISTS public.get_quiz_questions(TEXT);

CREATE OR REPLACE FUNCTION public.get_quiz_questions(
  p_type_fraude TEXT,
  p_token       TEXT
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  options JSONB,
  bonne_reponse INTEGER,
  ordre INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question, q.options, q.bonne_reponse, q.ordre
    FROM quiz_questions q
   WHERE q.actif = true
     AND (
       p_type_fraude IS NULL
       OR q.type_fraude IS NULL
       OR q.type_fraude = p_type_fraude
     )
     AND (
       q.company_id IS NULL
       OR q.company_id = (
            SELECT c.company_id
              FROM campaign_targets ct
              JOIN campaigns c ON c.id = ct.campaign_id
             WHERE ct.token_unique = p_token
             LIMIT 1
          )
     )
   ORDER BY q.ordre ASC, q.created_at ASC
$$;

REVOKE ALL ON FUNCTION public.get_quiz_questions(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(TEXT, TEXT)
  TO anon, authenticated;
