-- Demandes de démonstration issues de la landing (extrait de schema.sql)
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.

CREATE TABLE IF NOT EXISTS demandes_demo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  entreprise TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  message TEXT,
  statut TEXT NOT NULL DEFAULT 'nouvelle'
    CHECK (statut IN ('nouvelle', 'contactee', 'traitee', 'archivee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demandes_demo_date
  ON demandes_demo(created_at DESC);

ALTER TABLE demandes_demo ENABLE ROW LEVEL SECURITY;

-- Écriture publique : le formulaire est ouvert aux visiteurs non connectés.
DROP POLICY IF EXISTS demandes_demo_insert_public ON demandes_demo;
CREATE POLICY demandes_demo_insert_public
  ON demandes_demo FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Aucune politique SELECT / UPDATE / DELETE : les demandes ne sont lisibles
-- que depuis le back-office Supabase (Table Editor), jamais via l'API publique.
