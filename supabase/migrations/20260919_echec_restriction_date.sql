-- Un refus sur une boîte choisie est d'abord une propagation en cours.
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- Référence : docs/RESTRICTION-UNION-ENTRA.md et le commentaire de
-- `conclure()` dans src/app/api/microsoft/restriction/route.ts
--
-- ============================================================================
-- CE QUI SE PASSAIT
-- ============================================================================
--
-- Microsoft répond « Access is denied » sur une boîte choisie. La route en
-- concluait « le périmètre ne contient pas les bonnes adresses » et proposait
-- deux réparations — réexécuter le script, modifier la sélection — alors que
-- le périmètre était juste et qu'il n'y avait rien à faire qu'attendre.
--
-- Trois causes produisent le même 403, et la route ne peut en distinguer
-- aucune : périmètre absent, filtre vide, filtre correct non encore propagé.
-- Elle tranchait quand même, et elle tranchait en accusant le client.
--
-- ⚠ LA LEÇON ÉTAIT DÉJÀ APPRISE, SUR L'AUTRE BRANCHE. Quand c'est le TÉMOIN
--   qui reste lisible, le message met la propagation en première cause, avec
--   un cas réel à l'appui. La branche symétrique ne l'avait jamais reçue.
--
-- ============================================================================
-- POURQUOI UNE DATE, ET PAS UN COMPTEUR DE TENTATIVES
-- ============================================================================
--
-- ⚠ UN COMPTEUR SE REMPLIT EN DIX SECONDES. Cinq clics sur « relancer la
--   vérification » suffiraient à franchir un seuil de cinq échecs, et le
--   client retomberait sur la liste des causes aussi vite qu'avant — c'est-à-
--   dire avant que la propagation ait eu la moindre chance d'aboutir. Ce qu'on
--   veut mesurer n'est pas l'insistance, c'est le TEMPS ÉCOULÉ.
--
-- ⚠ UNE SEULE DATE SUFFIT, ET ELLE EST PLUS SIMPLE QU'UN COMPTEUR. Le premier
--   échec est daté ; tout le reste se déduit. Pas de colonne à incrémenter,
--   pas de remise à zéro à oublier, aucune course entre deux vérifications
--   simultanées — `COALESCE` garde la première date quoi qu'il arrive.

-- =============================================================================
-- 1. La colonne
-- =============================================================================

ALTER TABLE microsoft_tenants
  ADD COLUMN IF NOT EXISTS restriction_premier_echec_at TIMESTAMPTZ;

COMMENT ON COLUMN microsoft_tenants.restriction_premier_echec_at IS
  'Première fois que la vérification a vu une boîte CHOISIE refusée, depuis la '
  'dernière vérification réussie. Sert à distinguer une propagation Exchange '
  'en cours (moins d''une heure) d''un périmètre réellement faux. NULL = aucun '
  'échec en cours.';

-- =============================================================================
-- 2. Dater le premier échec
-- =============================================================================

-- ⚠ ELLE REND LA DATE DU PREMIER ÉCHEC, PAS CELLE DE CELUI-CI. C'est tout
--   l'intérêt : l'appelant n'a pas à lire avant d'écrire, et deux
--   vérifications lancées en même temps rendent la même date.
--
-- ⚠ RÉSERVÉE À `service_role`. Un client qui pourrait l'appeler avancerait
--   l'horloge de son propre raccordement et se ferait proposer les autres
--   causes plus tôt. Sans gravité, mais sans raison non plus.
CREATE OR REPLACE FUNCTION public.signaler_echec_restriction(p_tenant_uid UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_at TIMESTAMPTZ;
BEGIN
  UPDATE microsoft_tenants
     SET restriction_premier_echec_at = COALESCE(restriction_premier_echec_at, now())
   WHERE id = p_tenant_uid
  RETURNING restriction_premier_echec_at INTO v_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;

  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.signaler_echec_restriction(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signaler_echec_restriction(UUID) TO service_role;

-- =============================================================================
-- 3. Une vérification réussie remet le compteur à zéro
-- =============================================================================

-- ⚠ SEULE LA RÉUSSITE EFFACE LA DATE. On pourrait être tenté de l'effacer
--   aussi quand le script est régénéré — l'écran le fait à chaque affichage,
--   et l'horloge ne repartirait jamais. Une correction réelle du périmètre
--   finit par faire réussir la vérification, qui efface la date : le cas est
--   couvert sans qu'on ait à deviner quand l'administrateur a agi.
--
-- Identique à 20260913_boites_retirees.sql pour tout le reste : même
-- signature, même type de retour, une seule ligne ajoutée.
CREATE OR REPLACE FUNCTION public.marquer_restriction_verifiee(
  p_tenant_uid UUID,
  p_preuve TEXT
)
RETURNS TABLE (boites_activees INTEGER, boites_verifiees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activees INTEGER;
  v_verifiees INTEGER;
BEGIN
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = now(),
         restriction_preuve = left(p_preuve, 500),
         raccorde_at = COALESCE(raccorde_at, now()),
         restriction_premier_echec_at = NULL
   WHERE id = p_tenant_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;

  SELECT count(*) INTO v_activees
    FROM boites_surveillees
   WHERE tenant_uid = p_tenant_uid AND choisie AND NOT actif;

  -- ⚠ « AND choisie ». Sans cette condition, la vérification réactivait toutes
  --   les lignes du locataire, y compris celles que le client venait de
  --   retirer : une boîte décochée revenait sous surveillance au contrôle
  --   suivant, sans que personne ne l'ait demandé.
  UPDATE boites_surveillees
     SET actif = TRUE, restriction_verifiee_at = now()
   WHERE tenant_uid = p_tenant_uid AND choisie;
  GET DIAGNOSTICS v_verifiees = ROW_COUNT;

  RETURN QUERY SELECT v_activees, v_verifiees;
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 4. Vérification
-- =============================================================================
--
-- Où en sont les raccordements qui échouent en ce moment :
--
--   SELECT tenant_id, restriction_premier_echec_at,
--          now() - restriction_premier_echec_at AS depuis
--     FROM microsoft_tenants
--    WHERE restriction_premier_echec_at IS NOT NULL;
--
-- Doit être vide sur un locataire dont la restriction est vérifiée.

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
--   DROP FUNCTION IF EXISTS public.signaler_echec_restriction(UUID);
--   ALTER TABLE microsoft_tenants DROP COLUMN IF EXISTS restriction_premier_echec_at;
--
-- ⚠ ET REMETTRE `marquer_restriction_verifiee` DANS SA VERSION DE
--   20260913_boites_retirees.sql — sinon elle référencerait une colonne
--   supprimée et toute vérification échouerait. Les deux gestes vont ensemble.
