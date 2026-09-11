-- Rapport mensuel au dirigeant, le 1er de chaque mois, pour le mois écoulé
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : l'alerte prévient quand une tentative arrive. Le rapport prouve que
-- la surveillance tourne — Y COMPRIS LES MOIS OÙ RIEN NE SE PASSE. C'est
-- exactement le moment où un client se demande pourquoi il paie.
--
-- ⚠ LE MOIS VIDE S'ENVOIE QUAND MÊME, ET C'EST LE POINT. Un rapport qui ne
--   part que les mois chargés laisse le silence se confondre avec la panne.
--   Rien dans ce fichier ne filtre sur « il s'est passé quelque chose ».
--
-- ⚠ AGRÉGÉ, JAMAIS NOMINATIF SUR LES MESSAGES. Aucun objet, aucun corps,
--   aucune adresse d'expéditeur ne sort d'ici — les fonctions ne rendent que
--   des décomptes. Les adresses des BOÎTES visées y figurent, elles : savoir
--   quel poste est pris pour cible est ce qui permet de le protéger.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UN SEUL RAPPORT PAR SOCIÉTÉ ET PAR MOIS, GARANTI PAR LA BASE.
--
--   La garantie n'est pas dans le code applicatif, elle est dans la
--   contrainte `UNIQUE (company_id, mois)`. La réclamation est un
--   `INSERT … ON CONFLICT DO NOTHING RETURNING` : cent passages simultanés du
--   worker produisent une seule ligne, et une seule d'entre eux la reçoit.
--   C'est la même garantie que `reclamer_notifications_alertes`, obtenue par
--   un moyen plus fort — un index unique plutôt qu'un verrou de ligne.
--
--   `envoye_at` distingue ensuite « réclamé » de « parti ». Un envoi qui rate
--   laisse la ligne en place avec `envoye_at IS NULL` : elle est reprise au
--   passage suivant après un délai de garde, et c'est elle que le contrôle
--   « rapport mensuel » du worker lit pour passer au rouge.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. La table
-- =============================================================================

CREATE TABLE IF NOT EXISTS rapports_mensuels (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Premier jour du mois COUVERT par le rapport, en heure de Paris.
  mois DATE NOT NULL,
  reclame_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  envoye_at TIMESTAMPTZ,
  destinataires INTEGER,
  erreur TEXT,
  -- ⚠ C'EST CETTE LIGNE QUI PORTE LA PROMESSE « UN PAR MOIS ». La retirer
  --   rendrait le doublon possible dès que deux workers se croisent.
  UNIQUE (company_id, mois)
);

COMMENT ON TABLE rapports_mensuels IS
  'Un rapport mensuel par société et par mois. La contrainte d''unicité EST le mécanisme anti-doublon : la réclamation est un INSERT ON CONFLICT DO NOTHING.';

CREATE INDEX IF NOT EXISTS idx_rapports_non_envoyes
  ON rapports_mensuels(reclame_at) WHERE envoye_at IS NULL;

ALTER TABLE rapports_mensuels ENABLE ROW LEVEL SECURITY;
-- Aucune politique : la table n'est lue que par le service. Le dirigeant n'a
-- rien à y voir — son rapport lui arrive par email.

-- =============================================================================
-- 1 bis. Le journal doit pouvoir nommer ce nouvel envoi
-- =============================================================================

-- Même raison qu'en 20260920 pour « notification » : la contrainte refuserait
-- l'écriture, et depuis 20260918 ce refus est silencieux.
ALTER TABLE journal_acces DROP CONSTRAINT IF EXISTS journal_acces_ressource_check;
ALTER TABLE journal_acces ADD CONSTRAINT journal_acces_ressource_check
  CHECK (ressource IN ('message', 'corps', 'annuaire', 'boite', 'analyse',
                       'abonnement', 'categorie', 'application', 'journal',
                       'notification', 'rapport'));

-- =============================================================================
-- 2. Le mois couvert
-- =============================================================================

-- ⚠ LES BORNES SONT CALCULÉES EN HEURE DE PARIS, PAS EN UTC. Le serveur tourne
--   en UTC : sans cette conversion, un rapport « de septembre » commencerait le
--   31 août à 22 h et s'arrêterait le 30 septembre à 22 h. Deux heures de
--   messages tomberaient dans le mauvais mois, tous les mois.
CREATE OR REPLACE FUNCTION public.mois_ecoule()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris'))
          - interval '1 month')::DATE;
$$;

CREATE OR REPLACE FUNCTION public.bornes_du_mois(p_mois DATE)
RETURNS TABLE (debut TIMESTAMPTZ, fin TIMESTAMPTZ)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (date_trunc('month', p_mois)::TIMESTAMP) AT TIME ZONE 'Europe/Paris',
         ((date_trunc('month', p_mois) + interval '1 month')::TIMESTAMP)
           AT TIME ZONE 'Europe/Paris';
$$;

-- =============================================================================
-- 3. Les chiffres d'un mois
-- =============================================================================

-- ⚠ `boites_surveillees` EST UN ÉTAT COURANT, PAS UN CHIFFRE HISTORIQUE, et le
--   rapport doit le dire. Rien en base ne conserve combien de boîtes étaient
--   abonnées le 12 septembre : `boites_surveillees` et `graph_abonnements`
--   portent un état, pas un journal. Le nombre rendu ici est donc celui
--   D'AUJOURD'HUI. C'est pour cette raison que le rapport ne compare PAS cet
--   indicateur d'un mois sur l'autre : la variation serait toujours nulle, et
--   la présenter comme une mesure serait un mensonge par omission.
--
-- ⚠ LES TYPES DE FRAUDE NE PARTITIONNENT PAS LES ALERTES. Un même message
--   compte dans « usurpation » ET dans « virement » s'il porte les deux
--   motifs — c'est le cas ordinaire d'une fraude au président. La somme des
--   types dépasse donc le nombre d'alertes, et l'email le dit.
--
-- ⚠ `expediteur_externe` N'EST DANS AUCUNE FAMILLE, VOLONTAIREMENT. C'est un
--   signal de contexte — le message vient de l'extérieur — pas un type de
--   fraude. Le ranger quelque part gonflerait un compteur sans rien apprendre.
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

  -- Les familles. Une raison peut appartenir à plusieurs — aucune n'y est
  -- aujourd'hui, mais rien ne l'interdit et le comptage le supporterait.
  v_usurpation TEXT[] := ARRAY[
    'usurpation_identite_annuaire', 'incoherence_nom_adresse',
    'domaine_typosquatte', 'marque_dans_domaine_tiers', 'domaine_grand_public'];
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

    -- ── Le mois couvert ──────────────────────────────────────────────────
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

    -- ── L'état courant de la surveillance ────────────────────────────────
    'boites_surveillees', (
      SELECT count(*) FROM boites_surveillees b
       WHERE b.company_id = p_company_id
         AND b.choisie AND b.actif
         -- Même définition que `estSurveillee` côté application : une boîte
         -- non abonnée ne reçoit rien, donc n'est pas surveillée.
         AND EXISTS (SELECT 1 FROM graph_abonnements g
                      WHERE g.boite_id = b.id AND g.statut = 'actif')),
    'employes', (
      SELECT count(*) FROM employees e WHERE e.company_id = p_company_id),

    -- ── Le mois précédent, pour l'évolution ──────────────────────────────
    'precedent', (
      SELECT CASE
        -- « Existe » veut dire : la société était déjà là et analysait. Sans
        -- cela, une première comparaison afficherait « +412 messages », ce qui
        -- n'est pas une progression mais un démarrage.
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

    -- ── Les types de fraude ──────────────────────────────────────────────
    'types', (
      SELECT jsonb_build_object(
               'usurpation',            count(*) FILTER (WHERE a.raisons ?| v_usurpation),
               'virement',              count(*) FILTER (WHERE a.raisons ?| v_virement),
               'coordonnees_bancaires', count(*) FILTER (WHERE a.raisons ?| v_bancaire),
               'urgence',               count(*) FILTER (WHERE a.raisons ?| v_urgence))
        FROM graph_analyses a
       WHERE a.company_id = p_company_id AND a.alerte
         AND a.analyse_at >= v_debut AND a.analyse_at < v_fin),

    -- ── Les boîtes les plus visées, trois au plus ────────────────────────
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
-- 4. Réclamer les rapports à envoyer
-- =============================================================================

-- ⚠ DEUX SOURCES, DANS CET ORDRE : les rapports déjà réclamés dont l'envoi a
--   raté, puis les nouveaux. Reprendre d'abord les ratés évite qu'un incident
--   Resend d'une heure ne laisse un client sans rapport jusqu'au mois suivant.
--
-- ⚠ LE DÉLAI DE GARDE N'EST PAS UN DÉTAIL. Sans lui, un envoi qui échoue
--   systématiquement serait retenté à chaque passage du worker — soixante fois
--   par heure, chez un prestataire qui facture à l'envoi et qui finit par
--   bloquer le domaine. Quinze minutes laissent le temps à une panne courte de
--   se résoudre sans transformer l'incident en rafale.
CREATE OR REPLACE FUNCTION public.reclamer_rapports_mensuels(
  p_limite INTEGER DEFAULT 10,
  p_mois DATE DEFAULT NULL,
  p_garde_minutes INTEGER DEFAULT 15
)
-- ⚠ LES PARAMÈTRES DE SORTIE NE S'APPELLENT PAS `company_id` NI `mois`, ET
--   C'EST OBLIGATOIRE ICI. Un paramètre de sortie est une variable PL/pgSQL :
--   `ON CONFLICT (company_id, mois)` ne peut pas être qualifié, et PostgreSQL
--   refuse alors la requête pour ambiguïté. Renommer était la seule issue
--   propre — `#variable_conflict use_column` aurait masqué le problème partout
--   dans le corps, y compris là où il serait un vrai défaut.
RETURNS TABLE (societe_id UUID, mois_couvert DATE, reprise BOOLEAN, donnees JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mois DATE := COALESCE(p_mois, mois_ecoule());
  v_limite INTEGER := GREATEST(1, LEAST(p_limite, 50));
  v_garde INTERVAL := make_interval(mins => GREATEST(1, p_garde_minutes));
  v_fin TIMESTAMPTZ;
BEGIN
  SELECT b.fin INTO v_fin FROM bornes_du_mois(v_mois) b;

  RETURN QUERY
  WITH
  -- (a) Les ratés à reprendre.
  reprises AS (
    UPDATE rapports_mensuels r
       SET reclame_at = now()
     WHERE r.id IN (
             SELECT r2.id FROM rapports_mensuels r2
              WHERE r2.mois = v_mois
                AND r2.envoye_at IS NULL
                AND r2.reclame_at < now() - v_garde
              ORDER BY r2.reclame_at
              LIMIT v_limite
              FOR UPDATE SKIP LOCKED)
    RETURNING r.company_id, r.mois, TRUE AS reprise
  ),
  -- (b) Les nouveaux.
  --
  -- ⚠ C'EST ICI QUE SE JOUE « UN SEUL PAR MOIS ». Le ON CONFLICT DO NOTHING
  --   ne rend RIEN pour une société déjà servie : deux workers simultanés se
  --   partagent le lot au lieu de le doubler.
  eligibles AS (
    SELECT c.id
      FROM companies c
     WHERE c.created_at < v_fin
       AND (
         -- Une surveillance en place aujourd'hui : le mois vide compte.
         EXISTS (SELECT 1 FROM boites_surveillees b
                  WHERE b.company_id = c.id AND b.choisie AND b.actif)
         -- Ou une activité pendant le mois, même si tout a été débranché
         -- depuis : le client a droit au compte rendu de ce qu'il a payé.
         OR EXISTS (SELECT 1 FROM graph_analyses a
                     WHERE a.company_id = c.id
                       AND a.analyse_at >= (SELECT debut FROM bornes_du_mois(v_mois))
                       AND a.analyse_at < v_fin)
       )
       AND NOT EXISTS (SELECT 1 FROM rapports_mensuels r
                        WHERE r.company_id = c.id AND r.mois = v_mois)
     ORDER BY c.id
     LIMIT v_limite
  ),
  nouveaux AS (
    INSERT INTO rapports_mensuels (company_id, mois)
    SELECT e.id, v_mois FROM eligibles e
    ON CONFLICT (company_id, mois) DO NOTHING
    RETURNING rapports_mensuels.company_id, rapports_mensuels.mois,
              FALSE AS reprise
  ),
  tous AS (
    SELECT * FROM reprises
    UNION ALL
    SELECT * FROM nouveaux
  )
  SELECT t.company_id, t.mois, t.reprise,
         donnees_rapport_mensuel(t.company_id, t.mois)
    FROM tous t
   LIMIT v_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamer_rapports_mensuels(INTEGER, DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamer_rapports_mensuels(INTEGER, DATE, INTEGER)
  TO service_role;

-- =============================================================================
-- 5. Marquer l'issue de l'envoi
-- =============================================================================

-- ⚠ UN ÉCHEC NE SUPPRIME PAS LA LIGNE. La garder avec `envoye_at IS NULL` sert
--   deux fois : elle est reprise après le délai de garde, et elle est ce que
--   le contrôle « rapport mensuel » compte pour passer au rouge. L'effacer
--   rendrait l'incident invisible — c'est précisément la faute que la
--   migration 20260918 a corrigée ailleurs.
CREATE OR REPLACE FUNCTION public.marquer_rapport_mensuel(
  p_company_id UUID,
  p_mois DATE,
  p_envoye BOOLEAN,
  p_destinataires INTEGER DEFAULT NULL,
  p_erreur TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE rapports_mensuels
     SET envoye_at = CASE WHEN p_envoye THEN now() ELSE NULL END,
         destinataires = COALESCE(p_destinataires, destinataires),
         erreur = CASE WHEN p_envoye THEN NULL ELSE left(p_erreur, 500) END
   WHERE company_id = p_company_id AND mois = p_mois;
$$;

REVOKE ALL ON FUNCTION public.marquer_rapport_mensuel(UUID, DATE, BOOLEAN, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_rapport_mensuel(UUID, DATE, BOOLEAN, INTEGER, TEXT)
  TO service_role;

-- =============================================================================
-- 6. Le contrôle : un rapport dû est-il parti ?
-- =============================================================================

-- Lecture seule. Rend de quoi allumer le voyant du worker sans rien consommer.
--
-- ⚠ « DUS » COMPTE AUSSI LES SOCIÉTÉS QUI N'ONT PAS ENCORE DE LIGNE. Ne
--   compter que les lignes en échec masquerait la panne la plus grave : celle
--   où la réclamation elle-même ne tourne plus, et où personne ne reçoit rien.
CREATE OR REPLACE FUNCTION public.etat_rapports_mensuels(p_mois DATE DEFAULT NULL)
RETURNS TABLE (
  mois DATE,
  eligibles BIGINT,
  envoyes BIGINT,
  en_echec BIGINT,
  jamais_reclames BIGINT,
  derniere_erreur TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mois DATE := COALESCE(p_mois, mois_ecoule());
  v_debut TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
BEGIN
  SELECT b.debut, b.fin INTO v_debut, v_fin FROM bornes_du_mois(v_mois) b;

  RETURN QUERY
  WITH eligibles AS (
    SELECT c.id
      FROM companies c
     WHERE c.created_at < v_fin
       AND (EXISTS (SELECT 1 FROM boites_surveillees b
                     WHERE b.company_id = c.id AND b.choisie AND b.actif)
            OR EXISTS (SELECT 1 FROM graph_analyses a
                        WHERE a.company_id = c.id
                          AND a.analyse_at >= v_debut AND a.analyse_at < v_fin))
  )
  SELECT v_mois,
         (SELECT count(*) FROM eligibles),
         (SELECT count(*) FROM rapports_mensuels r
           WHERE r.mois = v_mois AND r.envoye_at IS NOT NULL),
         (SELECT count(*) FROM rapports_mensuels r
           WHERE r.mois = v_mois AND r.envoye_at IS NULL),
         (SELECT count(*) FROM eligibles e
           WHERE NOT EXISTS (SELECT 1 FROM rapports_mensuels r
                              WHERE r.company_id = e.id AND r.mois = v_mois)),
         (SELECT r.erreur FROM rapports_mensuels r
           WHERE r.mois = v_mois AND r.erreur IS NOT NULL
           ORDER BY r.reclame_at DESC LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION public.etat_rapports_mensuels(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_rapports_mensuels(DATE) TO service_role;

-- =============================================================================
-- 7. Vérification
-- =============================================================================

-- 7.1 Table, contrainte d'unicité, contrainte du journal et cinq fonctions.
--     UNE SEULE REQUÊTE À COLLER APRÈS LA MIGRATION :
--
--   SELECT to_regclass('public.rapports_mensuels') IS NOT NULL       AS table_ok,
--          EXISTS (SELECT 1 FROM pg_constraint
--                   WHERE conrelid = 'rapports_mensuels'::regclass
--                     AND contype = 'u')                             AS unicite_ok,
--          (SELECT pg_get_constraintdef(oid) LIKE '%rapport%'
--             FROM pg_constraint
--            WHERE conname = 'journal_acces_ressource_check')         AS journal_ok,
--          (SELECT count(*) FROM pg_proc p
--             JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public'
--              AND p.proname IN ('mois_ecoule', 'bornes_du_mois',
--                                'donnees_rapport_mensuel',
--                                'reclamer_rapports_mensuels',
--                                'marquer_rapport_mensuel',
--                                'etat_rapports_mensuels'))           AS fonctions;
--
--   Attendu : table_ok = t, unicite_ok = t, journal_ok = t, fonctions = 6.
--
-- 7.2 Quel mois serait couvert aujourd'hui, et quelles bornes ?
--
--   SELECT mois_ecoule(), * FROM bornes_du_mois(mois_ecoule());
--
-- 7.3 À quoi ressemblerait le rapport d'une société ? SANS RIEN CONSOMMER :
--
--   SELECT jsonb_pretty(donnees_rapport_mensuel('<company_id>', mois_ecoule()));
--
--   `donnees_rapport_mensuel` est STABLE et ne réclame rien : on peut
--   l'appeler autant qu'on veut, y compris sur un mois déjà rapporté.
--
-- 7.4 Où en sont les rapports du mois ?
--
--   SELECT * FROM etat_rapports_mensuels();
--
--   `jamais_reclames` > 0 longtemps après le 1er, ou `en_echec` > 0 : l'envoi
--   ne passe pas. Le contrôle « rapport mensuel » de
--   POST /api/microsoft/worker?verifier=1 le dit aussi, en clair.
--
-- 7.5 Le détail, société par société :
--
--   SELECT c.nom, r.mois, r.reclame_at, r.envoye_at, r.destinataires, r.erreur
--     FROM rapports_mensuels r JOIN companies c ON c.id = r.company_id
--    ORDER BY r.mois DESC, c.nom;
--
-- 7.6 Ce qui a été envoyé, côté journal :
--
--   SELECT at, company_id, ressource_ref, resultat, volume
--     FROM journal_acces WHERE ressource = 'rapport'
--    ORDER BY at DESC LIMIT 20;
--
-- 7.7 ESSAYER SANS ENVOYER À UN CLIENT. Données factices, aucune écriture,
--     destinataire ALERTE_ESSAI_EMAIL (à défaut DEMO_NOTIFICATION_EMAIL) :
--
--   curl -X POST 'https://<site>/api/microsoft/worker?essai-rapport=1' \
--        -H 'x-safentreprise-worker: <WORKER_SECRET>'
--
-- 7.8 RENVOYER UN RAPPORT APRÈS CORRECTION D'UN INCIDENT. Effacer la ligne
--     remet la société dans la file au passage suivant du worker :
--
--   DELETE FROM rapports_mensuels
--    WHERE company_id = '<company_id>' AND mois = '2026-09-01';
