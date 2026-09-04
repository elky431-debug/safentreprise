-- Le jeton d'état ne doit dépendre d'aucune extension
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI N'ALLAIT PAS. demarrer_consentement_graph() échouait en production :
--
--   ERROR: function gen_random_bytes(integer) does not exist
--
-- gen_random_bytes vient de pgcrypto. Sur Supabase, pgcrypto est installée
-- dans le schéma « extensions », pas dans « public ». Or la fonction porte
-- SET search_path = public — pour de bonnes raisons de sécurité — et ne
-- pouvait donc pas la résoudre.
--
-- POURQUOI ÇA N'AVAIT PAS ÉTÉ VU. gen_random_bytes n'apparaît nulle part
-- ailleurs dans le dépôt : rien en production n'avait jamais prouvé que
-- pgcrypto était atteignable depuis public. Et le harnais de test local
-- installe pgcrypto dans public par défaut, ce qui masquait exactement ce
-- cas : dix-neuf vérifications passaient en local et la première tentative
-- réelle échouait.
--
-- LA CORRECTION. On supprime la dépendance au lieu d'élargir le search_path.
-- gen_random_uuid() est une fonction du cœur de PostgreSQL depuis la version
-- 13 — aucune extension, donc rien à résoudre. Deux UUID donnent 64
-- caractères hexadécimaux, soit 244 bits d'aléa, et l'hexadécimal n'a rien
-- à échapper dans une URL.
--
-- ⚠ NE PAS RÉINTRODUIRE gen_random_bytes, digest, crypt ou hmac dans une
--   fonction portant SET search_path = public : elles sont toutes dans
--   pgcrypto, donc hors de portée.

CREATE OR REPLACE FUNCTION public.demarrer_consentement_graph(
  p_email TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL
)
RETURNS TABLE (etat TEXT, expire_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_etat TEXT;
BEGIN
  v_company := get_my_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Aucune société pour cette session.';
  END IF;

  -- 64 caractères hexadécimaux, sans extension et sans caractère à échapper.
  v_etat := replace(gen_random_uuid()::TEXT, '-', '')
         || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO graph_consentements (company_id, etat, demande_par, demande_ip)
  VALUES (v_company, v_etat, p_email, left(COALESCE(p_ip, ''), 60));

  RETURN QUERY
    SELECT c.etat, c.expire_at FROM graph_consentements c WHERE c.etat = v_etat;
END;
$$;

REVOKE ALL ON FUNCTION public.demarrer_consentement_graph(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demarrer_consentement_graph(TEXT, TEXT) TO authenticated, service_role;

-- =============================================================================
-- Vérification
-- =============================================================================

-- Doit rendre un jeton de 64 caractères, et une expiration à quinze minutes :
--
--   SELECT length(etat), expire_at FROM demarrer_consentement_graph('vous@…', NULL);
--
-- Puis, pour ne pas laisser traîner un jeton d'essai :
--
--   DELETE FROM graph_consentements WHERE utilise_at IS NULL;
--
-- Contrôle de principe — aucune fonction de pgcrypto ne doit apparaître dans
-- une fonction limitée à public :
--
--   SELECT p.proname
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prosrc ~ '(gen_random_bytes|digest\(|crypt\(|hmac\()';
--
-- Elle doit ne rien renvoyer.
