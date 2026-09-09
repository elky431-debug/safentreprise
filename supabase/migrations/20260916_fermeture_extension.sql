-- Fermeture des fonctions de l'extension Safentreprise Guard
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : les routes /api/extension/menace et /api/extension/verifier-code
-- répondent 410 depuis le commit précédent, mais leurs fonctions restaient
-- accordées à anon et authenticated — donc appelables DIRECTEMENT par
-- PostgREST, sans passer par les routes fermées. Fermer les routes ne fermait
-- pas la porte. Cette migration la ferme.
--
-- Les fonctions ne sont PAS supprimées, aucune table n'est touchée : on ferme
-- l'accès d'abord, on nettoie ensuite.

-- =============================================================================
-- 1. Révocation
-- =============================================================================

-- ⚠ RÉVOQUER SUR anon NE SUFFIT PAS, ET C'EST LE PIÈGE CENTRAL DE CETTE
--   MIGRATION. En PostgreSQL, EXECUTE est accordé à PUBLIC par défaut sur
--   toute fonction créée, et anon comme authenticated héritent de PUBLIC.
--   Vérifié sur un harnais local : après un REVOKE portant uniquement sur
--   anon et authenticated, « SET ROLE anon ; SELECT la_fonction() » renvoie
--   toujours son résultat. Il faut révoquer sur PUBLIC pour que l'appel soit
--   refusé.
--
-- ⚠ ON PARCOURT LE CATALOGUE PLUTÔT QUE D'ÉCRIRE LES SIGNATURES À LA MAIN.
--   verifier_code_activation a existé en deux surcharges — (TEXT) et
--   (TEXT, TEXT) — et la seconde n'a été supprimée que par la migration
--   20260820, alors que schema.sql la déclare encore. Selon qu'une base a été
--   construite par les migrations ou par schema.sql, les surcharges présentes
--   diffèrent. Une liste écrite à la main en oublierait une, et la porte
--   resterait ouverte par cette surcharge-là.
--
-- ⚠ LES RÔLES SONT VÉRIFIÉS AVANT D'ÊTRE NOMMÉS. Un REVOKE sur un rôle absent
--   échoue et fait tomber toute la migration. anon et authenticated existent
--   sur Supabase, pas sur un PostgreSQL nu.

DO $$
DECLARE
  f RECORD;
  v_roles TEXT;
  v_total INTEGER := 0;
BEGIN
  SELECT string_agg(quote_ident(r), ', ')
    INTO v_roles
    FROM (
      SELECT unnest(ARRAY['anon', 'authenticated']) AS r
    ) demandes
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = demandes.r);

  -- PUBLIC n'est pas un rôle du catalogue : il est toujours nommé.
  v_roles := CASE
    WHEN v_roles IS NULL THEN 'PUBLIC'
    ELSE 'PUBLIC, ' || v_roles
  END;

  FOR f IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'enregistrer_menace',
         'verifier_code_activation',
         'regenerer_code_activation'
       )
     ORDER BY 1
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', f.signature, v_roles);
    RAISE LOG 'fermeture_extension : révoqué sur % — %', v_roles, f.signature;
    v_total := v_total + 1;
  END LOOP;

  IF v_total = 0 THEN
    RAISE LOG 'fermeture_extension : aucune fonction trouvée, rien à révoquer';
  ELSE
    RAISE LOG 'fermeture_extension : % fonction(s) fermée(s)', v_total;
  END IF;
END $$;

-- =============================================================================
-- 2. Ce qui n'est PAS fait ici, et pourquoi
-- =============================================================================

-- LES FONCTIONS RESTENT EN PLACE. Elles ne sont plus appelables par un client,
-- mais restent exécutables par le propriétaire de la base depuis le SQL Editor
-- — utile pour reprendre une ligne à la main pendant la transition.
--
-- LES TABLES RESTENT EN PLACE. menaces_detectees garde les alertes historiques
-- jusqu'à leur purge à douze mois. activations_extension est encore LUE par le
-- tableau de bord, pour l'axe technique du score de risque : la supprimer
-- casserait le calcul.
--
-- LE COMPORTEMENT DU PRODUIT NE CHANGE PAS. Aucun écran n'appelle plus ces
-- fonctions depuis la suppression de /settings/extension, et les deux routes
-- répondent 410. Cette migration ne retire donc rien à personne — elle ferme
-- une porte que plus rien n'empruntait légitimement.

-- =============================================================================
-- 3. Vérification
-- =============================================================================

-- Les droits restants sur les trois fonctions :
--
--   SELECT p.oid::regprocedure AS fonction,
--          coalesce(array_to_string(p.proacl, E'\n'), '(défaut : PUBLIC)') AS droits
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('enregistrer_menace',
--                        'verifier_code_activation',
--                        'regenerer_code_activation')
--    ORDER BY 1;
--
-- Aucune ligne ne doit contenir « anon= », « authenticated= », ni « =X/ » sans
-- rôle devant (qui dénoterait un droit PUBLIC).
--
-- Et l'appel lui-même, qui doit être refusé :
--
--   SET ROLE anon;
--   SELECT public.verifier_code_activation('PEU-IMPORTE');
--   -- ERROR: permission denied for function verifier_code_activation
--   RESET ROLE;
