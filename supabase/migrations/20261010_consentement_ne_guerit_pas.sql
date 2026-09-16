-- =============================================================================
-- 20261010 — Redonner le consentement Entra n'efface plus une panne de courrier
-- =============================================================================
--
-- ⚠ LE DÉFAUT, CONSTATÉ LE 16 SEPTEMBRE 2026. Après un test de révocation
--   réussi — rôle Exchange supprimé, sonde ayant correctement basculé en
--   `revoque` / `panne_portee = 'courrier'` — l'écran /microsoft invitait à
--   « redonner l'accord ». Le consentement Entra redonné, cette fonction
--   repassait `statut = 'actif'` : le bandeau rouge disparaissait, le tableau
--   de bord réaffichait « 1 boîte surveillée », et RIEN N'ÉTAIT ANALYSÉ. Le
--   rôle Exchange était toujours supprimé.
--
--   C'est le mensonge d'interface que la sonde de santé avait justement pour
--   mission de supprimer, revenu par une autre porte — et celle-ci est pire,
--   parce que c'est l'interface qui invitait au geste qui l'éteignait.
--
-- ⚠ LA RÈGLE QUI EN DÉCOULE, ET QUI NE DOIT PAS ÊTRE ASSOUPLIE :
--
--       SEULE UNE SONDE QUI LIT RÉELLEMENT UN MESSAGE PEUT SORTIR UN
--       LOCATAIRE DE L'ÉTAT « revoque ». Aucun geste d'interface, aucun
--       consentement, aucune action d'administrateur ne le peut.
--
--   Le consentement prouve que la porte ENTRA est ouverte. Il ne prouve rien
--   sur la porte EXCHANGE, qui est celle qui donne accès au courrier. Ce sont
--   deux portes indépendantes — c'est établi depuis le 15 septembre, et le
--   test du geste A l'a confirmé : retirer le rôle Exchange ne touche pas
--   l'annuaire, et redonner Entra ne rend pas le courrier.
--
-- ⚠ CE QUE LA FONCTION CONTINUE DE FAIRE. Elle enregistre le consentement :
--   qui, quand, depuis quelle adresse. C'est une preuve, elle doit être
--   conservée. Elle efface aussi `derniere_erreur`, qui est un message
--   d'affichage et non un constat. Seul `statut` est laissé à la sonde.
--
--   Conséquence visible : après un consentement légitimement redonné, le
--   locataire reste `revoque` jusqu'au passage suivant de la sonde, au plus
--   trente minutes. L'interface doit dire « accord reçu, vérification en
--   cours » — ce qui est vrai — plutôt que « tout va bien » — ce qui ne l'est
--   pas encore. Un écran honnêtement en retard vaut mieux qu'un écran
--   faussement vert.

CREATE OR REPLACE FUNCTION public.valider_consentement_graph(
  p_etat          TEXT,
  p_tenant_id     TEXT,
  p_consenti_par  TEXT DEFAULT NULL,
  p_ip            TEXT DEFAULT NULL
)
RETURNS TABLE (resultat TEXT, tenant_uid UUID, company_id UUID, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligne        RECORD;
  v_proprietaire UUID;
  v_tenant_uid   UUID;
  v_qui          TEXT;
BEGIN
  SELECT * INTO v_ligne
    FROM graph_consentements
   WHERE etat = p_etat FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalide', NULL::UUID, NULL::UUID,
      'Jeton d''état inconnu. Relancer le raccordement.';
    RETURN;
  END IF;

  IF v_ligne.utilise_at IS NOT NULL THEN
    RETURN QUERY SELECT 'invalide', NULL::UUID, v_ligne.company_id,
      'Ce lien a déjà servi. Relancer le raccordement.';
    RETURN;
  END IF;

  IF v_ligne.expire_at < now() THEN
    UPDATE graph_consentements
       SET utilise_at = now(), resultat = 'expire', tenant_id = p_tenant_id
     WHERE id = v_ligne.id;
    RETURN QUERY SELECT 'invalide', NULL::UUID, v_ligne.company_id,
      'Le lien a expiré. Relancer le raccordement.';
    RETURN;
  END IF;

  SELECT t.company_id INTO v_proprietaire
    FROM microsoft_tenants t WHERE t.tenant_id = p_tenant_id;

  IF v_proprietaire IS NOT NULL AND v_proprietaire <> v_ligne.company_id THEN
    UPDATE graph_consentements
       SET utilise_at = now(), resultat = 'invalide', tenant_id = p_tenant_id,
           detail = 'Locataire déjà rattaché à une autre société.'
     WHERE id = v_ligne.id;
    RETURN QUERY SELECT 'invalide', NULL::UUID, v_ligne.company_id,
      'Ce locataire Microsoft est déjà rattaché à une autre société.';
    RETURN;
  END IF;

  v_qui := COALESCE(v_ligne.demande_par, p_consenti_par);

  INSERT INTO microsoft_tenants
    (company_id, tenant_id, consenti_par, consenti_at, consenti_ip,
     statut, derniere_erreur, verifie_at)
  VALUES
    (v_ligne.company_id, p_tenant_id, v_qui, now(),
     left(COALESCE(p_ip, v_ligne.demande_ip, ''), 60), 'actif', NULL, now())
  ON CONFLICT (tenant_id) DO UPDATE
     SET consenti_par    = EXCLUDED.consenti_par,
         consenti_at     = EXCLUDED.consenti_at,
         consenti_ip     = EXCLUDED.consenti_ip,
         derniere_erreur = NULL,
         verifie_at      = now(),
         -- ⚠ LE CŒUR DE LA CORRECTION. `statut = 'actif'` inconditionnel est
         --   remplacé par une règle qui ne guérit que ce que le consentement
         --   prouve réellement.
         --
         --   • `revoque` + `panne_portee = 'courrier'` : la porte Entra n'a
         --     jamais été fermée, le consentement ne dit donc RIEN sur la
         --     panne. Le statut est conservé tel quel ; la sonde tranchera.
         --   • `revoque` + `panne_portee = 'tout'` : le jeton lui-même avait
         --     échoué. Le consentement vient d'en obtenir un — c'est la route
         --     appelante qui le prouve — mais l'accès au COURRIER reste
         --     inconnu. On conserve `revoque` là aussi : seule une lecture de
         --     message le prouvera.
         --   • tout autre cas (premier raccordement, `erreur` passagère) :
         --     retour à `actif`, comme avant.
         statut = CASE
                    WHEN microsoft_tenants.statut = 'revoque' THEN 'revoque'
                    ELSE 'actif'
                  END
  RETURNING id INTO v_tenant_uid;

  UPDATE graph_consentements
     SET utilise_at = now(), resultat = 'accorde', tenant_id = p_tenant_id,
         detail = 'Jeton d''application obtenu : consentement confirmé.'
   WHERE id = v_ligne.id;

  RETURN QUERY SELECT 'accorde', v_tenant_uid, v_ligne.company_id,
    'Consentement enregistré au nom de ' || COALESCE(v_qui, 'inconnu') || '.';
END;
$$;

REVOKE ALL ON FUNCTION public.valider_consentement_graph(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valider_consentement_graph(TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================
--
-- Sur le locataire en panne de courrier, avant toute nouvelle tentative :
--
--   SELECT tenant_id, statut, panne_portee, echecs_sante, sante_bascule_at
--     FROM microsoft_tenants;
--
-- Après avoir redonné le consentement, `statut` doit RESTER `revoque` tant que
-- la sonde n'a pas lu un message. S'il repasse à `actif` sans que le rôle
-- Exchange ait été reposé, cette migration n'est pas appliquée.
