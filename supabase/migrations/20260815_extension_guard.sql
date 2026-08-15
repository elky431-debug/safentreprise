-- Safentreprise Guard — activation par code + remontée des menaces
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- Principe de confidentialité : seules des MÉTADONNÉES d'email transitent et
-- sont stockées. Aucune colonne ne reçoit de corps de message, d'extrait ou de
-- pièce jointe.

-- =============================================================================
-- 1. Code d'activation de l'extension (table companies)
-- =============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS code_activation TEXT;

-- Génère un code lisible « SAFE-A3X9K2 ».
-- Alphabet sans caractères ambigus (ni I, ni O, ni 0, ni 1) : le code doit
-- pouvoir être dicté au téléphone sans confusion.
CREATE OR REPLACE FUNCTION public.generer_code_activation()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_essais INTEGER := 0;
BEGIN
  LOOP
    v_code := 'SAFE-';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(
        v_alphabet,
        floor(random() * length(v_alphabet))::int + 1,
        1
      );
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM companies WHERE code_activation = v_code
    );

    v_essais := v_essais + 1;
    IF v_essais > 50 THEN
      RAISE EXCEPTION 'Impossible de générer un code d''activation unique.';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

-- Sociétés déjà créées : on leur attribue un code.
UPDATE companies
   SET code_activation = public.generer_code_activation()
 WHERE code_activation IS NULL;

-- Toute nouvelle société reçoit automatiquement son code.
ALTER TABLE companies
  ALTER COLUMN code_activation SET DEFAULT public.generer_code_activation();

ALTER TABLE companies
  ALTER COLUMN code_activation SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_activation
  ON companies(code_activation);

-- Le code est le seul secret qui autorise l'envoi d'alertes : il ne doit pas
-- pouvoir être choisi depuis le navigateur. La politique companies_update_own
-- autorise le dirigeant à modifier sa fiche ; ce déclencheur restaure
-- silencieusement l'ancien code, sauf rotation explicite (drapeau de
-- transaction posé par regenerer_code_activation).
CREATE OR REPLACE FUNCTION public.proteger_code_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code_activation IS DISTINCT FROM OLD.code_activation
     AND COALESCE(
           current_setting('safentreprise.rotation_code', true), ''
         ) <> 'on'
  THEN
    NEW.code_activation := OLD.code_activation;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_code_activation ON companies;
CREATE TRIGGER trg_proteger_code_activation
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_code_activation();

-- Rotation du code depuis la page /settings/extension.
-- Invalide immédiatement toutes les extensions déjà activées.
CREATE OR REPLACE FUNCTION public.regenerer_code_activation()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_code TEXT;
BEGIN
  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Aucune société associée à cet utilisateur.';
  END IF;

  v_code := public.generer_code_activation();

  PERFORM set_config('safentreprise.rotation_code', 'on', true);
  UPDATE companies SET code_activation = v_code WHERE id = v_company_id;
  PERFORM set_config('safentreprise.rotation_code', 'off', true);

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerer_code_activation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerer_code_activation() TO authenticated;

-- =============================================================================
-- 2. Table des menaces détectées — MÉTADONNÉES UNIQUEMENT
-- =============================================================================

CREATE TABLE IF NOT EXISTS menaces_detectees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Identité affichée par le message frauduleux
  expediteur_nom TEXT,
  expediteur_email TEXT NOT NULL,
  -- Nom signé en bas du message (celui du dirigeant usurpé)
  nom_signe TEXT,
  objet TEXT,
  niveau_risque TEXT NOT NULL
    CHECK (niveau_risque IN ('faible', 'modere', 'eleve')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Libellés des signaux relevés, ex. ["domaine_grand_public", "virement"]
  signaux JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Destinataire de l'alerte ; nul si la société est en mode anonymisé
  employe_email TEXT,
  detecte_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Volontairement absentes : aucune colonne de corps de message, d'extrait,
-- d'en-têtes bruts ou de pièce jointe. Ne pas en ajouter.

CREATE INDEX IF NOT EXISTS idx_menaces_company_date
  ON menaces_detectees(company_id, detecte_at DESC);

ALTER TABLE menaces_detectees ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque dirigeant ne voit que les menaces de SA société.
DROP POLICY IF EXISTS menaces_detectees_select_own ON menaces_detectees;
CREATE POLICY menaces_detectees_select_own
  ON menaces_detectees FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Purge manuelle depuis le tableau de bord.
DROP POLICY IF EXISTS menaces_detectees_delete_own ON menaces_detectees;
CREATE POLICY menaces_detectees_delete_own
  ON menaces_detectees FOR DELETE
  USING (company_id = public.get_my_company_id());

-- Aucune politique INSERT : l'extension n'écrit jamais en direct. Elle passe
-- par enregistrer_menace(), qui valide le code d'activation.

-- =============================================================================
-- 3. Fonctions appelées par l'extension (via les routes /api/extension/…)
-- =============================================================================

-- Vérifie un code d'activation. Renvoie le nom de la société, ou NULL.
CREATE OR REPLACE FUNCTION public.verifier_code_activation(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nom
    FROM companies
   WHERE code_activation = upper(btrim(p_code))
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.verifier_code_activation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifier_code_activation(TEXT) TO anon, authenticated;

-- Enregistre une menace après validation du code d'activation.
-- Renvoie l'identifiant créé, ou NULL si le code est inconnu (→ 401 côté API).
CREATE OR REPLACE FUNCTION public.enregistrer_menace(
  p_code_activation TEXT,
  p_expediteur_nom  TEXT,
  p_expediteur_email TEXT,
  p_nom_signe       TEXT,
  p_objet           TEXT,
  p_niveau_risque   TEXT,
  p_score           INTEGER,
  p_signaux         JSONB,
  p_employe_email   TEXT,
  p_detecte_at      TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_company_id
    FROM companies
   WHERE code_activation = upper(btrim(p_code_activation));

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO menaces_detectees (
    company_id, expediteur_nom, expediteur_email, nom_signe, objet,
    niveau_risque, score, signaux, employe_email, detecte_at
  )
  VALUES (
    v_company_id,
    p_expediteur_nom,
    p_expediteur_email,
    p_nom_signe,
    p_objet,
    p_niveau_risque,
    p_score,
    COALESCE(p_signaux, '[]'::jsonb),
    p_employe_email,
    COALESCE(p_detecte_at, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_menace(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_menace(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TIMESTAMPTZ
) TO anon, authenticated;
