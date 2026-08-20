-- Safentreprise Guard — identification du POSTE plutôt que de l'adresse
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- Pourquoi : l'unicité portait sur (company_id, employe_email). Une même
-- personne sur deux machines n'était donc comptée qu'une fois, et un poste
-- changeant de boîte écrasait la ligne précédente. La clé devient le poste,
-- identifié par un UUID tiré par l'extension à sa première exécution et
-- conservé dans son stockage local.
--
-- Le tableau de bord compte des PERSONNES : COUNT(DISTINCT employe_email).
--
-- Cette migration est idempotente et réparatrice : elle établit l'état
-- attendu quel que soit celui de la base au départ, y compris si des
-- fonctions ont été créées à la main dans l'éditeur SQL.

-- =============================================================================
-- 1. Colonne poste_id
-- =============================================================================

ALTER TABLE activations_extension
  ADD COLUMN IF NOT EXISTS poste_id UUID;

-- Lignes existantes : chacune devient son propre poste. On ne peut pas
-- deviner à quelle machine elles correspondaient.
UPDATE activations_extension
   SET poste_id = gen_random_uuid()
 WHERE poste_id IS NULL;

ALTER TABLE activations_extension
  ALTER COLUMN poste_id SET NOT NULL;

-- =============================================================================
-- 2. Bascule de la contrainte d'unicité
-- =============================================================================

-- L'ancienne clé interdisait deux postes pour une même personne.
ALTER TABLE activations_extension
  DROP CONSTRAINT IF EXISTS uq_activation_par_employe;

-- La nouvelle : un poste ne compte qu'une fois par société.
-- ⚠ Conséquence assumée : un poste sur lequel deux boîtes Gmail différentes
-- sont ouvertes ne conserve que la dernière adresse vue. Si ce cas doit être
-- couvert, étendre la clé à (company_id, poste_id, employe_email).
ALTER TABLE activations_extension
  DROP CONSTRAINT IF EXISTS uq_activation_par_poste;

ALTER TABLE activations_extension
  ADD CONSTRAINT uq_activation_par_poste UNIQUE (company_id, poste_id);

-- Le décompte du tableau de bord porte sur les adresses distinctes.
CREATE INDEX IF NOT EXISTS idx_activations_company_email
  ON activations_extension(company_id, employe_email);

-- =============================================================================
-- 3. Fonction d'enregistrement — signature à trois arguments
-- =============================================================================

-- Les anciennes signatures sont retirées pour lever toute ambiguïté de
-- résolution côté PostgREST : un appel RPC ne doit correspondre qu'à une
-- seule fonction.
DROP FUNCTION IF EXISTS public.enregistrer_activation_extension(TEXT, TEXT);

-- Variante à deux arguments éventuellement créée à la main dans l'éditeur
-- SQL. Sans ce retrait, verifier_code_activation resterait surchargée et le
-- comportement dépendrait de ce qui traîne en base.
DROP FUNCTION IF EXISTS public.verifier_code_activation(TEXT, TEXT);

-- verifier_code_activation(TEXT) — un seul argument — est la vérification
-- simple, sans effet de bord. Elle est RECRÉÉE ici : une base ayant reçu la
-- variante à deux arguments avait vu l'originale supprimée, et le DROP
-- ci-dessus la laisserait alors absente. La recréer garantit que la base
-- converge vers ce que décrivent les migrations, quel que soit son passé.
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
GRANT EXECUTE ON FUNCTION public.verifier_code_activation(TEXT)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enregistrer_activation_extension(
  p_code          TEXT,
  p_employe_email TEXT DEFAULT NULL,
  p_poste_id      UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_nom        TEXT;
  v_email      TEXT;
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

  -- L'enrôlement exige les DEUX : sans poste, pas de clé ; sans adresse,
  -- rien à compter. La vérification de code seule reste possible.
  IF p_poste_id IS NOT NULL
     AND v_email <> ''
     AND v_email LIKE '%_@_%.__%'
  THEN
    INSERT INTO activations_extension (company_id, poste_id, employe_email)
    VALUES (v_company_id, p_poste_id, v_email)
    ON CONFLICT (company_id, poste_id)
    DO UPDATE SET employe_email = EXCLUDED.employe_email,
                  last_seen_at  = now();
  END IF;

  RETURN v_nom;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_activation_extension(TEXT, TEXT, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_activation_extension(TEXT, TEXT, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 4. Contrôle — à lire après application
-- =============================================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('verifier_code_activation',
--                      'enregistrer_activation_extension');
--
-- Attendu, exactement deux lignes :
--   enregistrer_activation_extension | p_code text, p_employe_email text, p_poste_id uuid
--   verifier_code_activation         | p_code text
