-- Raccordement autonome d'un client Microsoft 365
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- Jusqu'ici, raccorder un client demandait deux scripts lancés à la main sur
-- le poste de l'éditeur, avec MS_TENANT_ID dans .env.local. Un seul client
-- était donc raccordable : le sien.
--
-- Cette migration pose ce qu'il faut EN BASE pour qu'un client se raccorde
-- seul. Les routes et les écrans viennent après.
--
-- LE PARCOURS, en sept temps :
--
--   1. le client, connecté, demande le raccordement
--   2. on lui remet un jeton d'état à usage unique, et on l'envoie chez
--      Microsoft
--   3. il revient ; on NE CROIT PAS le retour, on demande un jeton au
--      locataire annoncé — s'il vient, le consentement est réel
--   4. on enregistre QUI a consenti, QUAND, DEPUIS QUELLE ADRESSE
--   5. on lui montre ses boîtes, il choisit
--   6. son administrateur restreint l'accès par RBAC, et ON VÉRIFIE
--   7. abonnements + annuaire, la surveillance démarre
--
-- ⚠ RIEN N'EST ACTIF AVANT L'ÉTAPE 6. Une boîte choisie reste inactive tant
--   que la restriction n'a pas été constatée. C'est la décision qui structure
--   toute cette migration : le produit ne doit pas pouvoir prétendre que
--   l'accès est restreint avant de l'avoir vérifié.

-- =============================================================================
-- 1. La preuve du consentement
-- =============================================================================

-- consenti_par existait mais n'était écrit par aucun code : l'AIPD l'a
-- signalé comme un trou. Il manquait aussi l'adresse d'où le consentement a
-- été donné.
--
-- ⚠ consenti_par vient de la SESSION SAFENTREPRISE, jamais du retour de
--   Microsoft. Une preuve doit venir d'une source qu'on maîtrise.
ALTER TABLE microsoft_tenants
  ADD COLUMN IF NOT EXISTS consenti_ip TEXT,
  ADD COLUMN IF NOT EXISTS raccorde_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restriction_verifiee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restriction_preuve TEXT,
  ADD COLUMN IF NOT EXISTS verifie_at TIMESTAMPTZ;

COMMENT ON COLUMN microsoft_tenants.consenti_par IS
  'Adresse du compte Safentreprise qui a lancé le raccordement. Source : la session, jamais le retour Microsoft.';
COMMENT ON COLUMN microsoft_tenants.restriction_verifiee_at IS
  'Date à laquelle on a CONSTATÉ que l''accès est restreint : une boîte non choisie a bien été refusée.';
COMMENT ON COLUMN microsoft_tenants.verifie_at IS
  'Dernier contrôle réussi du consentement (un jeton a été obtenu).';

-- =============================================================================
-- 2. Le jeton d'état
-- =============================================================================

-- POURQUOI UNE TABLE PLUTÔT QU'UNE SIGNATURE. Un jeton signé serait plus
-- simple, mais il est rejouable tant qu'il n'a pas expiré. Ici le jeton est à
-- USAGE UNIQUE, et la table sert en même temps de journal : qui a lancé un
-- raccordement, quand, et ce qu'il est devenu.
--
-- Sans ce contrôle, n'importe qui pourrait rattacher un locataire Microsoft à
-- la société de son choix en fabriquant un retour.
CREATE TABLE IF NOT EXISTS graph_consentements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Le jeton envoyé à Microsoft dans le paramètre « state ».
  etat TEXT NOT NULL UNIQUE,
  demande_par TEXT,
  demande_ip TEXT,
  cree_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes',
  -- Renseignés au retour.
  utilise_at TIMESTAMPTZ,
  resultat TEXT CHECK (resultat IN ('accorde', 'refuse', 'expire', 'invalide')),
  tenant_id TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_consentements_etat ON graph_consentements(etat);
CREATE INDEX IF NOT EXISTS idx_consentements_purge ON graph_consentements(cree_at);

ALTER TABLE graph_consentements ENABLE ROW LEVEL SECURITY;

-- Le client voit ses propres tentatives : c'est SON journal de raccordement.
-- Il n'écrit jamais directement — tout passe par les fonctions ci-dessous.
DROP POLICY IF EXISTS consentements_select_own ON graph_consentements;
CREATE POLICY consentements_select_own ON graph_consentements FOR SELECT
  USING (company_id = public.get_my_company_id());

-- =============================================================================
-- 3. Étape 1-2 : démarrer
-- =============================================================================

-- Appelée par le client connecté. Elle ne prend PAS de company_id en
-- paramètre : elle le lit de la session. Le lui laisser choisir permettrait
-- de rattacher un locataire à la société d'un autre.
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

  -- 32 octets d'aléa, en base64 sans caractères à échapper dans une URL.
  v_etat := encode(gen_random_bytes(32), 'base64');
  v_etat := replace(replace(replace(v_etat, '+', '-'), '/', '_'), '=', '');

  INSERT INTO graph_consentements (company_id, etat, demande_par, demande_ip)
  VALUES (v_company, v_etat, p_email, left(COALESCE(p_ip, ''), 60));

  RETURN QUERY
    SELECT c.etat, c.expire_at FROM graph_consentements c WHERE c.etat = v_etat;
END;
$$;

REVOKE ALL ON FUNCTION public.demarrer_consentement_graph(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demarrer_consentement_graph(TEXT, TEXT) TO authenticated, service_role;

-- =============================================================================
-- 4. Étape 3-4 : le retour, et la preuve
-- =============================================================================

-- ⚠ À N'APPELER QU'APRÈS avoir obtenu un jeton Graph pour p_tenant_id. Le
--   retour de Microsoft n'est qu'une redirection de navigateur : il ne prouve
--   rien. C'est l'obtention d'un jeton d'application qui prouve que le
--   consentement existe. La route s'en charge avant d'appeler ceci.
--
-- Le jeton d'état est à usage unique : on le consomme dans la même requête
-- que sa vérification, sous verrou.
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

  -- Un locataire Microsoft ne peut appartenir qu'à une société. Sans ce
  -- contrôle, une société pourrait s'approprier le locataire d'une autre en
  -- lançant un raccordement dessus.
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

  INSERT INTO microsoft_tenants
    (company_id, tenant_id, consenti_par, consenti_at, consenti_ip,
     statut, derniere_erreur, verifie_at)
  VALUES
    (v_ligne.company_id, p_tenant_id, p_consenti_par, now(),
     left(COALESCE(p_ip, ''), 60), 'actif', NULL, now())
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
    'Consentement enregistré.';
END;
$$;

REVOKE ALL ON FUNCTION public.valider_consentement_graph(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valider_consentement_graph(TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- Trace d'un retour qui n'a pas abouti : le client doit pouvoir comprendre.
CREATE OR REPLACE FUNCTION public.echec_consentement_graph(
  p_etat TEXT,
  p_detail TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_consentements
     SET utilise_at = now(), resultat = 'refuse', detail = left(p_detail, 500)
   WHERE etat = p_etat AND utilise_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.echec_consentement_graph(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echec_consentement_graph(TEXT, TEXT) TO service_role;

-- =============================================================================
-- 5. Étape 5 : le client choisit ses boîtes
-- =============================================================================

-- Les boîtes sont créées INACTIVES. Rien ne les analysera tant que la
-- restriction n'aura pas été vérifiée à l'étape 6 : les quatorze requêtes qui
-- exigent b.actif les ignorent.
--
-- Une boîte retirée de la sélection est DÉSACTIVÉE, jamais supprimée : sa
-- suppression emporterait en cascade ses analyses et ses abonnements, donc la
-- trace des messages déjà modifiés.
CREATE OR REPLACE FUNCTION public.choisir_boites_graph(
  p_tenant_uid UUID,
  p_boites JSONB
)
RETURNS TABLE (retenues INTEGER, retirees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_retenues INTEGER := 0;
  v_retirees INTEGER := 0;
BEGIN
  SELECT t.company_id INTO v_company
    FROM microsoft_tenants t
   WHERE t.id = p_tenant_uid AND t.company_id = get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Locataire inconnu ou n''appartenant pas à cette société.';
  END IF;

  IF p_boites IS NULL OR jsonb_array_length(p_boites) = 0 THEN
    RAISE EXCEPTION 'Aucune boîte sélectionnée.';
  END IF;

  WITH entrantes AS (
    SELECT e ->> 'graph_user_id' AS graph_user_id, e ->> 'upn' AS upn
      FROM jsonb_array_elements(p_boites) e
     WHERE COALESCE(e ->> 'graph_user_id', '') <> ''
       AND COALESCE(e ->> 'upn', '') <> ''
  ),
  posees AS (
    INSERT INTO boites_surveillees (company_id, tenant_uid, graph_user_id, upn, actif)
    SELECT v_company, p_tenant_uid, n.graph_user_id, lower(n.upn), FALSE
      FROM entrantes n
    ON CONFLICT (tenant_uid, graph_user_id) DO UPDATE
       SET upn = EXCLUDED.upn
    RETURNING 1
  )
  SELECT count(*) INTO v_retenues FROM posees;

  -- Ce qui n'est plus coché sort de la surveillance.
  UPDATE boites_surveillees b
     SET actif = FALSE
   WHERE b.tenant_uid = p_tenant_uid
     AND b.graph_user_id NOT IN (
       SELECT e ->> 'graph_user_id' FROM jsonb_array_elements(p_boites) e
     );
  GET DIAGNOSTICS v_retirees = ROW_COUNT;

  -- Le périmètre a changé : la restriction constatée ne vaut plus pour ce
  -- nouveau périmètre. Il faut la revérifier.
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = NULL, restriction_preuve = NULL
   WHERE id = p_tenant_uid;

  RETURN QUERY SELECT v_retenues, v_retirees;
END;
$$;

REVOKE ALL ON FUNCTION public.choisir_boites_graph(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choisir_boites_graph(UUID, JSONB) TO authenticated, service_role;

-- Ce que le client a choisi, pour l'affichage et pour engendrer le script
-- PowerShell.
CREATE OR REPLACE FUNCTION public.boites_choisies_graph(p_tenant_uid UUID)
RETURNS TABLE (graph_user_id TEXT, upn TEXT, actif BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.graph_user_id, b.upn, b.actif, b.created_at
    FROM boites_surveillees b
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE b.tenant_uid = p_tenant_uid
     AND t.company_id = get_my_company_id()
   ORDER BY b.upn;
$$;

REVOKE ALL ON FUNCTION public.boites_choisies_graph(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boites_choisies_graph(UUID) TO authenticated, service_role;

-- =============================================================================
-- 6. Étape 6 : la restriction constatée, et elle seule, active la surveillance
-- =============================================================================

-- ⚠ CETTE FONCTION NE VÉRIFIE RIEN ELLE-MÊME. Elle enregistre un constat fait
--   par la route : celle-ci a tenté de lire une boîte NON choisie et Microsoft
--   a refusé. p_preuve porte le détail de ce refus.
--
--   Elle n'est donc appelable que par service_role. Si un client pouvait
--   l'appeler, il lui suffirait de la déclencher pour activer la surveillance
--   sans avoir rien restreint — et le produit mentirait sur ce qu'il peut
--   atteindre.
CREATE OR REPLACE FUNCTION public.marquer_restriction_verifiee(
  p_tenant_uid UUID,
  p_preuve TEXT
)
RETURNS TABLE (boites_activees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_activees INTEGER;
BEGIN
  UPDATE microsoft_tenants
     SET restriction_verifiee_at = now(),
         restriction_preuve = left(p_preuve, 500),
         raccorde_at = COALESCE(raccorde_at, now())
   WHERE id = p_tenant_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;

  -- Les boîtes choisies deviennent actives. C'est le seul endroit du schéma
  -- qui les active.
  UPDATE boites_surveillees
     SET actif = TRUE
   WHERE tenant_uid = p_tenant_uid AND NOT actif;
  GET DIAGNOSTICS v_activees = ROW_COUNT;

  RETURN QUERY SELECT v_activees;
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_restriction_verifiee(UUID, TEXT) TO service_role;

-- =============================================================================
-- 7. Consentement retiré : s'en apercevoir en un jour, pas en six
-- =============================================================================

-- CE QUI SE PASSAIT SANS ÇA. Un consentement retiré ne se voyait qu'au
-- renouvellement d'abonnement, qui ne passe que 24 h avant une échéance de
-- près de sept jours. La surveillance pouvait donc s'arrêter pendant six jours
-- sans que rien ne le dise.
--
-- La colonne statut acceptait déjà « revoque » depuis la première migration ;
-- rien ne l'écrivait jamais. Quatorze requêtes exigent statut = 'actif' :
-- écrire « revoque » arrête donc toute la chaîne, proprement.
CREATE OR REPLACE FUNCTION public.tenants_a_verifier(p_limite INTEGER DEFAULT 50)
RETURNS TABLE (tenant_uid UUID, tenant_id TEXT, company_id UUID, statut TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.tenant_id, t.company_id, t.statut
    FROM microsoft_tenants t
   WHERE t.statut IN ('actif', 'erreur')
   ORDER BY COALESCE(t.verifie_at, '-infinity'::TIMESTAMPTZ)
   LIMIT GREATEST(1, LEAST(p_limite, 200));
$$;

REVOKE ALL ON FUNCTION public.tenants_a_verifier(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenants_a_verifier(INTEGER) TO service_role;

-- ⚠ LA DISTINCTION QUI COMPTE.
--   « revoque » est DÉFINITIF : l'administrateur a retiré son accord, il faut
--   refaire tout le parcours. On ne réessaie pas.
--   « erreur » est PASSAGER : Microsoft était indisponible, on réessaiera.
--   Confondre les deux, c'est soit harceler Microsoft pour rien, soit arrêter
--   un client à cause d'une panne de cinq minutes.
CREATE OR REPLACE FUNCTION public.maj_sante_tenant(
  p_tenant_uid UUID,
  p_etat TEXT,          -- 'actif' | 'revoque' | 'erreur'
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE microsoft_tenants
     SET statut = p_etat,
         derniere_erreur = CASE WHEN p_etat = 'actif' THEN NULL
                                ELSE left(p_detail, 500) END,
         verifie_at = CASE WHEN p_etat = 'actif' THEN now() ELSE verifie_at END
   WHERE id = p_tenant_uid;
$$;

REVOKE ALL ON FUNCTION public.maj_sante_tenant(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maj_sante_tenant(UUID, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 8. LA VUE À CONSULTER — elle doit rester vide
-- =============================================================================

-- Troisième vue de contrôle, après alertes_sans_banniere et
-- abonnements_en_alerte. Même règle : une ligne veut dire qu'une entreprise
-- n'est pas, ou plus, réellement surveillée.
CREATE OR REPLACE VIEW public.tenants_en_alerte
WITH (security_invoker = true) AS
  SELECT t.company_id,
         t.tenant_id,
         t.statut,
         t.consenti_par,
         t.consenti_at,
         t.verifie_at,
         t.restriction_verifiee_at,
         t.derniere_erreur,
         (SELECT count(*) FROM boites_surveillees b
           WHERE b.tenant_uid = t.id AND b.actif) AS boites_actives,
         CASE
           WHEN t.statut = 'revoque' THEN
             'CONSENTEMENT RETIRÉ — plus aucune boîte n''est surveillée. ' ||
             'Le client doit refaire le raccordement. ' ||
             COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'erreur' THEN
             'En erreur — ' || COALESCE(t.derniere_erreur, 'sans détail')
           -- Deux situations très différentes derrière « non vérifié ».
           --
           -- Un premier raccordement : aucune boîte n'est active, rien n'est
           -- surveillé, le client attend son produit.
           --
           -- Un périmètre modifié après coup : les boîtes déjà vérifiées
           -- RESTENT actives — les désactiver ouvrirait une fenêtre sans
           -- protection le temps que l'administrateur repasse son script.
           -- Seules les nouvelles attendent. Dire « rien n'est surveillé »
           -- serait faux, et une vue de contrôle qui dit faux ne vaut rien.
           WHEN t.restriction_verifiee_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM boites_surveillees b
                                 WHERE b.tenant_uid = t.id AND b.actif) THEN
             'RACCORDEMENT INACHEVÉ — la restriction des boîtes n''a pas été ' ||
             'vérifiée, donc rien n''est surveillé.'
           WHEN t.restriction_verifiee_at IS NULL THEN
             'PÉRIMÈTRE MODIFIÉ — ' ||
             (SELECT count(*) FROM boites_surveillees b
               WHERE b.tenant_uid = t.id AND b.actif)::TEXT ||
             ' boîte(s) déjà vérifiée(s) restent surveillées ; ' ||
             (SELECT count(*) FROM boites_surveillees b
               WHERE b.tenant_uid = t.id AND NOT b.actif)::TEXT ||
             ' attendent que la restriction soit vérifiée à nouveau.'
           WHEN NOT EXISTS (SELECT 1 FROM boites_surveillees b
                             WHERE b.tenant_uid = t.id AND b.actif) THEN
             'Aucune boîte active : rien n''est surveillé.'
           WHEN t.verifie_at IS NULL OR t.verifie_at < now() - INTERVAL '48 hours' THEN
             'Consentement non contrôlé depuis ' ||
             COALESCE(age(now(), t.verifie_at)::TEXT, 'toujours') ||
             ' — le contrôle quotidien ne tourne plus.'
           ELSE 'À surveiller'
         END AS motif
    FROM microsoft_tenants t
   WHERE t.statut <> 'actif'
      OR t.restriction_verifiee_at IS NULL
      OR t.verifie_at IS NULL
      OR t.verifie_at < now() - INTERVAL '48 hours'
      OR NOT EXISTS (SELECT 1 FROM boites_surveillees b
                      WHERE b.tenant_uid = t.id AND b.actif);

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires dont le raccordement est inachevé, retiré, ou non contrôlé. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compter_tenants_en_alerte()
RETURNS TABLE (total BIGINT, revoques BIGINT, inacheves BIGINT, non_controles BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         count(*) FILTER (WHERE statut = 'revoque'),
         count(*) FILTER (WHERE restriction_verifiee_at IS NULL AND statut <> 'revoque'),
         count(*) FILTER (
           WHERE verifie_at IS NULL OR verifie_at < now() - INTERVAL '48 hours'
         )
    FROM microsoft_tenants;
$$;

REVOKE ALL ON FUNCTION public.compter_tenants_en_alerte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compter_tenants_en_alerte() TO service_role;

-- =============================================================================
-- 9. La veille remonte aussi les raccordements
-- =============================================================================

-- Même règle qu'ailleurs : ce qui sort vers le mail ne porte ni contenu, ni
-- adresse de boîte. Le tenant_id est un identifiant technique Microsoft, pas
-- une donnée personnelle, mais il ne sert à rien dans un mail : on ne remonte
-- que la source et le motif, agrégés par preparer_veille().
CREATE OR REPLACE FUNCTION public.problemes_de_veille(
  p_age_minutes INTEGER DEFAULT 120
)
RETURNS TABLE (
  source TEXT,
  identite TEXT,
  cle_empreinte TEXT,
  intitule TEXT,
  motif TEXT,
  depuis TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'alerte sans bannière',
         a.message_id,
         a.message_id || '/' || COALESCE(a.action_etat, 'jamais-tentee'),
         'Mail ' || a.niveau || ' (' || a.score || ') de ' ||
           COALESCE(a.expediteur_email, 'expéditeur inconnu') ||
           ' — « ' || COALESCE(a.objet, 'sans objet') || ' »',
         a.motif,
         a.analyse_at
    FROM alertes_sans_banniere a
   WHERE a.analyse_at < now() - make_interval(mins => GREATEST(5, p_age_minutes))

  UNION ALL

  SELECT 'abonnement Graph',
         b.subscription_id,
         b.subscription_id || '/' || b.statut || '/' ||
           (b.tentatives_renouvellement >= 10)::TEXT,
         'Boîte ' || b.upn,
         b.motif,
         b.expire_at
    FROM abonnements_en_alerte b

  UNION ALL

  SELECT 'raccordement Microsoft',
         t.tenant_id,
         -- L'identité tient au locataire et à son état, pas au motif : les
         -- motifs contiennent des durées qui changent à chaque seconde.
         t.tenant_id || '/' || t.statut || '/' ||
           (t.restriction_verifiee_at IS NOT NULL)::TEXT,
         'Locataire ' || t.tenant_id,
         t.motif,
         t.consenti_at
    FROM tenants_en_alerte t;
$$;

REVOKE ALL ON FUNCTION public.problemes_de_veille(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.problemes_de_veille(INTEGER) TO service_role;

-- =============================================================================
-- 10. Purge
-- =============================================================================

-- Les jetons d'état contiennent l'adresse et l'IP de qui a lancé un
-- raccordement. Ils n'ont plus d'utilité passé quelques semaines ; la preuve
-- du consentement, elle, reste dans microsoft_tenants pour la durée du contrat.
CREATE OR REPLACE FUNCTION public.purger_consentements()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_supprimes INTEGER;
BEGIN
  DELETE FROM graph_consentements WHERE cree_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;
  RETURN v_supprimes;
END;
$$;

REVOKE ALL ON FUNCTION public.purger_consentements() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron absent : purge-consentements à planifier à la main.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-consentements') THEN
    PERFORM cron.unschedule('purge-consentements');
  END IF;
  PERFORM cron.schedule('purge-consentements', '5 4 * * *',
    $c$ SELECT public.purger_consentements(); $c$);
END $$;

-- =============================================================================
-- 11. Vérification
-- =============================================================================

--   SELECT tenant_id, statut, boites_actives, motif FROM tenants_en_alerte;
--
-- Elle doit être VIDE. Sur votre locataire de test, elle remontera
-- « RACCORDEMENT INACHEVÉ » tant que la restriction n'aura pas été vérifiée —
-- c'est exact : elle ne l'a jamais été.
--
--   SELECT * FROM compter_tenants_en_alerte();
--   SELECT tenant_id, consenti_par, consenti_at, consenti_ip FROM microsoft_tenants;
--   SELECT etat, resultat, demande_par, cree_at FROM graph_consentements
--    ORDER BY cree_at DESC LIMIT 10;
