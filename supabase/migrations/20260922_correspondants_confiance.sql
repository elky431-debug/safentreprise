-- Correspondants de confiance — la détection du faux fournisseur
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : le client déclare ses fournisseurs habituels et leurs domaines. Un
-- message qui se présente au nom d'un fournisseur connu mais arrive depuis un
-- autre domaine est la fraude au faux fournisseur — celle qui coûte le plus
-- cher aux PME, et que rien dans le moteur ne savait voir jusqu'ici.
--
-- ⚠ LE CLIENT DÉCLARE, ON NE DÉDUIT RIEN DE SON COURRIER. Aucune fonction de
--   ce fichier ne lit l'historique des boîtes pour fabriquer cette liste. Le
--   périmètre d'accès est inchangé : c'est l'engagement commercial du produit,
--   et il est ici tenu par l'absence de code plutôt que par une promesse.
--
-- ⚠ AUCUN DOMAINE DE MESSAGERIE GRAND PUBLIC NE PEUT ÊTRE DÉCLARÉ. Une
--   contrainte le refuse en base, pas seulement l'écran d'import : un seul
--   fournisseur déclaré sur gmail.com rendrait TOUT gmail.com légitime aux
--   yeux de la règle, et désactiverait en silence la détection sur le canal
--   le plus utilisé par les fraudeurs.

-- =============================================================================
-- 1. Normalisation du nom
-- =============================================================================

-- ⚠ IMMUTABLE, PARCE QU'UNE COLONNE GÉNÉRÉE L'EXIGE. Et une colonne générée
--   plutôt qu'un champ rempli par l'application : la forme normalisée sert à
--   la fois à l'unicité et à la comparaison du moteur. Deux chemins d'écriture
--   — l'ajout à l'unité et l'import — finiraient par la calculer
--   différemment ; la base, elle, ne peut pas diverger d'elle-même.
--
-- ⚠ LES FORMES JURIDIQUES SONT RETIRÉES. « DELTA-LOG SARL » et « Delta Log »
--   désignent le même fournisseur ; sans ce retrait, le client en déclarerait
--   deux et la règle ne reconnaîtrait ni l'un ni l'autre selon la façon dont
--   l'expéditeur se présente.
--
-- ⚠ REPLI SI LE RETRAIT VIDE TOUT. Un fournisseur réellement nommé « SA » ou
--   « CO » existe ; sans ce repli, sa ligne normalisée serait vide et se
--   heurterait à l'unicité de la première venue.
CREATE OR REPLACE FUNCTION public.normaliser_nom_correspondant(p_nom TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH base AS (
    SELECT btrim(regexp_replace(
             -- ⚠ LES ACRONYMES POINTÉS SE RECOLLENT AVANT TOUT LE RESTE.
             --   Sans cette ligne, « S.A.R.L. » devient « s a r l » à la
             --   normalisation des séparateurs, et le retrait des formes
             --   juridiques — qui cherche le mot « sarl » — ne le voit plus.
             --   « Delta Log S.A.R.L. » et « Delta Log » cessaient alors
             --   d'être le même correspondant, ce qui est exactement ce que
             --   cette fonction existe pour éviter.
             --
             --   La règle ne touche QU'UNE lettre isolée suivie d'un point :
             --   « Delta.Log » garde son séparateur et reste deux mots.
             regexp_replace(
               translate(lower(COALESCE(p_nom, '')),
                         'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
                         'aaaaaaceeeeiiiinooooouuuuyy'),
               '\m([a-z])\.', '\1', 'g'),
             '[^a-z0-9]+', ' ', 'g')) AS simple
  ),
  sans_forme AS (
    SELECT simple,
           btrim(regexp_replace(
             regexp_replace(simple,
               '\m(sarl|sarlu|sas|sasu|sa|eurl|sci|scop|snc|gie|eirl|scm|selarl|ltd|llc|inc|corp|gmbh|bv|nv|srl|spa|plc|ag|cie|ets)\M',
               ' ', 'g'),
             '\s+', ' ', 'g')) AS nettoye
      FROM base
  )
  SELECT CASE WHEN nettoye = '' THEN simple ELSE nettoye END FROM sans_forme;
$$;

-- Les domaines de messagerie grand public, en base. La liste du moteur
-- (`DOMAINES_GRAND_PUBLIC`) en est le miroir ; les deux doivent rester
-- alignées, et un essai le vérifie côté application.
CREATE OR REPLACE FUNCTION public.est_domaine_grand_public(p_domaine TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_domaine, ''))) = ANY (ARRAY[
    'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com',
    'hotmail.fr', 'live.com', 'live.fr', 'msn.com', 'yahoo.com', 'yahoo.fr',
    'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com',
    'mail.com', 'gmx.com', 'gmx.fr', 'orange.fr', 'wanadoo.fr', 'free.fr',
    'laposte.net', 'sfr.fr', 'bbox.fr', 'neuf.fr', 'numericable.fr',
    'aliceadsl.fr', 'club-internet.fr', 'voila.fr', 'yopmail.com'
  ]);
$$;

-- Forme d'un nom de domaine. Écrite UNE FOIS : elle sert à la contrainte du
-- domaine principal, à celle des secondaires, et au tri de l'import.
CREATE OR REPLACE FUNCTION public.domaine_correspondant_valide(p_domaine TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_domaine, '') ~
           '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     AND NOT public.est_domaine_grand_public(p_domaine);
$$;

-- ⚠ UNE FONCTION, PAS UN `NOT EXISTS (SELECT …)` DANS LA CONTRAINTE.
--   PostgreSQL refuse toute sous-requête dans un CHECK — y compris un
--   `unnest`. Le contrôle du tableau doit donc passer par une fonction
--   IMMUTABLE, qui a le droit, elle, de parcourir ses propres arguments.
--
-- ⚠ `bool_and` SUR UN ENSEMBLE VIDE REND NULL, et un CHECK à NULL passe. Le
--   COALESCE rend l'intention explicite : un tableau vide est valide.
CREATE OR REPLACE FUNCTION public.domaines_correspondant_valides(p_domaines TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(bool_and(public.domaine_correspondant_valide(d)), TRUE)
    FROM unnest(COALESCE(p_domaines, '{}'::TEXT[])) d;
$$;

-- =============================================================================
-- 2. La table
-- =============================================================================

CREATE TABLE IF NOT EXISTS correspondants_confiance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  nom TEXT NOT NULL CHECK (btrim(nom) <> ''),
  -- Forme comparable, calculée par la base et jamais par l'appelant.
  nom_normalise TEXT GENERATED ALWAYS AS
    (public.normaliser_nom_correspondant(nom)) STORED,

  domaine_principal TEXT NOT NULL,
  -- ⚠ UN NOM, PLUSIEURS DOMAINES LÉGITIMES. Un fournisseur avec un .fr et un
  --   .com est le cas ordinaire, pas l'exception. Sans ce tableau, le client
  --   devrait créer deux correspondants du même nom — ce que l'unicité
  --   refuse — ou n'en déclarer qu'un, et la moitié de son courrier
  --   légitime deviendrait une alerte élevée.
  domaines_secondaires TEXT[] NOT NULL DEFAULT '{}',

  source TEXT NOT NULL DEFAULT 'manuel'
    CHECK (source IN ('manuel', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un nom ne peut être déclaré qu'une fois par société : deux entrées
  -- « Delta Log » avec des domaines différents rendraient la règle
  -- indéterminée.
  UNIQUE (company_id, nom_normalise),

  -- ⚠ LE REFUS DU GRAND PUBLIC EST UNE CONTRAINTE, PAS UNE VALIDATION
  --   D'ÉCRAN. Une validation côté navigateur se contourne ; celle-ci non.
  CONSTRAINT correspondant_domaine_principal_valide
    CHECK (public.domaine_correspondant_valide(domaine_principal)),
  CONSTRAINT correspondant_domaines_secondaires_valides
    CHECK (public.domaines_correspondant_valides(domaines_secondaires))
);

COMMENT ON TABLE correspondants_confiance IS
  'Fournisseurs et partenaires déclarés par le client, avec leurs domaines légitimes. Déclarés à la main ou importés — JAMAIS déduits de l''historique des boîtes.';

COMMENT ON COLUMN correspondants_confiance.nom_normalise IS
  'Forme comparable du nom : minuscules, sans accent, sans forme juridique. Calculée par la base pour que l''ajout à l''unité et l''import ne puissent pas diverger.';

CREATE INDEX IF NOT EXISTS idx_correspondants_company
  ON correspondants_confiance(company_id, nom_normalise);

-- ⚠ UNE COLONNE GÉNÉRÉE STORED NE SE RECALCULE PAS QUAND SA FONCTION CHANGE.
--   PostgreSQL accepte le CREATE OR REPLACE mais laisse les lignes existantes
--   sur l'ancienne valeur : rejouer cette migration après une correction de
--   `normaliser_nom_correspondant` laisserait des formes normalisées périmées,
--   donc des doublons invisibles et une règle qui ne reconnaît plus son
--   correspondant. Cette écriture sans effet apparent force le recalcul.
UPDATE correspondants_confiance SET nom = nom
 WHERE nom_normalise IS DISTINCT FROM public.normaliser_nom_correspondant(nom);

-- =============================================================================
-- 3. RLS — un client ne voit que les siens
-- =============================================================================

ALTER TABLE correspondants_confiance ENABLE ROW LEVEL SECURITY;

-- Même règle que pour les menaces : `get_my_company_id()` résout `auth.uid()`
-- vers une société, et rien d'autre n'est visible.
DROP POLICY IF EXISTS correspondants_select_own ON correspondants_confiance;
CREATE POLICY correspondants_select_own ON correspondants_confiance FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS correspondants_insert_own ON correspondants_confiance;
CREATE POLICY correspondants_insert_own ON correspondants_confiance FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- ⚠ `company_id` EST DANS LE `WITH CHECK` AUTANT QUE DANS LE `USING`. Sans le
--   premier, un client pourrait modifier SA ligne en la réattribuant à la
--   société d'un autre — l'ancienne valeur passe le USING, la nouvelle n'est
--   jamais contrôlée.
DROP POLICY IF EXISTS correspondants_update_own ON correspondants_confiance;
CREATE POLICY correspondants_update_own ON correspondants_confiance FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS correspondants_delete_own ON correspondants_confiance;
CREATE POLICY correspondants_delete_own ON correspondants_confiance FOR DELETE
  USING (company_id = public.get_my_company_id());

-- `updated_at` tenu par la base : l'écran ne peut pas l'oublier.
CREATE OR REPLACE FUNCTION public.toucher_correspondant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_correspondant_maj ON correspondants_confiance;
CREATE TRIGGER trg_correspondant_maj
  BEFORE UPDATE ON correspondants_confiance
  FOR EACH ROW EXECUTE FUNCTION public.toucher_correspondant();

-- =============================================================================
-- 4. L'import en lot
-- =============================================================================

-- ⚠ UNE SEULE TRANSACTION POUR TOUT LE FICHIER, ET UN COMPTE RENDU LIGNE PAR
--   LIGNE. Un import de trois cents fournisseurs qui s'arrête à la centième
--   sur un doublon laisserait le client avec une liste à moitié remplie, sans
--   savoir laquelle. Ici chaque entrée est acceptée, fusionnée ou écartée, et
--   la fonction dit laquelle et pourquoi.
--
-- ⚠ LES DOMAINES GRAND PUBLIC SONT ÉCARTÉS ICI AUSSI, avant la contrainte.
--   La contrainte protège la base ; ce filtre-ci permet de DIRE au client ce
--   qui a été écarté, au lieu de faire échouer tout son fichier.
--
-- p_entrees : [{ "nom": "...", "domaines": ["...", "..."] }]
CREATE OR REPLACE FUNCTION public.importer_correspondants(
  p_company_id UUID,
  p_entrees JSONB
)
RETURNS TABLE (
  nom TEXT,
  issue TEXT,          -- 'cree' | 'fusionne' | 'ecarte'
  motif TEXT,
  domaines_retenus TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entree JSONB;
  v_nom TEXT;
  v_domaines TEXT[];
  v_propres TEXT[];
  v_ecartes TEXT[];
  v_d TEXT;
  v_existant correspondants_confiance%ROWTYPE;
BEGIN
  -- ⚠ ÉGALITÉ STRICTE AVEC LA SOCIÉTÉ DE L'APPELANT, SANS AUCUN REPLI. Une
  --   première version écrivait `COALESCE(get_my_company_id(), p_company_id)`
  --   pour laisser passer le service : la faille était qu'un compte
  --   authentifié SANS société — `get_my_company_id()` rend alors NULL —
  --   retombait sur `p_company_id <> p_company_id`, donc faux, donc autorisé.
  --   N'importe quel inscrit aurait pu écrire dans la liste de n'importe quel
  --   client. Le repli est supprimé, et avec lui le droit d'exécution du
  --   service : cette fonction n'est appelée que depuis le navigateur, par
  --   une session authentifiée.
  IF p_company_id IS NULL
     OR p_company_id IS DISTINCT FROM public.get_my_company_id()
  THEN
    RAISE EXCEPTION 'société non autorisée';
  END IF;

  FOR v_entree IN SELECT * FROM jsonb_array_elements(COALESCE(p_entrees, '[]'::jsonb))
  LOOP
    v_nom := btrim(COALESCE(v_entree ->> 'nom', ''));

    SELECT COALESCE(array_agg(DISTINCT lower(btrim(d))), '{}')
      INTO v_domaines
      FROM jsonb_array_elements_text(COALESCE(v_entree -> 'domaines', '[]'::jsonb)) d
     WHERE btrim(d) <> '';

    IF v_nom = '' THEN
      nom := COALESCE(v_entree ->> 'nom', '(sans nom)');
      issue := 'ecarte'; motif := 'nom vide'; domaines_retenus := '{}';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Tri des domaines : ce qui passe, ce qui est refusé, et pourquoi.
    v_propres := '{}'; v_ecartes := '{}';
    FOREACH v_d IN ARRAY v_domaines LOOP
      IF public.domaine_correspondant_valide(v_d) THEN
        v_propres := v_propres || v_d;
      ELSE
        v_ecartes := v_ecartes || v_d;
      END IF;
    END LOOP;

    IF array_length(v_propres, 1) IS NULL THEN
      nom := v_nom; issue := 'ecarte'; domaines_retenus := '{}';
      motif := CASE
        WHEN array_length(v_ecartes, 1) IS NULL THEN 'aucun domaine'
        ELSE 'aucun domaine utilisable (' || array_to_string(v_ecartes, ', ') || ')'
      END;
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT * INTO v_existant FROM correspondants_confiance c
     WHERE c.company_id = p_company_id
       AND c.nom_normalise = public.normaliser_nom_correspondant(v_nom);

    IF FOUND THEN
      -- ⚠ ON FUSIONNE, ON N'ÉCRASE PAS. Deux lignes du fichier portant le même
      --   fournisseur avec des domaines différents sont le cas normal d'un
      --   export comptable : chacune apporte un domaine de plus. Écraser
      --   laisserait le dernier gagner, silencieusement.
      UPDATE correspondants_confiance c
         SET domaines_secondaires = (
               SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}')
                 FROM unnest(c.domaines_secondaires || v_propres) d
                WHERE d <> c.domaine_principal)
       WHERE c.id = v_existant.id
      RETURNING ARRAY[c.domaine_principal] || c.domaines_secondaires
           INTO domaines_retenus;

      nom := v_existant.nom; issue := 'fusionne';
      motif := CASE
        WHEN array_length(v_ecartes, 1) IS NULL THEN NULL
        ELSE 'écartés : ' || array_to_string(v_ecartes, ', ')
      END;
      RETURN NEXT; CONTINUE;
    END IF;

    INSERT INTO correspondants_confiance
      (company_id, nom, domaine_principal, domaines_secondaires, source)
    VALUES (
      p_company_id, v_nom, v_propres[1],
      COALESCE((SELECT array_agg(DISTINCT d ORDER BY d)
                  FROM unnest(v_propres[2:]) d), '{}'),
      'import');

    nom := v_nom; issue := 'cree';
    motif := CASE
      WHEN array_length(v_ecartes, 1) IS NULL THEN NULL
      ELSE 'écartés : ' || array_to_string(v_ecartes, ', ')
    END;
    domaines_retenus := v_propres;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.importer_correspondants(UUID, JSONB)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.importer_correspondants(UUID, JSONB) TO authenticated;

-- =============================================================================
-- 5. Le moteur reçoit les correspondants
-- =============================================================================

-- Reprise à l'identique de la version de 20260915 — journalisation comprise —
-- avec la seule clé qui s'ajoute : `correspondants`.
--
-- ⚠ LE MOTEUR NE REÇOIT QUE LE NOM ET LES DOMAINES. Ni l'identifiant, ni la
--   source, ni les dates : il n'en a pas besoin, et tout ce qui entre dans le
--   contexte transite ensuite par la mémoire du worker à chaque message.
CREATE OR REPLACE FUNCTION public.contexte_detection_graph(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contexte JSONB;
  v_personnes INTEGER;
BEGIN
  SELECT count(*) INTO v_personnes
    FROM annuaire_personnes WHERE company_id = p_company_id;

  SELECT jsonb_build_object(
    'domainesInternes', COALESCE((
      SELECT jsonb_agg(domaine ORDER BY domaine) FROM company_domaines
       WHERE company_id = p_company_id AND actif AND interne
    ), '[]'::jsonb),
    'domainesAutorises', COALESCE((
      SELECT jsonb_agg(domaine ORDER BY domaine) FROM company_domaines
       WHERE company_id = p_company_id AND actif AND NOT interne
    ), '[]'::jsonb),
    'annuaire', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('nom', nom, 'email', email) ORDER BY nom)
        FROM annuaire_personnes WHERE company_id = p_company_id
    ), '[]'::jsonb),
    'correspondants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'nom', nom,
               'domaines', ARRAY[domaine_principal] || domaines_secondaires
             ) ORDER BY nom)
        FROM correspondants_confiance WHERE company_id = p_company_id
    ), '[]'::jsonb)
  ) INTO v_contexte;

  PERFORM journaliser(
    p_acteur => 'worker', p_ressource => 'annuaire', p_operation => 'lecture',
    p_tache => 'contexte-detection',
    p_company_id => p_company_id, p_volume => v_personnes);

  RETURN v_contexte;
END;
$$;

REVOKE ALL ON FUNCTION public.contexte_detection_graph(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contexte_detection_graph(UUID) TO service_role;

-- =============================================================================
-- 5 bis. Le rapport mensuel compte le nouveau motif
-- =============================================================================

-- ⚠ SANS CETTE REPRISE, LA NOUVELLE RÈGLE SERAIT INVISIBLE DANS LE RAPPORT.
--   `donnees_rapport_mensuel` (20260921) range chaque alerte par famille en
--   listant les raisons du moteur. Une raison inconnue de ces listes ne
--   compte dans aucune famille : le dirigeant lirait « 3 tentatives » et
--   « aucun type de fraude caractérisé » dans le même email.
--
--   `correspondant_domaine_inhabituel` rejoint la famille « usurpation
--   d'identité » : un faux fournisseur usurpe bien une identité, celle d'une
--   entreprise plutôt que celle d'une personne.
--
-- Reprise à l'identique de 20260921, à cette seule ligne près.
CREATE OR REPLACE FUNCTION public.donnees_rapport_mensuel(
  p_company_id UUID,
  p_mois DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debut TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  v_debut_prec TIMESTAMPTZ;
  v_fin_prec TIMESTAMPTZ;
  v_mois_prec DATE := (p_mois - interval '1 month')::DATE;
  v_resultat JSONB;

  v_usurpation TEXT[] := ARRAY[
    'usurpation_identite_annuaire', 'incoherence_nom_adresse',
    'domaine_typosquatte', 'marque_dans_domaine_tiers', 'domaine_grand_public',
    'correspondant_domaine_inhabituel'];
  v_virement TEXT[] := ARRAY['demande_sensible'];
  v_bancaire TEXT[] := ARRAY[
    'changement_coordonnees_bancaires', 'changement_bancaire_annonce',
    'pression_changement_rib'];
  v_urgence TEXT[] := ARRAY['urgence_ou_secret'];
BEGIN
  SELECT b.debut, b.fin INTO v_debut, v_fin FROM bornes_du_mois(p_mois) b;
  SELECT b.debut, b.fin INTO v_debut_prec, v_fin_prec
    FROM bornes_du_mois(v_mois_prec) b;

  SELECT jsonb_build_object(
    'mois', p_mois,
    'societe', (SELECT c.nom FROM companies c WHERE c.id = p_company_id),
    'analyses', (
      SELECT count(*) FROM graph_analyses a
       WHERE a.company_id = p_company_id
         AND a.analyse_at >= v_debut AND a.analyse_at < v_fin),
    'alertes', (
      SELECT jsonb_build_object(
               'eleve',  count(*) FILTER (WHERE a.niveau = 'eleve'),
               'modere', count(*) FILTER (WHERE a.niveau = 'modere'),
               'faible', count(*) FILTER (WHERE a.niveau = 'faible'))
        FROM graph_analyses a
       WHERE a.company_id = p_company_id AND a.alerte
         AND a.analyse_at >= v_debut AND a.analyse_at < v_fin),
    'boites_surveillees', (
      SELECT count(*) FROM boites_surveillees b
       WHERE b.company_id = p_company_id
         AND b.choisie AND b.actif
         AND EXISTS (SELECT 1 FROM graph_abonnements g
                      WHERE g.boite_id = b.id AND g.statut = 'actif')),
    'employes', (
      SELECT count(*) FROM employees e WHERE e.company_id = p_company_id),
    'precedent', (
      SELECT CASE
        WHEN count(*) = 0 THEN jsonb_build_object('existe', false)
        ELSE jsonb_build_object(
          'existe', true,
          'mois', v_mois_prec,
          'analyses', count(*),
          'eleve',  count(*) FILTER (WHERE a.alerte AND a.niveau = 'eleve'),
          'modere', count(*) FILTER (WHERE a.alerte AND a.niveau = 'modere'),
          'faible', count(*) FILTER (WHERE a.alerte AND a.niveau = 'faible'))
        END
        FROM graph_analyses a
       WHERE a.company_id = p_company_id
         AND a.analyse_at >= v_debut_prec AND a.analyse_at < v_fin_prec),
    'types', (
      SELECT jsonb_build_object(
               'usurpation',            count(*) FILTER (WHERE a.raisons ?| v_usurpation),
               'virement',              count(*) FILTER (WHERE a.raisons ?| v_virement),
               'coordonnees_bancaires', count(*) FILTER (WHERE a.raisons ?| v_bancaire),
               'urgence',               count(*) FILTER (WHERE a.raisons ?| v_urgence))
        FROM graph_analyses a
       WHERE a.company_id = p_company_id AND a.alerte
         AND a.analyse_at >= v_debut AND a.analyse_at < v_fin),
    'boites_visees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('boite', t.upn, 'alertes', t.n)
                       ORDER BY t.n DESC, t.upn)
        FROM (SELECT b.upn, count(*) AS n
                FROM graph_analyses a
                JOIN boites_surveillees b ON b.id = a.boite_id
               WHERE a.company_id = p_company_id AND a.alerte
                 AND a.analyse_at >= v_debut AND a.analyse_at < v_fin
               GROUP BY b.upn
               ORDER BY count(*) DESC, b.upn
               LIMIT 3) t),
      '[]'::JSONB)
  ) INTO v_resultat;

  RETURN v_resultat;
END;
$$;

REVOKE ALL ON FUNCTION public.donnees_rapport_mensuel(UUID, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.donnees_rapport_mensuel(UUID, DATE)
  TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- 6.1 Table, RLS, contraintes et fonctions en place.
--     UNE SEULE REQUÊTE À COLLER APRÈS LA MIGRATION :
--
--   SELECT to_regclass('public.correspondants_confiance') IS NOT NULL AS table_ok,
--          (SELECT relrowsecurity FROM pg_class
--            WHERE oid = 'correspondants_confiance'::regclass)        AS rls_ok,
--          (SELECT count(*) FROM pg_policies
--            WHERE tablename = 'correspondants_confiance')            AS politiques,
--          (SELECT count(*) FROM pg_proc p
--             JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public'
--              AND p.proname IN ('normaliser_nom_correspondant',
--                                'est_domaine_grand_public',
--                                'domaine_correspondant_valide',
--                                'domaines_correspondant_valides',
--                                'importer_correspondants'))           AS fonctions;
--
--   Attendu : table_ok = t, rls_ok = t, politiques = 4, fonctions = 5.
--
-- 6.2 La normalisation fait bien son travail — les trois doivent être égales :
--
--   SELECT normaliser_nom_correspondant('DELTA-LOG SARL')  AS a,
--          normaliser_nom_correspondant('Delta Log')       AS b,
--          normaliser_nom_correspondant('delta   log s.a.r.l.') AS c;
--   -- a = b = c = 'delta log'
--
--   Et le repli quand la forme juridique EST le nom :
--   SELECT normaliser_nom_correspondant('SA');   -- 'sa', pas ''
--
-- 6.3 Le grand public est refusé par la base, pas seulement par l'écran :
--
--   INSERT INTO correspondants_confiance (company_id, nom, domaine_principal)
--   VALUES ('<company_id>', 'Essai', 'gmail.com');
--   -- ERREUR attendue : correspondant_domaine_principal_valide
--
-- 6.4 Ce que le moteur reçoit désormais :
--
--   SELECT jsonb_pretty(contexte_detection_graph('<company_id>') -> 'correspondants');
--
-- 6.5 Un import, à blanc sur une entrée :
--
--   SELECT * FROM importer_correspondants('<company_id>',
--     '[{"nom":"Delta Log SARL","domaines":["delta-log.fr","gmail.com"]}]'::jsonb);
--   -- issue = 'cree', motif = 'écartés : gmail.com', domaines = {delta-log.fr}
--
-- 6.6 Le cloisonnement, vu d'un client (à lancer connecté, pas en service) :
--
--   SELECT count(*) FROM correspondants_confiance;
--   -- doit rendre le nombre de SES correspondants, jamais ceux d'un autre.
