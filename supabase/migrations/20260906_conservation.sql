-- Conservation des données, et sortie du contenu client hors du mail d'alerte
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- Deux sujets, tous deux issus du relevé fait avant la réécriture de la
-- politique de confidentialité.
--
-- 1. LE MAIL DE VEILLE EMPORTAIT DU CONTENU CLIENT. Il nommait l'expéditeur et
--    l'objet des messages signalés, et l'adresse des boîtes surveillées. Ces
--    données partaient chez Resend, aux États-Unis, vers une boîte de
--    Safentreprise — donc hors de l'entreprise cliente qui en est responsable.
--    Le mail ne transporte plus que des compteurs et des motifs.
--
-- 2. TROIS TABLES GRANDISSAIENT SANS FIN. graph_analyses conservait
--    indéfiniment une ligne PAR MESSAGE ANALYSÉ — pas seulement par alerte —
--    avec l'objet, l'expéditeur et le destinataire. graph_file_attente et
--    net._http_response n'étaient jamais purgées non plus.
--
-- Ce qui N'EST PAS fait ici, et pourquoi : voir la section 6.

-- =============================================================================
-- 1. Le mail de veille ne transporte plus que des compteurs
-- =============================================================================

-- problemes_de_veille() reste détaillée : elle ne sort jamais de la base, on
-- la consulte au SQL Editor. C'est preparer_veille() qui agrège, parce que
-- c'est SON résultat qui part dans le mail.
--
-- L'empreinte, elle, reste calculée sur l'identité fine de chaque ligne : on
-- veut toujours distinguer « le même problème » de « un problème de plus »,
-- et cette empreinte ne quitte pas la base.
CREATE OR REPLACE FUNCTION public.preparer_veille(
  p_age_minutes INTEGER DEFAULT 120
)
RETURNS TABLE (
  probleme BOOLEAN,
  envoyer BOOLEAN,
  motif_envoi TEXT,
  empreinte TEXT,
  empreinte_precedente TEXT,
  lignes JSONB,
  nb_total INTEGER,
  nb_alertes INTEGER,
  nb_abonnements INTEGER,
  envois INTEGER,
  premier_vu_at TIMESTAMPTZ,
  dernier_envoi_at TIMESTAMPTZ,
  echecs_consecutifs INTEGER,
  premier_echec_at TIMESTAMPTZ,
  derniere_erreur TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etat veille_etat%ROWTYPE;
  v_lignes JSONB;
  v_empreinte TEXT;
  v_alertes INTEGER;
  v_abonnements INTEGER;
  v_total INTEGER;
  v_probleme BOOLEAN;
  v_envoyer BOOLEAN := FALSE;
  v_motif TEXT := 'rien à signaler';
  v_delai INTERVAL;
BEGIN
  SELECT * INTO v_etat FROM veille_etat WHERE cle = 'quotidienne' FOR UPDATE;

  WITH p AS (
    SELECT * FROM problemes_de_veille(p_age_minutes)
  ),
  groupes AS (
    SELECT p.source, p.motif, count(*)::INTEGER AS nombre
      FROM p GROUP BY p.source, p.motif
  )
  SELECT
    -- CE QUI PART DANS LE MAIL : la source, le motif, le nombre. Rien qui
    -- désigne un message, une personne ou une boîte.
    (SELECT COALESCE(jsonb_agg(
       jsonb_build_object('source', g.source, 'motif', g.motif, 'nombre', g.nombre)
       ORDER BY g.source, g.motif), '[]'::jsonb) FROM groupes g),
    (SELECT count(*)::INTEGER FROM p WHERE p.source = 'alerte sans bannière'),
    (SELECT count(*)::INTEGER FROM p WHERE p.source = 'abonnement Graph'),
    (SELECT count(*)::INTEGER FROM p),
    -- CE QUI RESTE EN BASE : l'empreinte fine, pour la relance espacée.
    (SELECT md5(COALESCE(string_agg(p.cle_empreinte, '|' ORDER BY p.cle_empreinte), ''))
       FROM p)
  INTO v_lignes, v_alertes, v_abonnements, v_total, v_empreinte;

  v_probleme := v_total > 0;

  IF NOT v_probleme THEN
    v_motif := 'rien à signaler';
    UPDATE veille_etat
       SET empreinte = NULL, premier_vu_at = NULL, envois = 0,
           echecs_consecutifs = 0, premier_echec_at = NULL, derniere_erreur = NULL,
           dernier_controle_at = now(), maj_at = now()
     WHERE cle = 'quotidienne';

  ELSE
    IF v_etat.empreinte IS DISTINCT FROM v_empreinte THEN
      v_envoyer := TRUE;
      v_motif := CASE WHEN v_etat.empreinte IS NULL
                      THEN 'nouveau problème'
                      ELSE 'le problème a changé' END;
      UPDATE veille_etat
         SET empreinte = v_empreinte, premier_vu_at = now(), envois = 0,
             echecs_consecutifs = 0, premier_echec_at = NULL, derniere_erreur = NULL,
             dernier_controle_at = now(), maj_at = now()
       WHERE cle = 'quotidienne';
      v_etat.premier_vu_at := now();
      v_etat.envois := 0;
      v_etat.echecs_consecutifs := 0;
      v_etat.premier_echec_at := NULL;
      v_etat.derniere_erreur := NULL;

    ELSIF v_etat.echecs_consecutifs > 0 OR v_etat.dernier_envoi_at IS NULL THEN
      v_envoyer := TRUE;
      v_motif := CASE WHEN v_etat.echecs_consecutifs > 0
                      THEN 'reprise après ' || v_etat.echecs_consecutifs || ' échec(s) d''envoi'
                      ELSE 'jamais envoyé' END;
      UPDATE veille_etat SET dernier_controle_at = now(), maj_at = now()
       WHERE cle = 'quotidienne';

    ELSE
      v_delai := CASE v_etat.envois
                   WHEN 1 THEN INTERVAL '3 days'
                   WHEN 2 THEN INTERVAL '7 days'
                   ELSE INTERVAL '14 days'
                 END;
      v_envoyer := now() - v_etat.dernier_envoi_at >= v_delai;
      v_motif := CASE WHEN v_envoyer
                      THEN 'relance (' || (v_etat.envois + 1) || 'ᵉ envoi, problème vu depuis ' ||
                           age(now(), v_etat.premier_vu_at) || ')'
                      ELSE 'déjà signalé, prochaine relance dans ' ||
                           age(v_etat.dernier_envoi_at + v_delai, now()) END;
      UPDATE veille_etat SET dernier_controle_at = now(), maj_at = now()
       WHERE cle = 'quotidienne';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_probleme, v_envoyer, v_motif, v_empreinte, v_etat.empreinte,
    v_lignes, v_total, v_alertes, v_abonnements,
    v_etat.envois, v_etat.premier_vu_at, v_etat.dernier_envoi_at,
    v_etat.echecs_consecutifs, v_etat.premier_echec_at, v_etat.derniere_erreur;
END;
$$;

REVOKE ALL ON FUNCTION public.preparer_veille(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparer_veille(INTEGER) TO service_role;

-- =============================================================================
-- 2. Purge des analyses
-- =============================================================================

-- DEUX DURÉES, PARCE QUE LES LIGNES N'ONT PAS LA MÊME VALEUR.
--
--   • Une ALERTE : 12 mois. C'est la durée déjà publiée dans la politique de
--     confidentialité pour les alertes de l'extension, et déjà appliquée à
--     menaces_detectees. Tenir deux promesses différentes pour la même chose
--     serait indéfendable. Douze mois laissent aussi de quoi montrer au client
--     l'historique d'une fraude sur un exercice comptable.
--
--   • Une ANALYSE SANS ALERTE : 30 jours. Elle dit « ce message a été regardé,
--     il allait bien ». Passé un mois, elle ne sert plus qu'à savoir que le
--     système tournait — et c'est très cher payé : cette ligne porte l'objet
--     du message, l'expéditeur et le destinataire, pour un message dont on a
--     conclu qu'il n'avait rien.
--
-- CE QU'ON PERD :
--   – la preuve, au-delà de 30 jours, qu'un message anodin donné a bien été
--     analysé. Si un client conteste « vous n'avez pas vu passer ce mail »,
--     au-delà d'un mois on ne pourra plus le prouver message par message ;
--   – les statistiques de volume au-delà de 30 jours (nombre de messages
--     analysés par mois). Si vous voulez les garder, il faut un compteur
--     agrégé sans données personnelles — dites-le, c'est une autre migration ;
--   – au-delà de 12 mois, l'historique des fraudes détectées.
--
-- CE QU'ON NE PERD PAS : rien d'opérationnel. Toutes les fonctions de reprise
-- (alertes_a_bannieriser, bannieres_a_convertir, alertes_sans_banniere)
-- filtrent sur a.alerte, et aucune bannière n'est jamais posée sur un message
-- sans alerte — agir() sort immédiatement quand le verdict n'est pas une
-- alerte (worker/route.ts).
CREATE OR REPLACE FUNCTION public.purger_analyses_graph()
RETURNS TABLE (alertes_supprimees INTEGER, analyses_supprimees INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alertes INTEGER;
  v_analyses INTEGER;
BEGIN
  -- ⚠ GARDE-FOU ABSOLU, quelle que soit l'ancienneté : on ne supprime JAMAIS
  --   la ligne d'un message qui porte encore une bannière non retirée. C'est
  --   la seule trace d'une modification irréversible faite dans la boîte d'un
  --   client. La supprimer rendrait la bannière orpheline : plus rien en base
  --   ne dirait qu'elle est là, ni ne permettrait de la défaire.
  --
  -- ⚠ Même chose si un corps d'origine est encore conservé : la paire doit
  --   disparaître ensemble, jamais l'une avant l'autre.

  DELETE FROM graph_analyses a
   WHERE a.alerte
     AND a.analyse_at < now() - INTERVAL '12 months'
     AND NOT (a.banniere_posee_at IS NOT NULL AND a.restauree_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM graph_corps_originaux c
        WHERE c.company_id = a.company_id AND c.message_id = a.message_id
     );
  GET DIAGNOSTICS v_alertes = ROW_COUNT;

  DELETE FROM graph_analyses a
   WHERE NOT a.alerte
     AND a.analyse_at < now() - INTERVAL '30 days'
     AND NOT (a.banniere_posee_at IS NOT NULL AND a.restauree_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM graph_corps_originaux c
        WHERE c.company_id = a.company_id AND c.message_id = a.message_id
     );
  GET DIAGNOSTICS v_analyses = ROW_COUNT;

  RAISE LOG 'purger_analyses_graph : % alerte(s), % analyse(s) supprimées',
    v_alertes, v_analyses;

  RETURN QUERY SELECT v_alertes, v_analyses;
END;
$$;

COMMENT ON FUNCTION public.purger_analyses_graph() IS
  'Alertes 12 mois, analyses sans alerte 30 jours. Ne touche jamais un message portant encore une bannière.';

-- Sans cet index la purge balaye toute la table chaque nuit.
CREATE INDEX IF NOT EXISTS idx_analyses_purge
  ON graph_analyses(analyse_at) WHERE banniere_posee_at IS NULL;

-- =============================================================================
-- 3. Purge de la file d'attente
-- =============================================================================

-- La file est un tampon de travail, pas un journal. Une fois le message
-- traité, sa ligne ne sert plus à rien : le verdict est dans graph_analyses.
--
-- Deux durées :
--   • traité ou ignoré → 7 jours, le temps de comprendre un incident récent ;
--   • en échec → 30 jours, parce qu'un échec mérite d'être vu avant d'être
--     effacé ;
--   • en attente → JAMAIS. C'est du travail non fait ; le purger reviendrait
--     à perdre silencieusement des messages à analyser.
CREATE OR REPLACE FUNCTION public.purger_file_graph()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_supprimes INTEGER;
BEGIN
  DELETE FROM graph_file_attente
   WHERE (statut IN ('traite', 'ignore') AND recu_at < now() - INTERVAL '7 days')
      OR (statut = 'echec' AND recu_at < now() - INTERVAL '30 days');
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;
  RAISE LOG 'purger_file_graph : % ligne(s) supprimée(s)', v_supprimes;
  RETURN v_supprimes;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_file_purge ON graph_file_attente(recu_at);

-- =============================================================================
-- 4. Purge des réponses HTTP de pg_net
-- =============================================================================

-- net._http_response garde le CORPS des réponses aux appels internes. Les
-- réponses de la maintenance contiennent l'adresse des boîtes surveillées
-- (upn) et des identifiants de messages tronqués. C'est du journal technique :
-- utile quelques jours pour diagnostiquer, sans valeur ensuite.
--
-- pg_net purge de lui-même sur les versions récentes, mais pas sur toutes, et
-- la migration 20260830 le documentait comme une croissance sans fin à traiter
-- à la main. On ne s'en remet pas au hasard de la version.
CREATE OR REPLACE FUNCTION public.purger_reponses_http()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE v_supprimes INTEGER := 0;
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RAISE WARNING 'purger_reponses_http : pg_net absent, rien à faire';
    RETURN 0;
  END IF;

  EXECUTE 'DELETE FROM net._http_response WHERE created < now() - INTERVAL ''7 days''';
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;
  RAISE LOG 'purger_reponses_http : % réponse(s) supprimée(s)', v_supprimes;
  RETURN v_supprimes;
END;
$$;

-- =============================================================================
-- 5. Droits et planification
-- =============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'purger_analyses_graph()', 'purger_file_graph()', 'purger_reponses_http()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

-- Les purges s'enchaînent la nuit, espacées, après celles qui existent déjà :
--   03:15 corps d'origine (20260902)
--   03:30 menaces de l'extension (20260821)
--   03:45 analyses          ← ici
--   03:50 file d'attente    ← ici
--   03:55 réponses HTTP     ← ici
DO $$
DECLARE t TEXT; j TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron absent : les purges doivent être planifiées à la main.';
    RETURN;
  END IF;

  FOREACH j IN ARRAY ARRAY['purge-analyses', 'purge-file-graph', 'purge-reponses-http'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;

  PERFORM cron.schedule('purge-analyses', '45 3 * * *',
    $c$ SELECT public.purger_analyses_graph(); $c$);
  PERFORM cron.schedule('purge-file-graph', '50 3 * * *',
    $c$ SELECT public.purger_file_graph(); $c$);
  PERFORM cron.schedule('purge-reponses-http', '55 3 * * *',
    $c$ SELECT public.purger_reponses_http(); $c$);
END $$;

-- =============================================================================
-- 6. CE QUI N'EST PAS FAIT ICI, ET POURQUOI
-- =============================================================================

-- LES TROIS TABLES DU PRODUIT CHROME NE SONT PAS SUPPRIMÉES : du code vivant
-- les lit encore, la condition posée n'est donc pas remplie.
--
--   menaces_detectees      lue par src/app/(protected)/menaces/page.tsx:42
--                          et src/app/(protected)/dashboard/page.tsx:62
--   activations_extension  lue par dashboard/page.tsx:71, ÉCRITE par
--                          src/app/api/extension/verifier-code/route.ts
--   score_history          rien à voir avec l'extension : c'est le score de
--                          risque, ÉCRIT par RiskStep.tsx:67,
--                          risk-dynamique.ts:246 et api/risk/snapshot-from-token
--
-- Les supprimer casserait le tableau de bord et l'onboarding. L'ordre correct
-- est : retirer les écrans, puis les tables. menaces_detectees a déjà sa purge
-- à 12 mois ; activations_extension n'en a pas, mais sa colonne last_seen_at
-- n'est plus mise à jour depuis l'abandon de l'extension — une purge sur
-- l'inactivité les effacerait donc toutes d'un coup, et le compteur de postes
-- du tableau de bord tomberait à zéro sans explication.

-- =============================================================================
-- 7. Vérification
-- =============================================================================

--   SELECT * FROM purger_analyses_graph();
--   SELECT purger_file_graph();
--   SELECT purger_reponses_http();
--
-- Ce qui reste, et depuis quand :
--
--   SELECT alerte, count(*), min(analyse_at) AS plus_ancienne
--     FROM graph_analyses GROUP BY alerte;
--   SELECT statut, count(*), min(recu_at) FROM graph_file_attente GROUP BY statut;
--
-- Les purges planifiées :
--
--   SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'purge-%'
--    ORDER BY schedule;
