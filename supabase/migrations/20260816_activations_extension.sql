-- Safentreprise Guard — activations de l'extension par collaborateur
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- Objectif : savoir COMBIEN de collaborateurs ont réellement activé l'extension,
-- afin d'afficher un taux de couverture et d'alléger l'axe « Technique » du
-- score de risque à mesure que le déploiement progresse.
--
-- Confidentialité : une ligne ne contient qu'une adresse professionnelle et
-- deux horodatages. Aucun contenu d'email, ici non plus.

-- =============================================================================
-- 1. Table des activations — une ligne par collaborateur ayant activé
-- =============================================================================

CREATE TABLE IF NOT EXISTS activations_extension (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Adresse du compte de messagerie sur lequel l'extension est active,
  -- toujours normalisée en minuscules par la fonction d'enregistrement.
  employe_email TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un collaborateur ne compte qu'une fois par société : réactiver depuis un
  -- autre poste rafraîchit la ligne au lieu d'en créer une seconde.
  CONSTRAINT uq_activation_par_employe UNIQUE (company_id, employe_email)
);

CREATE INDEX IF NOT EXISTS idx_activations_company
  ON activations_extension(company_id, last_seen_at DESC);

ALTER TABLE activations_extension ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque dirigeant ne voit que les activations de SA société.
DROP POLICY IF EXISTS activations_extension_select_own ON activations_extension;
CREATE POLICY activations_extension_select_own
  ON activations_extension FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Retrait manuel d'un poste depuis le tableau de bord.
DROP POLICY IF EXISTS activations_extension_delete_own ON activations_extension;
CREATE POLICY activations_extension_delete_own
  ON activations_extension FOR DELETE
  USING (company_id = public.get_my_company_id());

-- Aucune politique INSERT ni UPDATE : l'extension n'écrit jamais en direct,
-- elle passe par la fonction ci-dessous, qui valide d'abord le code.

-- =============================================================================
-- 2. Vérification du code + enregistrement de l'activation
-- =============================================================================

-- Remplace verifier_code_activation() pour les appels de l'extension : même
-- contrat de retour (nom de la société, ou NULL si le code est inconnu), mais
-- enregistre au passage l'activation quand une adresse est fournie.
--
-- Appelée sans adresse, la fonction se comporte exactement comme l'ancienne :
-- la compatibilité est préservée.
CREATE OR REPLACE FUNCTION public.enregistrer_activation_extension(
  p_code TEXT,
  p_employe_email TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_nom TEXT;
  v_email TEXT;
BEGIN
  SELECT id, nom
    INTO v_company_id, v_nom
    FROM companies
   WHERE code_activation = upper(btrim(p_code));

  -- Code inconnu : on ne révèle rien et on n'enregistre rien.
  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_email := lower(btrim(COALESCE(p_employe_email, '')));

  -- Adresse plausible seulement : un « a@b.co » minimal suffit à écarter les
  -- valeurs vides ou manifestement erronées.
  IF v_email <> '' AND v_email LIKE '%_@_%.__%' THEN
    INSERT INTO activations_extension (company_id, employe_email)
    VALUES (v_company_id, v_email)
    ON CONFLICT (company_id, employe_email)
    DO UPDATE SET last_seen_at = now();
  END IF;

  RETURN v_nom;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_activation_extension(TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_activation_extension(TEXT, TEXT)
  TO anon, authenticated;
