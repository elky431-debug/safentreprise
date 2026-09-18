-- Lot 1 du parcours de raccordement à deux acteurs : les fondations.
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- Référence : docs/PARCOURS-RACCORDEMENT.md
--
-- ============================================================================
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST LE PLUS IMPORTANT
-- ============================================================================
--
-- ⚠ ELLE NE MODIFIE AUCUNE FONCTION EXISTANTE. Pas une ligne de
--   `demarrer_consentement_graph`, ni des routes, ni du parcours en session.
--   Un raccordement déjà actif ne peut pas être cassé par ce qui suit :
--   la migration AJOUTE des tables et des fonctions, elle n'en remplace pas.
--
--   La voie « jeton » est une SECONDE porte, pas un remplacement. Les deux
--   coexisteront tant que le nouveau parcours ne sera pas validé de bout en
--   bout ; c'est ce qui rend le retour arrière trivial (voir la fin du
--   fichier).
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Le jeton de transmission
-- =============================================================================

-- ⚠ CE JETON NE CRÉE AUCUNE SESSION. Il n'ouvre pas de cookie, ne passe pas par
--   Supabase Auth, et ne rend jamais l'espace connecté atteignable. Tout ce
--   qu'il permet passe par les fonctions ci-dessous, qui le prennent en
--   ARGUMENT et ne rendent que du raccordement. C'est le même modèle que
--   `get_risk_payload_by_token`, déjà en place pour les simulations.
CREATE TABLE IF NOT EXISTS raccordement_jetons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- ⚠ `gen_random_uuid()`, PAS `gen_random_bytes`. Celle-ci est dans pgcrypto,
  --   donc hors du `search_path = public` que portent ces fonctions — c'est
  --   exactement ce qui a fait échouer `demarrer_consentement_graph` en
  --   production le 9 septembre, après dix-neuf vérifications locales vertes.
  --   Voir `20260909_jeton_sans_pgcrypto.sql`.
  jeton TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::TEXT, '-', ''),

  -- À qui le dirigeant l'a transmis. Sert au suivi et au rappel.
  destinataire_nom TEXT,
  destinataire_email TEXT,
  mot_du_dirigeant TEXT,

  -- ⚠ LES ADRESSES SONT NOMMÉES PAR LE DIRIGEANT, PAS COCHÉES DANS L'ANNUAIRE.
  --   C'est la décision qui fait tenir « un seul aller-retour » : la liste de
  --   l'annuaire vient de Graph, donc n'existe qu'APRÈS l'accord Microsoft. Si
  --   le dirigeant devait cocher, il faudrait qu'il revienne après son
  --   informaticien. Voir le document, section « La contrainte de séquence ».
  --
  --   Ce sont donc des chaînes libres, à résoudre plus tard contre l'annuaire.
  --   Ne pas y mettre de contrainte de forme : une adresse mal tapée doit
  --   pouvoir entrer et être corrigée à l'écran I3, pas rejetée ici.
  adresses_demandees TEXT[] NOT NULL DEFAULT '{}',

  cree_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 14 jours, et pas 24 h : un prestataire externe planifie, et un lien mort
  -- le vendredi soir est un abandon.
  expire_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',

  envoye_at TIMESTAMPTZ,
  ouvert_at TIMESTAMPTZ,

  -- ⚠ RÉVOQUÉ, PAS SUPPRIMÉ. « Changer d'informaticien » doit tuer l'ancien
  --   lien à l'instant, mais la trace de ce qui a été transmis, à qui et quand
  --   doit rester — c'est ce qui permet de répondre à « à qui ai-je envoyé ça
  --   la semaine dernière ? ».
  revoque_at TIMESTAMPTZ,
  termine_at TIMESTAMPTZ
);

-- Un seul jeton vivant par société : c'est ce qui donne son sens à
-- « changer d'informaticien ». L'index partiel laisse coexister autant de
-- jetons révoqués ou terminés qu'on veut.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jeton_vivant_par_societe
  ON raccordement_jetons(company_id)
  WHERE revoque_at IS NULL AND termine_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jeton_recherche ON raccordement_jetons(jeton);

ALTER TABLE raccordement_jetons ENABLE ROW LEVEL SECURITY;

-- ⚠ LA RÈGLE DES POLITIQUES RLS : NOMMER LE RÔLE **ET** FILTRER SUR LA SOCIÉTÉ.
--   Une politique sans clause `TO` s'applique à PUBLIC, donc à `anon`. Voir
--   `docs/SECURITE-RLS.md` — deux brèches de cette famille en septembre.
DROP POLICY IF EXISTS jetons_select_own ON raccordement_jetons;
CREATE POLICY jetons_select_own ON raccordement_jetons FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id());

-- ⚠ AUCUNE POLITIQUE POUR `anon`, ET C'EST LE POINT. L'informaticien ne LIT
--   pas cette table : il appelle une fonction SECURITY DEFINER qui la lit pour
--   lui et ne rend que ce qu'il a le droit de voir. Lui ouvrir un SELECT
--   exposerait les jetons des autres sociétés.

-- =============================================================================
-- 2. Les blocages signalés
-- =============================================================================

-- ⚠ UN BLOCAGE SILENCIEUX EST LE PLUS FRÉQUENT ET LE PLUS COÛTEUX. Cette table
--   existe pour qu'un informaticien coincé ait un geste à faire autre que
--   fermer l'onglet.
CREATE TABLE IF NOT EXISTS raccordement_blocages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jeton_id UUID REFERENCES raccordement_jetons(id) ON DELETE SET NULL,

  etape TEXT,
  motif TEXT NOT NULL
    CHECK (motif IN ('role-manquant', 'script-echoue', 'verification-echoue', 'autre')),
  texte_libre TEXT,

  -- Le message d'erreur technique, joint automatiquement. C'est ce qui évite
  -- l'aller-retour « pouvez-vous me dire l'erreur exacte ? ».
  erreur_technique TEXT,

  signale_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blocages_a_traiter
  ON raccordement_blocages(signale_at DESC) WHERE traite_at IS NULL;

ALTER TABLE raccordement_blocages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocages_select_own ON raccordement_blocages;
CREATE POLICY blocages_select_own ON raccordement_blocages FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id());

-- =============================================================================
-- 3. La confirmation du locataire par le dirigeant
-- =============================================================================

-- ⚠ UN CLIC CONTRE UN RATTACHEMENT DE LOCATAIRE PIRATE. Détenir le lien ne
--   suffit pas à consentir — Microsoft exige d'être administrateur général du
--   locataire. Mais un attaquant qui contrôle SON PROPRE locataire pourrait y
--   rattacher la société du client. Le dirigeant confirme donc le domaine
--   avant que la surveillance démarre.
ALTER TABLE microsoft_tenants
  ADD COLUMN IF NOT EXISTS confirme_par_dirigeant_at TIMESTAMPTZ;

COMMENT ON COLUMN microsoft_tenants.confirme_par_dirigeant_at IS
  'Le dirigeant a reconnu ce locataire comme étant le sien. NULL = pas encore '
  'confirmé. Voir docs/PARCOURS-RACCORDEMENT.md, écran D-SÉCURITÉ.';

-- =============================================================================
-- 4. Créer et révoquer un jeton — côté dirigeant, en session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.creer_jeton_raccordement(
  p_destinataire_nom TEXT,
  p_destinataire_email TEXT,
  p_adresses TEXT[],
  p_mot TEXT DEFAULT NULL
)
RETURNS TABLE (jeton TEXT, expire_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_jeton TEXT;
BEGIN
  v_company := get_my_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Aucune société pour cette session.';
  END IF;

  -- ⚠ CRÉER UN JETON RÉVOQUE LE PRÉCÉDENT, ET C'EST « CHANGER D'INFORMATICIEN ».
  --   Sans ça l'index unique partiel ferait échouer la création, et le
  --   dirigeant se retrouverait bloqué avec un lien parti à la mauvaise
  --   personne — exactement le cas où il a besoin d'agir vite.
  UPDATE raccordement_jetons
     SET revoque_at = now()
   WHERE company_id = v_company AND revoque_at IS NULL AND termine_at IS NULL;

  INSERT INTO raccordement_jetons
    (company_id, destinataire_nom, destinataire_email, adresses_demandees,
     mot_du_dirigeant, envoye_at)
  VALUES
    (v_company, left(p_destinataire_nom, 120), left(p_destinataire_email, 200),
     COALESCE(p_adresses, '{}'), left(p_mot, 500), now())
  RETURNING raccordement_jetons.jeton INTO v_jeton;

  RETURN QUERY
    SELECT j.jeton, j.expire_at FROM raccordement_jetons j WHERE j.jeton = v_jeton;
END;
$$;

REVOKE ALL ON FUNCTION public.creer_jeton_raccordement(TEXT, TEXT, TEXT[], TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_jeton_raccordement(TEXT, TEXT, TEXT[], TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoquer_jeton_raccordement()
RETURNS INTEGER
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

  UPDATE raccordement_jetons
     SET revoque_at = now()
   WHERE company_id = v_company AND revoque_at IS NULL AND termine_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.revoquer_jeton_raccordement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoquer_jeton_raccordement()
  TO authenticated, service_role;

-- =============================================================================
-- 5. Lire un jeton — côté informaticien, SANS session
-- =============================================================================

-- ⚠ C'EST LA SEULE PORTE OUVERTE À `anon`, ET ELLE NE REND QUE DU
--   RACCORDEMENT. Le nom de la société, le nom du dirigeant, les adresses
--   nommées, l'état. JAMAIS de menaces, de campagnes, de salariés, de
--   facturation ni d'autres utilisateurs. Toute colonne ajoutée à ce SELECT
--   doit passer ce test : « un inconnu qui a le lien a-t-il le droit de voir
--   ça ? »
--
-- ⚠ ELLE NE REND PAS `company_id`. L'appelant n'en a pas besoin — les
--   fonctions d'action le retrouvent elles-mêmes depuis le jeton — et le
--   rendre permettrait de le rejouer ailleurs.
CREATE OR REPLACE FUNCTION public.lire_jeton_raccordement(p_jeton TEXT)
RETURNS TABLE (
  valide BOOLEAN,
  motif TEXT,
  societe_nom TEXT,
  dirigeant_nom TEXT,
  adresses_demandees TEXT[],
  mot_du_dirigeant TEXT,
  expire_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT j.*, c.nom AS c_nom, c.nom_dirigeant AS c_dirigeant
    INTO v
    FROM raccordement_jetons j
    JOIN companies c ON c.id = j.company_id
   WHERE j.jeton = p_jeton;

  -- ⚠ LES QUATRE REFUS SONT DISTINGUÉS, ET C'EST VOULU. « Ce lien n'est plus
  --   valable » sans raison est un cul-de-sac : l'informaticien ne sait pas
  --   s'il doit redemander un lien, attendre, ou appeler. Chaque motif porte
  --   une suite différente à l'écran.
  --
  --   Ça ne divulgue rien : il faut déjà connaître un jeton de 32 caractères
  --   hexadécimaux pour obtenir l'un de ces quatre mots.
  IF v IS NULL THEN
    RETURN QUERY SELECT false, 'inconnu', NULL::TEXT, NULL::TEXT,
                        NULL::TEXT[], NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v.revoque_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'revoque', NULL::TEXT, NULL::TEXT,
                        NULL::TEXT[], NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v.termine_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'termine', NULL::TEXT, NULL::TEXT,
                        NULL::TEXT[], NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v.expire_at < now() THEN
    RETURN QUERY SELECT false, 'expire', NULL::TEXT, NULL::TEXT,
                        NULL::TEXT[], NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Première ouverture : on date, pour que le dirigeant le voie dans son suivi
  -- et pour armer l'alerte « ouvert mais sans progression depuis 48 h ».
  IF v.ouvert_at IS NULL THEN
    UPDATE raccordement_jetons SET ouvert_at = now() WHERE id = v.id;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, v.c_nom, v.c_dirigeant,
                      v.adresses_demandees, v.mot_du_dirigeant, v.expire_at;
END;
$$;

REVOKE ALL ON FUNCTION public.lire_jeton_raccordement(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lire_jeton_raccordement(TEXT)
  TO anon, authenticated, service_role;

-- =============================================================================
-- 6. Démarrer le consentement AVEC un jeton
-- =============================================================================

-- ⚠ C'EST UNE FONCTION NOUVELLE, PAS UNE MODIFICATION DE L'ANCIENNE.
--   `demarrer_consentement_graph(TEXT, TEXT)` n'est pas touchée : le parcours
--   en session continue de fonctionner exactement comme avant, bit pour bit.
--   Les deux signatures diffèrent, donc aucune ambiguïté de surcharge.
--
--   C'est ce qui rend cette migration rétrocompatible par CONSTRUCTION, et
--   non par relecture : il n'existe aucun chemin de code par lequel un
--   raccordement existant passerait par la nouvelle fonction.
--
-- ⚠ LA SOCIÉTÉ VIENT DU JETON, JAMAIS D'UN PARAMÈTRE. La laisser choisir
--   permettrait de rattacher le locataire Microsoft d'une entreprise à la
--   société d'une autre — c'est l'avertissement déjà écrit sur la version en
--   session, et il vaut deux fois plus ici, puisque l'appelant est anonyme.
CREATE OR REPLACE FUNCTION public.demarrer_consentement_par_jeton(
  p_jeton TEXT,
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
  SELECT j.company_id INTO v_company
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton
     AND j.revoque_at IS NULL
     AND j.termine_at IS NULL
     AND j.expire_at > now();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Lien de raccordement invalide ou expiré.';
  END IF;

  -- Même fabrication que la version en session : deux UUID, 244 bits, aucune
  -- extension à résoudre.
  v_etat := replace(gen_random_uuid()::TEXT, '-', '')
         || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO graph_consentements (company_id, etat, demande_par, demande_ip)
  VALUES (v_company, v_etat, left(p_email, 200), left(COALESCE(p_ip, ''), 60));

  RETURN QUERY
    SELECT c.etat, c.expire_at FROM graph_consentements c WHERE c.etat = v_etat;
END;
$$;

REVOKE ALL ON FUNCTION public.demarrer_consentement_par_jeton(TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demarrer_consentement_par_jeton(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- =============================================================================
-- 7. Signaler un blocage — sans session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.signaler_blocage_raccordement(
  p_jeton TEXT,
  p_etape TEXT,
  p_motif TEXT,
  p_texte TEXT DEFAULT NULL,
  p_erreur TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT j.id, j.company_id INTO v
    FROM raccordement_jetons j
   WHERE j.jeton = p_jeton AND j.revoque_at IS NULL;

  IF v IS NULL THEN
    RETURN false;
  END IF;

  -- ⚠ PAS DE LIMITE DE DÉBIT ICI, ET C'EST ASSUMÉ. Il faut déjà détenir un
  --   jeton valide pour écrire, et la table ne porte que du texte borné. Le
  --   jour où elle sera ouverte plus largement, relire
  --   `enregistrer_demande_demo` : elle porte les compteurs horaires et
  --   journaliers dont on aurait besoin.
  INSERT INTO raccordement_blocages
    (company_id, jeton_id, etape, motif, texte_libre, erreur_technique)
  VALUES
    (v.company_id, v.id, left(p_etape, 40),
     CASE WHEN p_motif IN ('role-manquant', 'script-echoue', 'verification-echoue')
          THEN p_motif ELSE 'autre' END,
     left(p_texte, 2000), left(p_erreur, 2000));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.signaler_blocage_raccordement(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signaler_blocage_raccordement(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- =============================================================================
-- 8. RETOUR ARRIÈRE
-- =============================================================================
--
-- ⚠ À LIRE AVANT D'APPLIQUER, PAS PENDANT.
--
-- Cette migration n'ayant modifié aucun objet existant, le retour arrière
-- consiste à SUPPRIMER ce qu'elle a créé. Rien à restaurer, rien à recalculer.
--
-- Le bloc ci-dessous est commenté à dessein : il ne doit jamais partir par
-- inadvertance avec le reste du fichier.
--
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.signaler_blocage_raccordement(TEXT, TEXT, TEXT, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS public.demarrer_consentement_par_jeton(TEXT, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS public.lire_jeton_raccordement(TEXT);
--     DROP FUNCTION IF EXISTS public.revoquer_jeton_raccordement();
--     DROP FUNCTION IF EXISTS public.creer_jeton_raccordement(TEXT, TEXT, TEXT[], TEXT);
--     DROP TABLE IF EXISTS raccordement_blocages;
--     DROP TABLE IF EXISTS raccordement_jetons;
--     ALTER TABLE microsoft_tenants DROP COLUMN IF EXISTS confirme_par_dirigeant_at;
--   COMMIT;
--
-- ⚠ CE RETOUR ARRIÈRE NE TOUCHE PAS AU RACCORDEMENT EN COURS. Il ne supprime
--   ni `graph_consentements`, ni `microsoft_tenants`, ni `boites_surveillees`,
--   ni aucun abonnement. La seule perte est ce que le nouveau parcours aurait
--   écrit : des jetons et des blocages signalés.
--
-- ⚠ LE `DROP COLUMN` EST LE SEUL À RÉFLÉCHIR. Si le lot 4 a déjà tourné et
--   qu'un dirigeant a confirmé son locataire, la date de confirmation est
--   perdue et il devra reconfirmer. Aucune surveillance ne s'arrête pour
--   autant : la colonne ne conditionne rien tant que le lot 4 n'est pas
--   déployé. Tant qu'on en est au lot 1, la retirer n'a aucun effet.

-- =============================================================================
-- 9. VÉRIFICATION APRÈS APPLICATION — UNE REQUÊTE, UN GESTE
-- =============================================================================
--
-- LA REQUÊTE. Elle doit rendre exactement la même chose qu'avant la migration.
-- Si l'une des quatre colonnes change, le raccordement a bougé.
--
--   SELECT t.tenant_id,
--          t.statut,
--          count(*) FILTER (WHERE b.actif)                       AS boites_actives,
--          count(*) FILTER (WHERE a.statut = 'actif'
--                             AND a.expire_at > now())           AS abonnements_vivants
--     FROM microsoft_tenants t
--     LEFT JOIN boites_surveillees b ON b.tenant_uid = t.id
--     LEFT JOIN graph_abonnements  a ON a.boite_id   = b.id
--    GROUP BY t.tenant_id, t.statut;
--
-- Attendu : `statut = 'actif'`, et les deux compteurs à leur valeur d'avant.
-- Un `abonnements_vivants` à 0 alors que `boites_actives` ne l'est pas veut
-- dire que plus aucun message n'arrive — c'est le seul résultat qui demande
-- une action immédiate.
--
-- LE GESTE. S'envoyer un message de test depuis une adresse extérieure, sur
-- une boîte surveillée, et vérifier que la bannière apparaît.
--
-- ⚠ C'EST LE SEUL CONTRÔLE QUI PROUVE LA CHAÎNE ENTIÈRE. La requête ci-dessus
--   lit des lignes ; elle ne dit pas que Microsoft notifie encore, que le
--   jeton s'obtient, que Graph répond et que l'écriture du corps passe. Un
--   message qui revient banni est la seule preuve de bout en bout — c'est ce
--   qui avait tranché le test de révocation en septembre.
