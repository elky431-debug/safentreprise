-- Domaines de l'entreprise et instantané de l'annuaire
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- OBJET : donner au moteur de détection les faits qu'il ne peut pas établir
-- seul — quels domaines appartiennent réellement au client, et qui figure à
-- son annuaire. Sans eux, le moteur ne voit pas qu'un domaine est typosquatté
-- ni qu'un nom de dirigeant est usurpé.
--
-- DEUX SOURCES, ET C'EST ESSENTIEL :
--
--   'annuaire' — dérivé automatiquement des adresses du locataire Microsoft.
--                Le rafraîchissement quotidien réécrit CES LIGNES ET ELLES
--                SEULES.
--   'manuel'   — ajouté par le client. Un client sous Mailchimp doit pouvoir
--                déclarer le domaine de son routeur, sinon ses propres
--                campagnes seront signalées. Le rafraîchissement n'y touche
--                JAMAIS.
--
-- Sur Outlook la bannière est irréversible : un domaine légitime absent de
-- cette table, c'est du courrier défiguré définitivement.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Domaines rattachés à une entreprise
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_domaines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_uid UUID REFERENCES microsoft_tenants(id) ON DELETE CASCADE,

  domaine TEXT NOT NULL,

  -- true  : domaine de l'entreprise elle-même. C'est la RÉFÉRENCE contre
  --         laquelle on mesure le typosquattage.
  -- false : tiers légitime (routeur d'emailing, filiale, partenaire). Ne sert
  --         qu'à ne pas alerter.
  interne BOOLEAN NOT NULL DEFAULT true,

  source TEXT NOT NULL DEFAULT 'manuel'
    CHECK (source IN ('annuaire', 'manuel')),

  actif BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, domaine)
);

CREATE INDEX IF NOT EXISTS idx_domaines_company
  ON company_domaines(company_id) WHERE actif;

ALTER TABLE company_domaines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domaines_select_own ON company_domaines;
CREATE POLICY domaines_select_own ON company_domaines FOR SELECT
  USING (company_id = public.get_my_company_id());

-- L'interface viendra plus tard, mais la règle d'écriture est posée dès
-- maintenant : un dirigeant ne gère QUE les domaines manuels de SA société.
-- Les lignes dérivées de l'annuaire ne sont modifiables que par le worker.
DROP POLICY IF EXISTS domaines_insert_manuel ON company_domaines;
CREATE POLICY domaines_insert_manuel ON company_domaines FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND source = 'manuel');

DROP POLICY IF EXISTS domaines_update_manuel ON company_domaines;
CREATE POLICY domaines_update_manuel ON company_domaines FOR UPDATE
  USING (company_id = public.get_my_company_id() AND source = 'manuel')
  WITH CHECK (company_id = public.get_my_company_id() AND source = 'manuel');

DROP POLICY IF EXISTS domaines_delete_manuel ON company_domaines;
CREATE POLICY domaines_delete_manuel ON company_domaines FOR DELETE
  USING (company_id = public.get_my_company_id() AND source = 'manuel');

-- =============================================================================
-- 2. Instantané de l'annuaire
-- =============================================================================

-- On ne peut pas appeler /users à chaque message : pagination, quotas,
-- latence. On garde un instantané, rafraîchi une fois par jour.
--
-- ⚠ CETTE TABLE CONTIENT DES DONNÉES PERSONNELLES — nom et adresse de chaque
--   personne de l'entreprise cliente. Elle sort du cadre décrit aujourd'hui
--   par la politique de confidentialité, qui doit être mise à jour avant toute
--   mise en service.
CREATE TABLE IF NOT EXISTS annuaire_personnes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_uid UUID NOT NULL REFERENCES microsoft_tenants(id) ON DELETE CASCADE,

  graph_user_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT,

  maj_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, graph_user_id)
);

CREATE INDEX IF NOT EXISTS idx_annuaire_company
  ON annuaire_personnes(company_id);

ALTER TABLE annuaire_personnes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annuaire_select_own ON annuaire_personnes;
CREATE POLICY annuaire_select_own ON annuaire_personnes FOR SELECT
  USING (company_id = public.get_my_company_id());

-- =============================================================================
-- 3. Rafraîchissement de l'annuaire
-- =============================================================================

-- p_personnes : [{ "graph_user_id": "...", "nom": "...", "email": "..." }]
-- p_domaines  : domaines dérivés des adresses du locataire.
--
-- Les domaines 'manuel' ne sont NI écrasés NI supprimés. Un domaine déjà
-- présent en manuel reste manuel : le client a tranché, l'automatisme
-- n'a pas à revenir dessus.
CREATE OR REPLACE FUNCTION public.rafraichir_annuaire_graph(
  p_tenant_uid UUID,
  p_personnes JSONB,
  p_domaines TEXT[]
)
RETURNS TABLE (personnes INTEGER, domaines INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_personnes INTEGER := 0;
  v_domaines INTEGER := 0;
BEGIN
  SELECT company_id INTO v_company
    FROM microsoft_tenants WHERE id = p_tenant_uid AND statut = 'actif';
  IF v_company IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- — Personnes —
  WITH entrantes AS (
    SELECT
      (e ->> 'graph_user_id') AS graph_user_id,
      left(e ->> 'nom', 200)  AS nom,
      left(e ->> 'email', 320) AS email
    FROM jsonb_array_elements(COALESCE(p_personnes, '[]'::jsonb)) e
    WHERE COALESCE(e ->> 'graph_user_id', '') <> ''
      AND COALESCE(e ->> 'nom', '') <> ''
  ),
  majees AS (
    INSERT INTO annuaire_personnes (company_id, tenant_uid, graph_user_id, nom, email)
    SELECT v_company, p_tenant_uid, graph_user_id, nom, email FROM entrantes
    ON CONFLICT (company_id, graph_user_id) DO UPDATE SET
      nom = EXCLUDED.nom,
      email = EXCLUDED.email,
      maj_at = now()
    RETURNING graph_user_id
  )
  SELECT count(*) INTO v_personnes FROM majees;

  -- Les personnes disparues de l'annuaire sortent de l'instantané.
  --
  -- ⚠ SEULEMENT si la charge n'est pas vide. Un annuaire à zéro personne
  --   n'existe pas : c'est un appel Graph qui a échoué, ou une pagination
  --   interrompue. Purger sur cette base viderait l'instantané et rendrait le
  --   moteur aveugle à l'usurpation jusqu'au rafraîchissement suivant.
  IF jsonb_array_length(COALESCE(p_personnes, '[]'::jsonb)) > 0 THEN
    DELETE FROM annuaire_personnes a
     WHERE a.company_id = v_company
       AND a.tenant_uid = p_tenant_uid
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_personnes) e
          WHERE e ->> 'graph_user_id' = a.graph_user_id
       );
  END IF;

  -- — Domaines dérivés —
  WITH entrants AS (
    SELECT DISTINCT lower(trim(d)) AS domaine
      FROM unnest(COALESCE(p_domaines, ARRAY[]::TEXT[])) d
     WHERE trim(d) <> ''
  ),
  majes AS (
    INSERT INTO company_domaines (company_id, tenant_uid, domaine, interne, source)
    SELECT v_company, p_tenant_uid, domaine, true, 'annuaire' FROM entrants
    -- Un domaine déjà déclaré à la main garde sa source et sa note : le
    -- client a tranché. On ne fait que le réactiver s'il était désactivé.
    ON CONFLICT (company_id, domaine) DO UPDATE SET
      maj_at = now(),
      actif = true
    RETURNING domaine
  )
  SELECT count(*) INTO v_domaines FROM majes;

  -- Les domaines DÉRIVÉS qui ont disparu du locataire sont désactivés.
  -- Les domaines MANUELS ne sont jamais touchés ici.
  --
  -- Même garde que pour les personnes : une liste vide est un échec d'appel,
  -- pas une entreprise sans domaine. Désactiver le domaine de référence
  -- désarmerait la détection de typosquattage.
  IF array_length(COALESCE(p_domaines, ARRAY[]::TEXT[]), 1) > 0 THEN
    UPDATE company_domaines c
       SET actif = false, maj_at = now()
     WHERE c.company_id = v_company
       AND c.source = 'annuaire'
       AND c.actif
       AND NOT EXISTS (
         SELECT 1 FROM unnest(p_domaines) d
          WHERE lower(trim(d)) = c.domaine
       );
  END IF;

  RETURN QUERY SELECT v_personnes, v_domaines;
END;
$$;

-- =============================================================================
-- 4. Contexte de détection, pour le worker
-- =============================================================================

-- Renvoie d'un seul appel ce que le moteur attend dans son paramètre
-- `contexte`. Le worker l'appelle une fois par entreprise et par exécution.
CREATE OR REPLACE FUNCTION public.contexte_detection_graph(p_company_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ), '[]'::jsonb)
  );
$$;

-- =============================================================================
-- 5. Droits
-- =============================================================================

REVOKE ALL ON FUNCTION public.rafraichir_annuaire_graph(UUID, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contexte_detection_graph(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rafraichir_annuaire_graph(UUID, JSONB, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.contexte_detection_graph(UUID) TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

--   SELECT domaine, interne, source, actif FROM company_domaines
--    ORDER BY source, domaine;
--
--   SELECT count(*) FROM annuaire_personnes;
--
-- Ajouter un domaine à la main (le routeur d'emailing du client) :
--
--   INSERT INTO company_domaines (company_id, domaine, interne, source, note)
--   VALUES ('<company_id>', 'mailchimp-client.com', false, 'manuel',
--           'Routeur d''emailing');
