-- Journalisation des accès aux données personnelles
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- POURQUOI. Le contrat de sous-traitance engage Safentreprise à notifier une
-- violation sous 48 heures. Sans trace, une consultation non autorisée est
-- indétectable : l'engagement était donc inopérant, et déclaré comme tel dans
-- l'annexe 3 du DPA. Conception : docs/JOURNALISATION-ACCES.md.
--
-- CE QUE CE JOURNAL NE FAIT PAS, et qu'il ne faut pas croire :
--   • il ne voit AUCUNE lecture directe de table. PostgreSQL n'a pas de
--     déclencheur sur SELECT : c'est une limite du moteur. L'éditeur SQL du
--     tableau de bord reste hors couverture ;
--   • le sceau quotidien rend une altération VISIBLE, il ne rend rien
--     immuable ;
--   • il permet de démontrer après coup, pas de découvrir. Tant que la vue de
--     contrôle n'existe pas, la détection reste une revue manuelle.

-- =============================================================================
-- 1. Le journal
-- =============================================================================

CREATE TABLE IF NOT EXISTS journal_acces (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- QUI : un rôle technique, jamais une personne physique.
  acteur TEXT NOT NULL
    CHECK (acteur IN ('worker', 'maintenance', 'veille', 'raccordement',
                      'restauration', 'exploitation', 'purge', 'inconnu')),
  tache TEXT,

  -- POUR QUI : des références, jamais un nom.
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  tenant_uid UUID REFERENCES microsoft_tenants(id) ON DELETE SET NULL,

  -- QUOI.
  ressource TEXT NOT NULL
    CHECK (ressource IN ('message', 'corps', 'annuaire', 'boite', 'analyse',
                         'abonnement', 'categorie', 'application', 'journal')),
  -- La boîte concernée, par son identifiant Graph. C'est un pseudonyme, et il
  -- est nécessaire : une trace qui ne dit pas QUELLE boîte a été lue ne
  -- démontre rien.
  boite_ref TEXT,
  ressource_ref TEXT,
  operation TEXT NOT NULL
    CHECK (operation IN ('lecture', 'ecriture', 'modification', 'suppression')),

  -- RÉSULTAT.
  resultat TEXT NOT NULL
    CHECK (resultat IN ('ok', 'refuse', 'introuvable', 'erreur')),
  code TEXT,
  volume INTEGER,

  -- ⚠ LE JOURNAL NE DOIT CONTENIR AUCUNE ADRESSE. Ce n'est pas une consigne
  --   de rédaction : la base refuse. Un journal qui recopie ce qu'il surveille
  --   double le risque au lieu de le réduire, et une adresse électronique
  --   arrivée là par une inattention y resterait douze mois.
  CONSTRAINT journal_sans_adresse CHECK (
    position('@' in COALESCE(boite_ref, '')) = 0
    AND position('@' in COALESCE(ressource_ref, '')) = 0
    AND position('@' in COALESCE(tache, '')) = 0
    AND position('@' in COALESCE(code, '')) = 0
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_at ON journal_acces(at);
CREATE INDEX IF NOT EXISTS idx_journal_company ON journal_acces(company_id, at);
CREATE INDEX IF NOT EXISTS idx_journal_ressource
  ON journal_acces(ressource, at) WHERE ressource IN ('corps', 'annuaire');

COMMENT ON TABLE journal_acces IS
  'Journal des accès aux données personnelles. Ne contient aucune donnée personnelle : des références techniques, des compteurs et des codes. Écriture par journaliser() uniquement ; ni UPDATE ni DELETE hors purge.';

-- =============================================================================
-- 2. Les sceaux — rendre l'effacement visible
-- =============================================================================

-- L'exigence « personne ne doit pouvoir l'effacer sans que ça se voie » ne se
-- satisfait pas de droits : le propriétaire de la base les contourne. Chaque
-- nuit, on scelle la veille par une empreinte qui inclut celle du jour
-- précédent. Toute suppression, modification ou insertion rétroactive dans un
-- jour scellé casse la chaîne.
--
-- ⚠ CELA NE REND RIEN IMMUABLE. Qui peut écrire dans journal_acces peut
--   réécrire journal_sceaux — mais il lui faut alors refaire tous les jours
--   suivants. On passe d'une suppression discrète à un acte délibéré et
--   étendu. C'est la seule garantie qu'une base offre à son propre
--   propriétaire.
CREATE TABLE IF NOT EXISTS journal_sceaux (
  jour DATE PRIMARY KEY,
  lignes INTEGER NOT NULL,
  premier_id BIGINT,
  dernier_id BIGINT,
  empreinte TEXT NOT NULL,
  empreinte_precedente TEXT,
  scelle_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une fois les lignes du jour purgées, l'empreinte n'est plus recalculable.
  -- Le sceau demeure : c'est lui qui porte la chaîne.
  purge_at TIMESTAMPTZ
);

COMMENT ON TABLE journal_sceaux IS
  'Empreinte chaînée du journal, une ligne par jour. Jamais purgée : sa suppression romprait la chaîne.';

-- =============================================================================
-- 3. Écrire — le seul chemin
-- =============================================================================

-- ⚠ CETTE FONCTION NE RATTRAPE PAS SES ERREURS, ET C'EST VOULU. Appelée depuis
--   les fonctions qui lisent des données personnelles, elle s'exécute dans
--   LEUR transaction. Si l'écriture du journal échoue, la lecture échoue avec
--   elle. Lire sans laisser de trace serait pire que ne pas lire.
CREATE OR REPLACE FUNCTION public.journaliser(
  p_acteur TEXT,
  p_ressource TEXT,
  p_operation TEXT,
  p_resultat TEXT DEFAULT 'ok',
  p_tache TEXT DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_tenant_id TEXT DEFAULT NULL,
  p_boite_ref TEXT DEFAULT NULL,
  p_ressource_ref TEXT DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_volume INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_uid UUID;
  v_company UUID := p_company_id;
BEGIN
  -- Le locataire est désigné par son GUID Microsoft côté application ; on le
  -- résout ici, et on en déduit la société si elle n'a pas été donnée.
  IF p_tenant_id IS NOT NULL THEN
    SELECT t.id, COALESCE(v_company, t.company_id)
      INTO v_tenant_uid, v_company
      FROM microsoft_tenants t
     WHERE t.tenant_id = p_tenant_id;
  END IF;

  INSERT INTO journal_acces (
    acteur, tache, company_id, tenant_uid, ressource,
    boite_ref, ressource_ref, operation, resultat, code, volume
  ) VALUES (
    COALESCE(NULLIF(btrim(p_acteur), ''), 'inconnu'),
    NULLIF(btrim(p_tache), ''),
    v_company, v_tenant_uid,
    p_ressource,
    NULLIF(btrim(p_boite_ref), ''),
    NULLIF(btrim(p_ressource_ref), ''),
    p_operation, p_resultat,
    NULLIF(btrim(p_code), ''),
    p_volume
  );
END;
$$;

-- =============================================================================
-- 4. Lire — borné, et réservé
-- =============================================================================

CREATE OR REPLACE FUNCTION public.journal_extrait(
  p_depuis TIMESTAMPTZ,
  p_jusqu_a TIMESTAMPTZ DEFAULT now(),
  p_limite INTEGER DEFAULT 1000
)
RETURNS TABLE (
  id BIGINT, at TIMESTAMPTZ, acteur TEXT, tache TEXT,
  company_id UUID, tenant_uid UUID, ressource TEXT,
  boite_ref TEXT, ressource_ref TEXT, operation TEXT,
  resultat TEXT, code TEXT, volume INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id, j.at, j.acteur, j.tache, j.company_id, j.tenant_uid,
         j.ressource, j.boite_ref, j.ressource_ref, j.operation,
         j.resultat, j.code, j.volume
    FROM journal_acces j
   WHERE j.at >= p_depuis AND j.at <= p_jusqu_a
   ORDER BY j.id
   LIMIT GREATEST(1, LEAST(p_limite, 10000));
$$;

-- =============================================================================
-- 5. Sceller la veille
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sceller_journal(p_jour DATE DEFAULT NULL)
RETURNS TABLE (jour DATE, lignes INTEGER, empreinte TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jour DATE := COALESCE(p_jour, (now() AT TIME ZONE 'UTC')::date - 1);
  v_precedente TEXT;
  v_corps TEXT;
  v_empreinte TEXT;
  v_lignes INTEGER;
  v_premier BIGINT;
  v_dernier BIGINT;
BEGIN
  -- Déjà scellé : on ne rescelle pas. Rescellerait-on qu'on effacerait la
  -- preuve qu'on cherche à garder.
  IF EXISTS (SELECT 1 FROM journal_sceaux s WHERE s.jour = v_jour) THEN
    RETURN QUERY
      SELECT s.jour, s.lignes, s.empreinte FROM journal_sceaux s WHERE s.jour = v_jour;
    RETURN;
  END IF;

  SELECT s.empreinte INTO v_precedente
    FROM journal_sceaux s ORDER BY s.jour DESC LIMIT 1;

  -- ⚠ LE SCELLEMENT NE VA QUE VERS L'AVANT. Sceller un jour antérieur à un
  --   sceau existant insérerait un maillon au milieu de la chaîne : le sceau
  --   suivant renverrait alors à un prédécesseur qui n'est plus le sien, et
  --   la vérification signalerait à tort une rupture. Pire, ce serait un
  --   moyen commode de brouiller la chaîne après coup.
  --
  --   Un jour manquant reste donc manquant, et cela se voit : c'est
  --   précisément l'information qu'on veut conserver.
  IF EXISTS (SELECT 1 FROM journal_sceaux s WHERE s.jour >= v_jour) THEN
    RAISE EXCEPTION
      'Le journal est déjà scellé au-delà du % : un sceau ne s''insère pas dans le passé.',
      v_jour;
  END IF;

  -- L'empreinte porte sur le contenu exact des lignes du jour, dans l'ordre.
  SELECT count(*), min(j.id), max(j.id),
         COALESCE(string_agg(
           j.id || '|' || j.at || '|' || j.acteur || '|' ||
           COALESCE(j.tache, '') || '|' || COALESCE(j.company_id::text, '') || '|' ||
           COALESCE(j.tenant_uid::text, '') || '|' || j.ressource || '|' ||
           COALESCE(j.boite_ref, '') || '|' || COALESCE(j.ressource_ref, '') || '|' ||
           j.operation || '|' || j.resultat || '|' || COALESCE(j.code, '') || '|' ||
           COALESCE(j.volume::text, ''),
           E'\n' ORDER BY j.id), '')
    INTO v_lignes, v_premier, v_dernier, v_corps
    FROM journal_acces j
   WHERE (j.at AT TIME ZONE 'UTC')::date = v_jour;

  -- ⚠ pgcrypto vit dans le schéma « extensions » sur Supabase, pas dans
  --   « public ». La fonction ayant search_path = public, il faut qualifier.
  v_empreinte := encode(
    extensions.digest(COALESCE(v_precedente, '') || E'\n' || v_corps, 'sha256'),
    'hex');

  INSERT INTO journal_sceaux
    (jour, lignes, premier_id, dernier_id, empreinte, empreinte_precedente)
  VALUES (v_jour, v_lignes, v_premier, v_dernier, v_empreinte, v_precedente);

  RETURN QUERY SELECT v_jour, v_lignes, v_empreinte;
END;
$$;

-- =============================================================================
-- 6. Vérifier la chaîne
-- =============================================================================

-- Rend une ligne par jour dont le sceau ne correspond plus. Doit rester vide.
CREATE OR REPLACE FUNCTION public.verifier_sceaux_journal()
RETURNS TABLE (jour DATE, motif TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_corps TEXT;
  v_recalcul TEXT;
  v_attendue TEXT;
BEGIN
  FOR s IN SELECT * FROM journal_sceaux ORDER BY jour LOOP
    -- Chaînage : l'empreinte précédente enregistrée doit être celle du sceau
    -- qui précède. Ce contrôle vaut même pour un jour purgé.
    SELECT p.empreinte INTO v_attendue
      FROM journal_sceaux p WHERE p.jour < s.jour ORDER BY p.jour DESC LIMIT 1;

    IF COALESCE(v_attendue, '') <> COALESCE(s.empreinte_precedente, '') THEN
      jour := s.jour;
      motif := 'CHAÎNE ROMPUE — le sceau ne se rattache plus au jour précédent.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Les lignes d'un jour purgé n'existent plus : leur empreinte n'est plus
    -- recalculable, et leur absence n'est pas une anomalie.
    CONTINUE WHEN s.purge_at IS NOT NULL;

    SELECT COALESCE(string_agg(
             j.id || '|' || j.at || '|' || j.acteur || '|' ||
             COALESCE(j.tache, '') || '|' || COALESCE(j.company_id::text, '') || '|' ||
             COALESCE(j.tenant_uid::text, '') || '|' || j.ressource || '|' ||
             COALESCE(j.boite_ref, '') || '|' || COALESCE(j.ressource_ref, '') || '|' ||
             j.operation || '|' || j.resultat || '|' || COALESCE(j.code, '') || '|' ||
             COALESCE(j.volume::text, ''),
             E'\n' ORDER BY j.id), '')
      INTO v_corps
      FROM journal_acces j
     WHERE (j.at AT TIME ZONE 'UTC')::date = s.jour;

    v_recalcul := encode(
      extensions.digest(COALESCE(s.empreinte_precedente, '') || E'\n' || v_corps, 'sha256'),
      'hex');

    IF v_recalcul <> s.empreinte THEN
      jour := s.jour;
      motif := 'JOURNAL ALTÉRÉ — les lignes de ce jour ne correspondent plus à leur sceau.';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- 7. Purger — douze mois
-- =============================================================================

-- Douze mois : le journal ne doit pas être plus court que la donnée qu'il
-- décrit — une analyse de message signalé vit douze mois — et il doit couvrir
-- le délai de découverte d'une violation.
--
-- Les SCEAUX ne sont jamais purgés : ils pèsent une ligne par jour, et leur
-- suppression romprait la chaîne. On les marque purgés, ce qui dit à la
-- vérification de ne plus recalculer ces jours-là.
CREATE OR REPLACE FUNCTION public.purger_journal_acces()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horizon DATE := (now() AT TIME ZONE 'UTC')::date - 365;
  v_supprimees INTEGER;
BEGIN
  DELETE FROM journal_acces
   WHERE (at AT TIME ZONE 'UTC')::date < v_horizon;
  GET DIAGNOSTICS v_supprimees = ROW_COUNT;

  UPDATE journal_sceaux
     SET purge_at = now()
   WHERE jour < v_horizon AND purge_at IS NULL;

  -- La purge se journalise elle-même : une suppression hors de cette fenêtre
  -- n'aurait, elle, aucune ligne correspondante.
  IF v_supprimees > 0 THEN
    PERFORM journaliser(
      p_acteur => 'purge', p_ressource => 'journal', p_operation => 'suppression',
      p_tache => 'purge-12-mois', p_volume => v_supprimees);
  END IF;

  RETURN v_supprimees;
END;
$$;

-- =============================================================================
-- 8. Droits — écriture seule pour le code applicatif
-- =============================================================================

ALTER TABLE journal_acces ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_sceaux ENABLE ROW LEVEL SECURITY;

-- Aucune politique, et le droit retiré à TOUT LE MONDE, service_role compris.
-- Le seul chemin d'écriture est journaliser() ; le seul chemin de lecture est
-- journal_extrait() ; le seul chemin de suppression est purger_journal_acces().
-- Aucun UPDATE nulle part : le journal ne se corrige pas.
REVOKE ALL ON TABLE journal_acces FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE journal_sceaux FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE journal_acces_id_seq FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.journaliser(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journaliser(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.journal_extrait(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journal_extrait(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.sceller_journal(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sceller_journal(DATE) TO service_role;

REVOKE ALL ON FUNCTION public.verifier_sceaux_journal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verifier_sceaux_journal() TO service_role;

REVOKE ALL ON FUNCTION public.purger_journal_acces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purger_journal_acces() TO service_role;

-- =============================================================================
-- 9. La mesure qui change la couverture réelle
-- =============================================================================

-- ⚠ SANS ELLE, TOUT CE QUI PRÉCÈDE SE CONTOURNE. graph_corps_originaux était
--   révoquée pour anon et authenticated, mais PAS pour service_role : la clé
--   d'exploitation pouvait lire les corps directement, sans passer par la
--   fonction, donc sans laisser de trace.
--
--   La fonction corps_original_graph() est en SECURITY DEFINER et continue de
--   fonctionner. Elle devient le SEUL chemin de lecture, et il est journalisé.
--   Vérifié : aucun code ne lit cette table autrement (seul appelant,
--   src/app/api/microsoft/maintenance/route.ts).
REVOKE ALL ON TABLE graph_corps_originaux FROM service_role;

-- =============================================================================
-- 10. Instrumenter les trois fonctions qui touchent des données personnelles
-- =============================================================================

-- 10.1 Lecture d'un corps stocké.
--
-- ⚠ LA TRACE EST ÉCRITE DANS LA FONCTION, pas dans l'appelant TypeScript.
--   C'est délibéré : un appel lancé depuis l'éditeur SQL est journalisé au
--   même titre qu'un appel du worker.
CREATE OR REPLACE FUNCTION public.corps_original_graph(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS TABLE (contenu TEXT, content_type TEXT, empreinte TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trouve INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_trouve
    FROM graph_corps_originaux g
   WHERE g.company_id = p_company_id AND g.message_id = p_message_id;

  PERFORM journaliser(
    p_acteur => 'restauration', p_ressource => 'corps', p_operation => 'lecture',
    p_resultat => CASE WHEN v_trouve > 0 THEN 'ok' ELSE 'introuvable' END,
    p_tache => 'lecture-corps-original',
    p_company_id => p_company_id, p_ressource_ref => p_message_id,
    p_volume => v_trouve);

  RETURN QUERY
    SELECT g.contenu, g.content_type, g.empreinte, g.created_at
      FROM graph_corps_originaux g
     WHERE g.company_id = p_company_id AND g.message_id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.corps_original_graph(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corps_original_graph(UUID, TEXT) TO service_role;

-- 10.2 Lecture de l'annuaire, par le contexte de détection.
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
    ), '[]'::jsonb)
  ) INTO v_contexte;

  -- Le nombre de personnes lues, jamais leurs noms ni leurs adresses.
  PERFORM journaliser(
    p_acteur => 'worker', p_ressource => 'annuaire', p_operation => 'lecture',
    p_tache => 'contexte-detection',
    p_company_id => p_company_id, p_volume => v_personnes);

  RETURN v_contexte;
END;
$$;

REVOKE ALL ON FUNCTION public.contexte_detection_graph(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contexte_detection_graph(UUID) TO service_role;

-- 10.3 Création d'une copie de corps. Ce n'est pas une lecture, mais la copie
--      d'un contenu de message mérite la même trace.
CREATE OR REPLACE FUNCTION public.sauvegarder_corps_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_contenu TEXT,
  p_content_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taille INTEGER;
  v_issue TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM graph_corps_originaux
     WHERE company_id = p_company_id AND message_id = p_message_id
  ) THEN
    v_issue := 'deja-sauvegarde';
  ELSIF p_contenu IS NULL THEN
    v_issue := 'corps-absent';
  ELSIF p_contenu LIKE '%SAFENTREPRISE-BANNIERE:DEBUT%'
     OR p_contenu LIKE '%data-safentreprise%'
     OR p_contenu LIKE '%SAFENTREPRISE — AVERTISSEMENT%'
  THEN
    v_issue := 'contient-banniere';
  ELSE
    v_taille := octet_length(p_contenu);
    IF v_taille > 1000000 THEN
      v_issue := 'trop-volumineux';
    ELSE
      INSERT INTO graph_corps_originaux
        (company_id, message_id, contenu, content_type, taille_octets, empreinte)
      VALUES (
        p_company_id, p_message_id, p_contenu, p_content_type, v_taille,
        encode(extensions.digest(p_contenu, 'sha256'), 'hex'))
      ON CONFLICT (company_id, message_id) DO NOTHING;
      v_issue := 'sauvegarde';
    END IF;
  END IF;

  PERFORM journaliser(
    p_acteur => 'worker', p_ressource => 'corps', p_operation => 'ecriture',
    p_resultat => CASE WHEN v_issue = 'sauvegarde' THEN 'ok' ELSE 'refuse' END,
    p_tache => v_issue,
    p_company_id => p_company_id, p_ressource_ref => p_message_id,
    p_volume => v_taille);

  RETURN v_issue;
END;
$$;

REVOKE ALL ON FUNCTION public.sauvegarder_corps_graph(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sauvegarder_corps_graph(UUID, TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 11. Tâches de nuit
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
      FROM cron.job
     WHERE jobname IN ('safentreprise-journal-sceau', 'safentreprise-journal-purge');

    -- Après les purges existantes (03:45-03:55), pour que leur activité de la
    -- veille soit scellée avec le reste.
    PERFORM cron.schedule('safentreprise-journal-sceau', '5 4 * * *',
      $c$SELECT public.sceller_journal();$c$);

    PERFORM cron.schedule('safentreprise-journal-purge', '10 4 * * *',
      $c$SELECT public.purger_journal_acces();$c$);
  END IF;
END $$;
