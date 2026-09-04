-- La preuve du consentement porte enfin un nom
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI N'ALLAIT PAS. Le parcours fonctionne, consenti_at, consenti_ip et
-- verifie_at sont renseignés — mais microsoft_tenants.consenti_par reste NULL.
-- C'est exactement le trou que l'AIPD signalait, et qu'on prétendait combler.
--
-- LA CAUSE. valider_consentement_graph() écrit p_consenti_par tel quel
-- (ligne 202 de 20260907). La route, elle, passe NULL — délibérément, avec ce
-- commentaire :
--
--   « Le "qui" vient de la demande de départ, enregistrée dans
--     graph_consentements par la session Safentreprise — jamais de ce retour,
--     que personne ne contrôle. »
--
-- Le raisonnement est juste. Il n'a simplement jamais été implémenté : la
-- fonction ne lit pas graph_consentements.demande_par. J'ai écrit le
-- commentaire qui décrit la bonne conception, puis le code qui fait l'inverse.
--
-- POURQUOI LES TESTS NE L'ONT PAS VU. Le cas 2 appelait la fonction avec
-- p_consenti_par => 'dg@clientea.fr', ce que la vraie route ne fait pas. Le
-- test vérifiait donc que la fonction recopie ce qu'on lui donne, pas qu'elle
-- retrouve l'information là où elle se trouve. Un test qui n'imite pas son
-- appelant ne prouve rien.
--
-- LA CORRECTION. La fonction lit demande_par sur la ligne de consentement
-- qu'elle est déjà en train de verrouiller. C'est la source qui convient :
-- elle vient de la session Safentreprise au moment du départ, pas du retour
-- de Microsoft. Le paramètre reste accepté, en second choix, pour les appels
-- manuels.

CREATE OR REPLACE FUNCTION public.valider_consentement_graph(
  p_etat TEXT,
  p_tenant_id TEXT,
  p_consenti_par TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL
)
RETURNS TABLE (resultat TEXT, tenant_uid UUID, company_id UUID, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligne graph_consentements%ROWTYPE;
  v_tenant_uid UUID;
  v_proprietaire UUID;
  v_qui TEXT;
BEGIN
  SELECT * INTO v_ligne FROM graph_consentements
   WHERE etat = p_etat FOR UPDATE;

  IF v_ligne.id IS NULL THEN
    RETURN QUERY SELECT 'invalide', NULL::UUID, NULL::UUID,
      'Jeton d''état inconnu.';
    RETURN;
  END IF;

  IF v_ligne.utilise_at IS NOT NULL THEN
    RETURN QUERY SELECT 'invalide', NULL::UUID, v_ligne.company_id,
      'Jeton déjà utilisé le ' || v_ligne.utilise_at::TEXT || '.';
    RETURN;
  END IF;

  IF v_ligne.expire_at < now() THEN
    UPDATE graph_consentements
       SET utilise_at = now(), resultat = 'expire',
           detail = 'Expiré avant le retour.'
     WHERE id = v_ligne.id;
    RETURN QUERY SELECT 'expire', NULL::UUID, v_ligne.company_id,
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

  -- ⚠ LA PREUVE. On prend d'abord ce qu'a enregistré la session Safentreprise
  --   au démarrage du parcours. Le paramètre ne sert que de repli, pour un
  --   appel fait à la main.
  v_qui := COALESCE(v_ligne.demande_par, p_consenti_par);

  INSERT INTO microsoft_tenants
    (company_id, tenant_id, consenti_par, consenti_at, consenti_ip,
     statut, derniere_erreur, verifie_at)
  VALUES
    (v_ligne.company_id, p_tenant_id, v_qui, now(),
     left(COALESCE(p_ip, v_ligne.demande_ip, ''), 60), 'actif', NULL, now())
  ON CONFLICT (tenant_id) DO UPDATE
     SET consenti_par = EXCLUDED.consenti_par,
         consenti_at = EXCLUDED.consenti_at,
         consenti_ip = EXCLUDED.consenti_ip,
         statut = 'actif',
         derniere_erreur = NULL,
         verifie_at = now()
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
-- Rattrapage du raccordement déjà fait
-- =============================================================================

-- Le locataire déjà raccordé porte un consenti_par vide, alors que
-- l'information est restée dans graph_consentements. On la remet en place
-- plutôt que de laisser un trou dans la preuve.
UPDATE microsoft_tenants t
   SET consenti_par = c.demande_par
  FROM graph_consentements c
 WHERE c.tenant_id = t.tenant_id
   AND c.resultat = 'accorde'
   AND c.demande_par IS NOT NULL
   AND t.consenti_par IS NULL;

-- =============================================================================
-- Vérification
-- =============================================================================

--   SELECT tenant_id, consenti_par, consenti_at, consenti_ip, verifie_at
--     FROM microsoft_tenants;
--
-- consenti_par doit porter l'adresse du compte Safentreprise qui a lancé le
-- raccordement. S'il reste NULL, c'est qu'aucune ligne « accorde » de
-- graph_consentements ne correspond — le rattrapage le dira :
--
--   SELECT tenant_id, demande_par, resultat FROM graph_consentements
--    ORDER BY cree_at DESC;
