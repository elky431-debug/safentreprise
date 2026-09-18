-- Lot 4 du parcours de raccordement : ce que voit le dirigeant.
-- Appliquer via : npm run db:apply — ou le SQL Editor Supabase.
--
-- Référence : docs/PARCOURS-RACCORDEMENT.md, « Parcours dirigeant »
--
-- ⚠ TOUJOURS ADDITIF. Deux fonctions nouvelles, aucune modification. Le
--   principe tenu depuis le lot 1 ne change pas tant que le nouveau parcours
--   n'a pas raccordé un client réel de bout en bout.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Le suivi
-- =============================================================================

-- ⚠ C'EST L'ÉCRAN QUE LE DIRIGEANT REGARDERA LE PLUS SOUVENT, et il le
--   regardera surtout pendant qu'il ne se passe RIEN. D'où ce que cette
--   fonction rend : non pas un état technique, mais de quoi répondre à trois
--   questions — est-ce parti, est-ce lu, qu'est-ce qu'on attend.
--
-- ⚠ ELLE REND LE JETON EN CLAIR, ET C'EST VOULU. Le dirigeant doit pouvoir
--   repasser le lien par un autre canal quand son informaticien dit ne l'avoir
--   jamais reçu — c'est le cas le plus fréquent d'un raccordement qui n'avance
--   pas. Il est déjà le seul à pouvoir le révoquer ; le lui cacher ne
--   protégerait personne et le laisserait sans recours.
CREATE OR REPLACE FUNCTION public.suivi_raccordement()
RETURNS TABLE (
  jeton TEXT,
  destinataire_nom TEXT,
  destinataire_email TEXT,
  adresses_demandees TEXT[],
  envoye_at TIMESTAMPTZ,
  ouvert_at TIMESTAMPTZ,
  expire_at TIMESTAMPTZ,
  termine_at TIMESTAMPTZ,
  accord_donne BOOLEAN,
  tenant_id TEXT,
  tenant_confirme_at TIMESTAMPTZ,
  restriction_verifiee_at TIMESTAMPTZ,
  boites_choisies INTEGER,
  boites_actives INTEGER,
  blocages_ouverts INTEGER,
  dernier_blocage_motif TEXT,
  dernier_blocage_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_tenant RECORD;
BEGIN
  v_company := get_my_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Aucune société pour cette session.';
  END IF;

  SELECT t.id, t.tenant_id, t.confirme_par_dirigeant_at
    INTO v_tenant
    FROM microsoft_tenants t
   WHERE t.company_id = v_company
   ORDER BY t.created_at DESC
   LIMIT 1;

  RETURN QUERY
    SELECT
      j.jeton, j.destinataire_nom, j.destinataire_email, j.adresses_demandees,
      j.envoye_at, j.ouvert_at, j.expire_at, j.termine_at,
      v_tenant.id IS NOT NULL,
      v_tenant.tenant_id,
      v_tenant.confirme_par_dirigeant_at,
      (SELECT max(b.restriction_verifiee_at) FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.choisie),
      (SELECT count(*)::INTEGER FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.choisie),
      (SELECT count(*)::INTEGER FROM boites_surveillees b
        WHERE b.tenant_uid = v_tenant.id AND b.actif),
      (SELECT count(*)::INTEGER FROM raccordement_blocages r
        WHERE r.company_id = v_company AND r.traite_at IS NULL),
      (SELECT r.motif FROM raccordement_blocages r
        WHERE r.company_id = v_company AND r.traite_at IS NULL
        ORDER BY r.signale_at DESC LIMIT 1),
      (SELECT max(r.signale_at) FROM raccordement_blocages r
        WHERE r.company_id = v_company AND r.traite_at IS NULL)
    -- ⚠ LE DERNIER JETON, PAS LE DERNIER NON RÉVOQUÉ. La différence a été vue
    --   sur un cas réel : après « changer d'informaticien », un jeton TERMINÉ
    --   plus ancien remontait, et le dirigeant qui venait de tout relancer
    --   voyait « c'est opérationnel ». Prendre le dernier créé puis écarter
    --   les révoqués rend l'écran fidèle à la dernière décision prise.
    --
    -- ⚠ UN JETON TERMINÉ, LUI, DOIT REMONTER : c'est l'écran de confirmation
    --   du dirigeant. Ne pas l'écarter avec les révoqués.
    FROM (
      SELECT * FROM raccordement_jetons
       WHERE company_id = v_company
       ORDER BY cree_at DESC
       LIMIT 1
    ) j
   WHERE j.revoque_at IS NULL;

  -- ⚠ AUCUNE LIGNE QUAND AUCUN LIEN N'A ÉTÉ CRÉÉ — ou quand le dernier vient
  --   d'être révoqué. C'est ce que l'écran attend : il affiche alors le
  --   premier écran du parcours, pas un suivi vide. Rendre une ligne de zéros
  --   ferait afficher « envoyé à — » à quelqu'un qui n'a encore rien envoyé.
END;
$$;

REVOKE ALL ON FUNCTION public.suivi_raccordement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suivi_raccordement()
  TO authenticated, service_role;

-- =============================================================================
-- 2. La confirmation du locataire
-- =============================================================================

-- ⚠ UN CLIC CONTRE UN RATTACHEMENT DE LOCATAIRE PIRATE. Détenir le lien ne
--   suffit pas à consentir — Microsoft exige d'être administrateur général du
--   locataire. Mais un attaquant qui contrôle SON PROPRE locataire pourrait y
--   rattacher la société du client. Le dirigeant reconnaît donc le domaine.
--
-- ⚠ LE DIRIGEANT CONFIRME CE QUE LA BASE AFFICHE, IL NE L'ENVOIE PAS. La
--   fonction ne prend aucun paramètre : elle confirme le locataire rattaché à
--   SA société. Accepter un `tenant_id` permettrait de faire confirmer par
--   l'écran un locataire que l'écran n'a pas montré.
CREATE OR REPLACE FUNCTION public.confirmer_locataire_dirigeant()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_n INTEGER;
BEGIN
  v_company := get_my_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Aucune société pour cette session.';
  END IF;

  UPDATE microsoft_tenants
     SET confirme_par_dirigeant_at = now()
   WHERE company_id = v_company AND confirme_par_dirigeant_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmer_locataire_dirigeant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmer_locataire_dirigeant()
  TO authenticated, service_role;

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
--   DROP FUNCTION IF EXISTS public.confirmer_locataire_dirigeant();
--   DROP FUNCTION IF EXISTS public.suivi_raccordement();
--
-- Rien d'autre à défaire : cette migration ne crée ni table ni colonne, et ne
-- redéfinit aucune fonction existante.
