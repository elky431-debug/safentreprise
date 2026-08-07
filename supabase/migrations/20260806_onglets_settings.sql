-- =============================================================================
-- Safentreprise — SQL à exécuter (déjà inclus dans supabase/schema.sql)
-- Appliquer via : npm run db:apply
-- Ou coller ce bloc dans le SQL Editor Supabase si besoin ciblé.
-- =============================================================================

-- 1) Questions du quiz (lecture auth + RPC publique minimale)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_fraude TEXT CHECK (type_fraude IS NULL OR type_fraude IN ('president', 'fournisseur')),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  bonne_reponse INTEGER NOT NULL CHECK (bonne_reponse >= 0),
  ordre INTEGER NOT NULL DEFAULT 1,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_actif_ordre
  ON quiz_questions(actif, ordre);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_questions_select_auth ON quiz_questions;
CREATE POLICY quiz_questions_select_auth
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS quiz_questions_insert_auth ON quiz_questions;
CREATE POLICY quiz_questions_insert_auth
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS quiz_questions_update_auth ON quiz_questions;
CREATE POLICY quiz_questions_update_auth
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS quiz_questions_delete_auth ON quiz_questions;
CREATE POLICY quiz_questions_delete_auth
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (true);

-- RPC publique : champs minimaux uniquement (pas de données société)
CREATE OR REPLACE FUNCTION public.get_quiz_questions(p_type_fraude TEXT DEFAULT NULL)
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
   ORDER BY q.ordre ASC, q.created_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_questions(TEXT) TO anon, authenticated;

-- Seeds (idempotents)
INSERT INTO quiz_questions (id, type_fraude, question, options, bonne_reponse, ordre, actif)
VALUES
(
  'b1000000-0000-4000-8000-000000000001',
  NULL,
  'Un email urgent demande un virement « confidentiel » au nom du dirigeant. Que faites-vous en premier ?',
  '["Exécuter le virement immédiatement pour ne pas le contrarier","Vérifier par un canal indépendant (téléphone connu, discussion en personne)","Répondre à l''email pour demander l''IBAN","Transférer le message à toute la comptabilité"]'::jsonb,
  1, 1, true
),
(
  'b1000000-0000-4000-8000-000000000002',
  'fournisseur',
  'Quel signal doit vous alerter dans une demande de changement de RIB fournisseur ?',
  '["Le message mentionne le nom de votre société","La demande est pressante et contourne la procédure habituelle de double contrôle","L''objet du mail est professionnel","Le message contient une signature"]'::jsonb,
  1, 2, true
),
(
  'b1000000-0000-4000-8000-000000000003',
  NULL,
  'L''adresse d''expédition affiche le nom du dirigeant, mais le domaine est inconnu. C''est…',
  '["Normal : les dirigeants utilisent souvent des adresses personnelles","Un signal d''usurpation d''identité classique","Une preuve que le message est authentique","Sans importance si le ton est familier"]'::jsonb,
  1, 3, true
),
(
  'b1000000-0000-4000-8000-000000000004',
  NULL,
  'En cas de doute sur un message financier, la bonne pratique est de…',
  '["Cliquer sur le lien du message pour « vérifier »","Ignorer toute procédure écrite et se fier à l''urgence","Suivre la procédure interne (validation croisée) avant tout paiement","Demander les coordonnées bancaires uniquement par email"]'::jsonb,
  2, 4, true
),
(
  'b1000000-0000-4000-8000-000000000005',
  'president',
  'Quel ordre de grandeur pour le préjudice moyen d''une fraude au président ?',
  '["Quelques centaines d''euros","Environ 75 000 € en moyenne (et bien plus dans certains cas)","Toujours moins de 1 000 €","Aucun préjudice financier, seulement de l''image"]'::jsonb,
  1, 5, true
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  options = EXCLUDED.options,
  bonne_reponse = EXCLUDED.bonne_reponse,
  ordre = EXCLUDED.ordre,
  actif = true;

-- 2) Édition des gabarits pour les comptes authentifiés
DROP POLICY IF EXISTS message_templates_select_all_auth ON message_templates;
CREATE POLICY message_templates_select_all_auth
  ON message_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS message_templates_update_auth ON message_templates;
CREATE POLICY message_templates_update_auth
  ON message_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3) Bucket Storage PDF certificats
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  true,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS certificates_storage_select ON storage.objects;
CREATE POLICY certificates_storage_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates');

DROP POLICY IF EXISTS certificates_storage_insert ON storage.objects;
CREATE POLICY certificates_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_update ON storage.objects;
CREATE POLICY certificates_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_delete ON storage.objects;
CREATE POLICY certificates_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );
