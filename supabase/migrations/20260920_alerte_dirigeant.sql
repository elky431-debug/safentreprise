-- Alerte par email au dirigeant, sur les seules tentatives de risque élevé
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : le dirigeant apprend aujourd'hui les tentatives en consultant son
-- tableau de bord. Personne ne le prévient. Cette migration donne à la
-- couche applicative de quoi le faire — sans qu'une rafale se transforme en
-- dix emails, et sans qu'une alerte soit perdue.
--
-- ⚠ NIVEAU ÉLEVÉ UNIQUEMENT, ET C'EST LE CŒUR DU DISPOSITIF. Une alerte qui
--   part trop souvent finit en règle de classement, et le jour où elle compte
--   vraiment, elle est déjà ignorée. Le filtre `niveau = 'eleve'` est ici une
--   décision de produit, pas une commodité : l'élargir viderait la
--   notification de son sens.
--
-- ⚠ APRÈS LA POSE DE LA BANNIÈRE, JAMAIS APRÈS L'ANALYSE. Si la bannière n'a
--   pas pu être posée, le dirigeant serait prévenu d'une protection qui n'a
--   pas fonctionné. D'où la condition `banniere_posee_at IS NOT NULL`.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LE MÉCANISME ANTI-RAFALE : premier immédiat, puis résumé différé.
--
--   • Une société dont la fenêtre de 60 minutes est FERMÉE est notifiée tout
--     de suite. C'est l'alerte qui a de la valeur : le produit promet de
--     prévenir avant que quelqu'un n'agisse.
--   • L'envoi rouvre la fenêtre. Les alertes qui tombent pendant qu'elle est
--     ouverte s'accumulent sans aucun envoi.
--   • À la réouverture — 60 minutes après le dernier envoi — s'il en reste :
--     UN seul email, qui les couvre toutes.
--
--   Plafond : un email par société et par heure, deux au plus dans l'heure
--   qui suit la première alerte. Aucune alerte perdue — ce qui écartait le
--   simple seuil horaire, qui aurait silencieusement jeté les alertes 2 à 10.
--
--   `notifiee_at` porte tout l'état : NULL = en attente, non NULL = déjà
--   rapportée, par l'email détaillé ou par un résumé. La fenêtre se déduit du
--   `max(notifiee_at)` de la société ; aucune table d'état à tenir à jour.
--
-- ⚠ LES DEUX FILES SONT DISJOINTES, ET C'EST CE QUI REND L'ORDRE DES APPELS
--   INDIFFÉRENT. `reclamer_notifications_alertes` ne prend que les sociétés
--   qui ont EXACTEMENT UNE alerte en attente ; `reclamer_resumes_alertes` ne
--   prend que celles qui en ont DEUX OU PLUS. Une version antérieure faisait
--   dépendre les deux du seul état de la fenêtre : le passage immédiat
--   marquait alors une alerte, rouvrait la fenêtre, et les six autres
--   attendaient une heure de plus au lieu de partir dans le résumé dû. Le
--   découpage par décompte supprime ce piège au lieu de le documenter.
--
--   Conséquence assumée : si plusieurs bannières sont posées dans la même
--   minute après une heure de silence, le dirigeant reçoit un résumé
--   immédiat plutôt qu'un email détaillé. Il est prévenu aussi vite, en une
--   seule fois, et le détail complet l'attend dans /menaces.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. L'état de notification
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS notifiee_at TIMESTAMPTZ;

COMMENT ON COLUMN graph_analyses.notifiee_at IS
  'Quand cette alerte a été rapportée au dirigeant par email, immédiatement ou dans un résumé. NULL = en attente. Sert aussi à délimiter la fenêtre anti-rafale.';

-- Index partiel : la file des alertes à notifier est un sous-ensemble minuscule
-- de la table. Sans le partiel, l'index grossirait avec tout le trafic analysé.
CREATE INDEX IF NOT EXISTS idx_analyses_a_notifier
  ON graph_analyses(company_id, banniere_posee_at)
  WHERE alerte AND niveau = 'eleve' AND notifiee_at IS NULL;

-- =============================================================================
-- 1 bis. Le journal doit pouvoir nommer ce nouvel accès
-- =============================================================================

-- ⚠ SANS CETTE LIGNE, L'ENVOI NE SERAIT PAS TRAÇABLE. `journal_acces.ressource`
--   n'accepte qu'une liste fermée de valeurs ; « notification » n'y figurait
--   pas, et la contrainte aurait refusé chaque écriture. Depuis la migration
--   20260918 ce refus est silencieux — il n'aurait cassé aucun envoi, il
--   aurait simplement rendu invisible le seul flux de ce produit qui sorte de
--   l'Union européenne. C'est exactement l'inverse de ce qu'on veut.
ALTER TABLE journal_acces DROP CONSTRAINT IF EXISTS journal_acces_ressource_check;
ALTER TABLE journal_acces ADD CONSTRAINT journal_acces_ressource_check
  CHECK (ressource IN ('message', 'corps', 'annuaire', 'boite', 'analyse',
                       'abonnement', 'categorie', 'application', 'journal',
                       'notification'));

-- =============================================================================
-- 2. À qui écrire
-- =============================================================================

-- ⚠ ELLE RENVOIE UN ENSEMBLE, PAS UNE VALEUR, ET C'EST DÉLIBÉRÉ. Aujourd'hui
--   le seul destinataire est le dirigeant titulaire du compte. Le jour où une
--   société voudra plusieurs destinataires, c'est CETTE fonction qui changera
--   — l'appelant, lui, itère déjà sur un ensemble. Aucune interface n'est
--   construite pour autant : la provision est dans la forme, pas dans l'écran.
--
-- ⚠ ELLE LIT `auth.users`, CE QUE SEUL LE PROPRIÉTAIRE PEUT FAIRE. D'où le
--   SECURITY DEFINER, et le retrait des droits pour anon et authenticated :
--   un client ne doit pas pouvoir énumérer les adresses d'un autre.
CREATE OR REPLACE FUNCTION public.destinataires_alerte(p_company_id UUID)
RETURNS TABLE (email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email::TEXT
    FROM companies c
    JOIN auth.users u ON u.id = c.user_id
   WHERE c.id = p_company_id
     AND u.email IS NOT NULL
     AND btrim(u.email) <> '';
$$;

REVOKE ALL ON FUNCTION public.destinataires_alerte(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.destinataires_alerte(UUID) TO service_role;

-- =============================================================================
-- 3. Réclamer les alertes à envoyer maintenant
-- =============================================================================

-- ⚠ RÉCLAMATION ATOMIQUE, COMME `reclamer_travaux_graph`. Le worker tourne
--   toutes les minutes et rien n'interdit deux passages simultanés. Sans
--   `FOR UPDATE SKIP LOCKED` et sans marquage dans la même transaction, deux
--   passages enverraient le même email deux fois — le défaut le plus visible
--   pour le dirigeant, et le plus difficile à reproduire ensuite.
--
-- ⚠ SEULEMENT LES SOCIÉTÉS QUI N'ONT QU'UNE ALERTE EN ATTENTE. Deux ou plus,
--   et c'est `reclamer_resumes_alertes` qui les prend, en un seul email. Voir
--   la note sur les files disjointes en tête de fichier.
CREATE OR REPLACE FUNCTION public.reclamer_notifications_alertes(
  p_fenetre_minutes INTEGER DEFAULT 60,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
  message_id TEXT,
  company_id UUID,
  boite TEXT,
  expediteur_nom TEXT,
  expediteur_email TEXT,
  nom_signe TEXT,
  employe_email TEXT,
  recu_at TIMESTAMPTZ,
  analyse_at TIMESTAMPTZ,
  niveau TEXT,
  score INTEGER,
  signaux JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fenetre INTERVAL := make_interval(mins => GREATEST(1, p_fenetre_minutes));
BEGIN
  RETURN QUERY
  WITH en_attente AS (
    SELECT a.id, a.company_id
      FROM graph_analyses a
      JOIN boites_surveillees b ON b.id = a.boite_id
     WHERE a.alerte
       AND a.niveau = 'eleve'
       AND a.notifiee_at IS NULL
       -- La bannière a été posée ET n'a pas été retirée depuis.
       AND a.banniere_posee_at IS NOT NULL
       AND a.restauree_at IS NULL
       AND b.actif
       -- Aucune notification récente pour cette société : la fenêtre est
       -- fermée, celle-ci en ouvre une nouvelle.
       AND NOT EXISTS (
         SELECT 1 FROM graph_analyses r
          WHERE r.company_id = a.company_id
            AND r.notifiee_at > now() - v_fenetre
       )
  ),
  -- ⚠ `e.company_id` EST QUALIFIÉ PARTOUT, ET IL DOIT L'ÊTRE : `company_id`
  --   est aussi un paramètre de sortie de la fonction, donc une variable
  --   PL/pgSQL. Non qualifié, PostgreSQL refuse la requête pour ambiguïté.
  seules AS (
    SELECT e.company_id
      FROM en_attente e
     GROUP BY e.company_id
    HAVING count(*) = 1
     LIMIT GREATEST(1, LEAST(p_limite, 50))
  ),
  verrouillees AS (
    SELECT a.id
      FROM graph_analyses a
      JOIN en_attente e ON e.id = a.id
      JOIN seules s ON s.company_id = e.company_id
       FOR UPDATE OF a SKIP LOCKED
  ),
  marquees AS (
    UPDATE graph_analyses a
       SET notifiee_at = now()
      FROM verrouillees v
     WHERE a.id = v.id
       -- Garde-fou : si un passage concurrent a marqué la ligne entre-temps,
       -- READ COMMITTED réévalue cette clause sur la version à jour et la
       -- ligne sort. Sans elle, deux workers enverraient le même email.
       AND a.notifiee_at IS NULL
    RETURNING a.*
  )
  SELECT m.message_id, m.company_id, b.upn,
         m.expediteur_nom, m.expediteur_email, m.nom_signe,
         m.employe_email, m.recu_at, m.analyse_at,
         m.niveau, m.score, m.signaux
    FROM marquees m
    JOIN boites_surveillees b ON b.id = m.boite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamer_notifications_alertes(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamer_notifications_alertes(INTEGER, INTEGER)
  TO service_role;

-- =============================================================================
-- 4. Réclamer les résumés de fenêtre close
-- =============================================================================

-- Les sociétés dont la fenêtre est fermée ET qui ont DEUX alertes en attente
-- ou plus. Tout est marqué d'un coup : le résumé les couvre toutes.
--
-- ⚠ LE RÉSUMÉ NE REND PAS LES SIGNAUX, SEULEMENT LE DÉCOMPTE ET L'ESSENTIEL.
--   Un email de résumé qui déroule sept fois cinq motifs n'est plus un résumé.
--   Le détail complet reste dans /menaces, vers quoi l'email renvoie.
--
-- ⚠ `lignes` EST PLAFONNÉE, `nombre` NE L'EST PAS. Une société réellement
--   prise pour cible peut accumuler des dizaines d'alertes en une heure ;
--   l'email en détaille les vingt plus récentes et annonce le total exact.
--   Mentir sur le total serait le seul vrai défaut ici.
CREATE OR REPLACE FUNCTION public.reclamer_resumes_alertes(
  p_fenetre_minutes INTEGER DEFAULT 60,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
  company_id UUID,
  nombre INTEGER,
  depuis TIMESTAMPTZ,
  lignes JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fenetre INTERVAL := make_interval(mins => GREATEST(1, p_fenetre_minutes));
BEGIN
  RETURN QUERY
  WITH en_attente AS (
    SELECT a.id, a.company_id
      FROM graph_analyses a
      JOIN boites_surveillees b ON b.id = a.boite_id
     WHERE a.alerte AND a.niveau = 'eleve'
       AND a.notifiee_at IS NULL
       AND a.banniere_posee_at IS NOT NULL
       AND a.restauree_at IS NULL
       AND b.actif
       AND NOT EXISTS (
         SELECT 1 FROM graph_analyses r
          WHERE r.company_id = a.company_id
            AND r.notifiee_at > now() - v_fenetre
       )
  ),
  -- Qualification obligatoire : voir la note dans
  -- `reclamer_notifications_alertes`.
  societes AS (
    SELECT e.company_id
      FROM en_attente e
     GROUP BY e.company_id
    HAVING count(*) > 1
     LIMIT GREATEST(1, LEAST(p_limite, 50))
  ),
  verrouillees AS (
    SELECT a.id
      FROM graph_analyses a
      JOIN en_attente e ON e.id = a.id
      JOIN societes s ON s.company_id = e.company_id
       FOR UPDATE OF a SKIP LOCKED
  ),
  marquees AS (
    UPDATE graph_analyses a
       SET notifiee_at = now()
      FROM verrouillees v
     WHERE a.id = v.id
       AND a.notifiee_at IS NULL
    RETURNING a.*
  ),
  detail AS (
    SELECT m.company_id, m.analyse_at, b.upn,
           m.expediteur_nom, m.expediteur_email, m.score,
           row_number() OVER (
             PARTITION BY m.company_id ORDER BY m.analyse_at DESC
           ) AS rang
      FROM marquees m
      JOIN boites_surveillees b ON b.id = m.boite_id
  )
  SELECT d.company_id,
         count(*)::INTEGER,
         min(d.analyse_at),
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'analyse_at', d.analyse_at,
               'boite', d.upn,
               'expediteur_nom', d.expediteur_nom,
               'expediteur_email', d.expediteur_email,
               'score', d.score
             ) ORDER BY d.analyse_at
           ) FILTER (WHERE d.rang <= 20),
           '[]'::JSONB
         )
    FROM detail d
   GROUP BY d.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamer_resumes_alertes(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamer_resumes_alertes(INTEGER, INTEGER)
  TO service_role;

-- =============================================================================
-- 5. Rendre une alerte à la file
-- =============================================================================

-- ⚠ APPELÉE QUAND L'ENVOI A ÉCHOUÉ. Sans elle, une panne de Resend
--   consommerait la notification : l'alerte serait marquée comme rapportée
--   alors que personne n'a rien reçu. On la remet en attente pour le passage
--   suivant.
CREATE OR REPLACE FUNCTION public.rendre_notification_alerte(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET notifiee_at = NULL
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

REVOKE ALL ON FUNCTION public.rendre_notification_alerte(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rendre_notification_alerte(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- 6.1 Colonne, index, contrainte du journal et quatre fonctions en place.
--     UNE SEULE REQUÊTE À COLLER APRÈS LA MIGRATION :
--
--   SELECT to_regclass('public.idx_analyses_a_notifier') IS NOT NULL AS index_ok,
--          EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name = 'graph_analyses'
--                     AND column_name = 'notifiee_at')             AS colonne_ok,
--          (SELECT pg_get_constraintdef(oid) LIKE '%notification%'
--             FROM pg_constraint
--            WHERE conname = 'journal_acces_ressource_check')      AS journal_ok,
--          (SELECT count(*) FROM pg_proc p
--             JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public'
--              AND p.proname IN ('destinataires_alerte',
--                                'reclamer_notifications_alertes',
--                                'reclamer_resumes_alertes',
--                                'rendre_notification_alerte'))    AS fonctions;
--
--   Attendu : index_ok = t, colonne_ok = t, journal_ok = t, fonctions = 4.
--
-- 6.2 À qui écrirait-on ? Une ligne par société, l'adresse du dirigeant.
--
--   SELECT c.nom, d.email
--     FROM companies c, LATERAL destinataires_alerte(c.id) d;
--
--   Une société qui n'apparaît pas ici ne recevra RIEN : son compte n'a pas
--   d'adresse exploitable, et l'alerte sera rendue à la file indéfiniment.
--
-- 6.3 Qu'y a-t-il à envoyer ? ⚠ NE PAS APPELER LES FONCTIONS `reclamer_…`
--     POUR REGARDER : elles MARQUENT ce qu'elles rendent, et l'alerte ne
--     repartira jamais. Lire la file directement, c'est sans effet :
--
--   SELECT company_id,
--          count(*)                                      AS en_attente,
--          count(*) = 1 AS partirait_en_alerte_detaillee,
--          count(*) > 1 AS partirait_en_resume,
--          min(analyse_at)                               AS plus_ancienne
--     FROM graph_analyses
--    WHERE alerte AND niveau = 'eleve' AND notifiee_at IS NULL
--      AND banniere_posee_at IS NOT NULL AND restauree_at IS NULL
--    GROUP BY company_id;
--
-- 6.4 Où en est la fenêtre d'une société ?
--
--   SELECT max(notifiee_at)                                   AS dernier_envoi,
--          max(notifiee_at) > now() - interval '60 minutes'   AS fenetre_ouverte
--     FROM graph_analyses WHERE company_id = '<company_id>';
--
--   Fenêtre ouverte : les alertes en attente patientent, c'est normal.
--   Fenêtre fermée avec des alertes en attente depuis plus d'une heure :
--   l'envoi ne passe pas. Le contrôle « alertes dirigeant en attente » de
--   POST /api/microsoft/worker?verifier=1 le dit aussi.
--
-- 6.5 Ce qui a été envoyé, et à combien de personnes :
--
--   SELECT at, company_id, ressource_ref, resultat, volume
--     FROM journal_acces WHERE ressource = 'notification'
--    ORDER BY at DESC LIMIT 20;
--
-- 6.6 ESSAYER SANS PROVOQUER DE VRAIE ALERTE. Ne lit rien, n'écrit rien,
--     n'écrit pas au dirigeant d'un client — le destinataire est
--     ALERTE_ESSAI_EMAIL, à défaut DEMO_NOTIFICATION_EMAIL :
--
--   curl -X POST 'https://<site>/api/microsoft/worker?essai-alerte=1' \
--        -H 'x-safentreprise-worker: <WORKER_SECRET>'
