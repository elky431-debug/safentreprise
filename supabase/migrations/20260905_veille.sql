-- La veille : le système prévient, au lieu d'être surveillé
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- Deux vues de contrôle existent — alertes_sans_banniere et
-- abonnements_en_alerte — et toutes deux doivent rester vides. Les consulter
-- à la main chaque matin ne tient pas : le jour où on oublie, la panne passe.
--
-- CE QUE FAIT CETTE MIGRATION. Une tâche planifiée interroge les deux vues.
-- Si l'une renvoie des lignes, un mail part avec le problème écrit en clair.
-- Si les deux sont vides, rien ne part.
--
-- TROIS PIÈGES, traités ici plutôt que découverts en production :
--
--   1. LE BRUIT. alertes_sans_banniere n'a aucun garde-fou de délai : un
--      message analysé il y a trente secondes, dont la bannière est en cours
--      de pose, y figure déjà. Alerter là-dessus reviendrait à signaler le
--      fonctionnement normal. D'où p_age_minutes.
--
--   2. LA RÉPÉTITION. Un problème non traité ne doit pas produire un mail par
--      jour — on cesserait de les lire. Relance espacée : à la découverte,
--      puis 3 jours, puis 7, puis tous les 14. Un problème DIFFÉRENT repart
--      immédiatement.
--
--   3. LE SILENCE. Si l'envoi échoue, l'absence de mail ressemble à « tout va
--      bien ». L'échec est donc enregistré, réessayé à chaque passage sans
--      attendre la relance, et un second chemin — indépendant de l'app —
--      prend le relais au bout de trois échecs.

-- =============================================================================
-- 1. L'état de la veille
-- =============================================================================

CREATE TABLE IF NOT EXISTS veille_etat (
  cle TEXT PRIMARY KEY,
  -- Signature du problème constaté. Volontairement construite sur l'IDENTITÉ
  -- des lignes, jamais sur leur motif : les motifs contiennent des durées
  -- (« expire dans 1 day 05:59 ») qui changent à chaque seconde et feraient
  -- repartir un mail à chaque passage.
  empreinte TEXT,
  premier_vu_at TIMESTAMPTZ,
  dernier_envoi_at TIMESTAMPTZ,
  envois INTEGER NOT NULL DEFAULT 0,
  echecs_consecutifs INTEGER NOT NULL DEFAULT 0,
  premier_echec_at TIMESTAMPTZ,
  derniere_erreur TEXT,
  -- Preuve que la veille a tourné. C'est ce qui permet de distinguer
  -- « rien à signaler » de « plus personne ne regarde ».
  dernier_controle_at TIMESTAMPTZ,
  secours_envoye_at TIMESTAMPTZ,
  maj_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE veille_etat ENABLE ROW LEVEL SECURITY;
-- Aucune politique : aucune ligne visible, pour personne. Seuls le
-- propriétaire et les rôles qui contournent la RLS y accèdent.
REVOKE ALL ON TABLE veille_etat FROM PUBLIC, anon, authenticated;

INSERT INTO veille_etat (cle) VALUES ('quotidienne')
ON CONFLICT (cle) DO NOTHING;

-- =============================================================================
-- 2. Ce qui ne va pas, en clair
-- =============================================================================

-- Une seule liste, les deux vues confondues, chaque ligne portant sa phrase.
-- p_age_minutes écarte les alertes trop récentes pour être un problème : la
-- maintenance passe toutes les 10 minutes, deux heures de battement laissent
-- largement le temps à une bannière de se poser.
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
         -- Identité stable : le message et la raison. Le nombre de tentatives
         -- en est exclu, sinon chaque échec relancerait un mail.
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
         -- Le statut suffit, plus le franchissement du plafond : on veut être
         -- prévenu quand un abonnement passe « en erreur », puis quand il est
         -- abandonné, mais pas à chacune des dix tentatives intermédiaires.
         b.subscription_id || '/' || b.statut || '/' ||
           (b.tentatives_renouvellement >= 10)::TEXT,
         'Boîte ' || b.upn,
         b.motif,
         b.expire_at
    FROM abonnements_en_alerte b;
$$;

REVOKE ALL ON FUNCTION public.problemes_de_veille(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.problemes_de_veille(INTEGER) TO service_role;

-- =============================================================================
-- 3. Faut-il envoyer, et quoi ?
-- =============================================================================

-- Appelée à chaque passage. Elle constate, décide, et note qu'elle a tourné.
-- Elle N'ENVOIE RIEN : c'est la route qui envoie, et qui revient dire si ça
-- a marché.
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

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'source', p.source,
             'identite', p.identite,
             'intitule', p.intitule,
             'motif', p.motif,
             'depuis', p.depuis
           ) ORDER BY p.source, p.identite
         ), '[]'::jsonb),
         count(*) FILTER (WHERE p.source = 'alerte sans bannière'),
         count(*) FILTER (WHERE p.source = 'abonnement Graph'),
         count(*),
         md5(COALESCE(string_agg(p.cle_empreinte, '|' ORDER BY p.cle_empreinte), ''))
    INTO v_lignes, v_alertes, v_abonnements, v_total, v_empreinte
    FROM problemes_de_veille(p_age_minutes) p;

  v_probleme := v_total > 0;

  IF NOT v_probleme THEN
    -- Le problème a disparu : on repart de zéro, pour que sa réapparition
    -- soit traitée comme neuve et alerte tout de suite.
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
      -- Un envoi raté ne compte pas comme un envoi : on réessaie au passage
      -- suivant, sans attendre le délai de relance.
      v_envoyer := TRUE;
      v_motif := CASE WHEN v_etat.echecs_consecutifs > 0
                      THEN 'reprise après ' || v_etat.echecs_consecutifs || ' échec(s) d''envoi'
                      ELSE 'jamais envoyé' END;
      UPDATE veille_etat SET dernier_controle_at = now(), maj_at = now()
       WHERE cle = 'quotidienne';

    ELSE
      -- Relance espacée. Le même problème non traité revient de moins en
      -- moins souvent : on veut le rappeler, pas le marteler.
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
-- 4. Le résultat de l'envoi
-- =============================================================================

-- ⚠ p_empreinte : l'envoi est rattaché au problème qu'il décrivait. Si la
--   situation a changé entre la préparation et l'envoi, on ne marque rien
--   comme envoyé — sinon le nouveau problème passerait pour déjà signalé.
CREATE OR REPLACE FUNCTION public.marquer_veille_envoyee(
  p_empreinte TEXT,
  p_ok BOOLEAN,
  p_erreur TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_courante TEXT;
BEGIN
  SELECT empreinte INTO v_courante FROM veille_etat WHERE cle = 'quotidienne' FOR UPDATE;

  IF v_courante IS DISTINCT FROM p_empreinte THEN
    RETURN 'empreinte-perimee';
  END IF;

  IF p_ok THEN
    UPDATE veille_etat
       SET dernier_envoi_at = now(), envois = envois + 1,
           echecs_consecutifs = 0, premier_echec_at = NULL, derniere_erreur = NULL,
           secours_envoye_at = NULL, maj_at = now()
     WHERE cle = 'quotidienne';
    RETURN 'envoye';
  END IF;

  UPDATE veille_etat
     SET echecs_consecutifs = echecs_consecutifs + 1,
         premier_echec_at = COALESCE(premier_echec_at, now()),
         derniere_erreur = left(COALESCE(p_erreur, 'sans détail'), 500),
         maj_at = now()
   WHERE cle = 'quotidienne';
  RETURN 'echec-enregistre';
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_veille_envoyee(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_veille_envoyee(TEXT, BOOLEAN, TEXT) TO service_role;

-- =============================================================================
-- 5. LE SECOURS — quand le silence ne veut pas dire « tout va bien »
-- =============================================================================

-- Deux pannes rendent le chemin normal muet :
--
--   • l'envoi échoue (clé Resend révoquée, domaine dévérifié, quota) ;
--   • la route ne répond plus du tout (mauvais déploiement, Netlify en
--     panne) — et alors personne n'enregistre le moindre échec.
--
-- Ce chemin-ci ne passe par l'application NI par Resend côté Node : Postgres
-- appelle l'API Resend lui-même, avec pg_net. Il n'envoie qu'un message court
-- et brut : son rôle est d'être reçu, pas d'être joli.
--
-- LIMITE À CONNAÎTRE. Il dépend encore de pg_cron et de pg_net. Si Postgres
-- s'arrête, plus rien ne prévient — c'est la santé de Supabase elle-même qui
-- reste le dernier recours.
--
-- La clé Resend est facultative. Sans elle, le secours ne fait rien et le
-- diagnostic du worker le dit.
CREATE OR REPLACE FUNCTION public.veille_secours()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_etat veille_etat%ROWTYPE;
  v_cle TEXT;
  v_from TEXT;
  v_to TEXT;
  v_muette BOOLEAN;
  v_raison TEXT;
  v_corps TEXT;
BEGIN
  SELECT * INTO v_etat FROM veille_etat WHERE cle = 'quotidienne' FOR UPDATE;

  -- La route n'a pas donné signe de vie depuis plus d'un jour, ou l'envoi
  -- échoue de façon répétée.
  v_muette := v_etat.dernier_controle_at IS NULL
              OR v_etat.dernier_controle_at < now() - INTERVAL '26 hours';

  IF NOT v_muette AND COALESCE(v_etat.echecs_consecutifs, 0) < 3 THEN
    RETURN 'rien-a-faire';
  END IF;

  -- Un secours par jour au maximum : il remplace une alerte, il ne la double
  -- pas.
  IF v_etat.secours_envoye_at IS NOT NULL
     AND v_etat.secours_envoye_at > now() - INTERVAL '24 hours' THEN
    RETURN 'deja-envoye-recemment';
  END IF;

  SELECT valeur INTO v_cle FROM parametres_systeme WHERE cle = 'resend_api_key';
  SELECT valeur INTO v_from FROM parametres_systeme WHERE cle = 'veille_from';
  SELECT valeur INTO v_to FROM parametres_systeme WHERE cle = 'veille_destinataire';

  IF v_cle IS NULL OR v_cle = 'REMPLACER_PAR_LA_VRAIE_CLE'
     OR v_from IS NULL OR v_to IS NULL THEN
    RAISE WARNING 'veille_secours : paramètres absents, aucun secours possible';
    RETURN 'non-configure';
  END IF;

  v_raison := CASE
    WHEN v_muette THEN
      'La veille Safentreprise ne répond plus. Dernier passage : ' ||
      COALESCE(v_etat.dernier_controle_at::TEXT, 'jamais') ||
      '. Personne ne surveille les deux vues de contrôle.'
    ELSE
      'La veille Safentreprise n''arrive pas à envoyer ses alertes : ' ||
      v_etat.echecs_consecutifs || ' échecs depuis ' ||
      COALESCE(v_etat.premier_echec_at::TEXT, '?') ||
      '. Dernière erreur : ' || COALESCE(v_etat.derniere_erreur, 'sans détail') ||
      '. Il y a donc un problème signalé que vous n''avez pas reçu.'
  END;

  v_corps := v_raison || E'\n\n' ||
    'À vérifier :' || E'\n' ||
    '  SELECT * FROM alertes_sans_banniere;' || E'\n' ||
    '  SELECT * FROM abonnements_en_alerte;' || E'\n' ||
    '  SELECT * FROM veille_etat;' || E'\n\n' ||
    'Message envoyé par Postgres directement — la voie normale est hors service.';

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cle
    ),
    body := jsonb_build_object(
      'from', v_from,
      'to', jsonb_build_array(v_to),
      'subject', '[Safentreprise] La veille est hors service',
      'text', v_corps
    ),
    timeout_milliseconds := 20000
  );

  UPDATE veille_etat SET secours_envoye_at = now(), maj_at = now()
   WHERE cle = 'quotidienne';

  RETURN 'secours-envoye';
END;
$$;

REVOKE ALL ON FUNCTION public.veille_secours() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 6. Ce que le worker doit pouvoir dire de la veille
-- =============================================================================

CREATE OR REPLACE FUNCTION public.etat_veille()
RETURNS TABLE (
  dernier_controle_at TIMESTAMPTZ,
  muette BOOLEAN,
  probleme_en_cours BOOLEAN,
  envois INTEGER,
  echecs_consecutifs INTEGER,
  derniere_erreur TEXT,
  secours_configure BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.dernier_controle_at,
         v.dernier_controle_at IS NULL
           OR v.dernier_controle_at < now() - INTERVAL '26 hours',
         v.empreinte IS NOT NULL,
         v.envois,
         v.echecs_consecutifs,
         v.derniere_erreur,
         EXISTS (
           SELECT 1 FROM parametres_systeme
            WHERE cle = 'resend_api_key' AND valeur <> 'REMPLACER_PAR_LA_VRAIE_CLE'
         )
    FROM veille_etat v WHERE v.cle = 'quotidienne';
$$;

REVOKE ALL ON FUNCTION public.etat_veille() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_veille() TO service_role;

-- =============================================================================
-- 7. Paramètres du secours
-- =============================================================================

-- ▼▼▼ À RENSEIGNER ▼▼▼
--
--   resend_api_key        la même clé que RESEND_API_KEY sur Netlify
--   veille_from           adresse d'expédition, sur un domaine VÉRIFIÉ chez
--                         Resend (onboarding@resend.dev ne peut écrire qu'à
--                         l'adresse du compte Resend, à personne d'autre)
--   veille_destinataire   qui reçoit l'alerte

INSERT INTO parametres_systeme (cle, valeur) VALUES
  ('resend_api_key', 'REMPLACER_PAR_LA_VRAIE_CLE'),
  ('veille_from', 'veille@safentreprise.com'),
  ('veille_destinataire', 'contact@safentreprise.com')
ON CONFLICT (cle) DO NOTHING;   -- ne réécrase pas une valeur déjà posée

-- ▲▲▲ À RENSEIGNER ▲▲▲

-- =============================================================================
-- 8. Tâches planifiées
-- =============================================================================

DO $$
DECLARE j TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron absent : la veille doit être déclenchée à la main.';
    RETURN;
  END IF;

  FOREACH j IN ARRAY ARRAY['safentreprise-veille', 'safentreprise-veille-secours'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;

  -- TOUTES LES HEURES, et non une fois par jour. Ce n'est pas un mail par
  -- heure : la relance espacée décide seule de la fréquence des envois. Mais
  -- un envoi raté à 8 h ne doit pas attendre le lendemain pour être réessayé.
  PERFORM cron.schedule(
    'safentreprise-veille',
    '7 * * * *',
    $cron$ SELECT public.appeler_route_interne('/api/veille'); $cron$
  );

  -- Le secours regarde si la voie normale donne encore signe de vie.
  PERFORM cron.schedule(
    'safentreprise-veille-secours',
    '23 */6 * * *',
    $cron$ SELECT public.veille_secours(); $cron$
  );
END $$;

-- =============================================================================
-- 9. Vérification
-- =============================================================================

-- Ce que la veille voit en ce moment :
--
--   SELECT * FROM problemes_de_veille(120);
--
-- Ce qu'elle ferait (elle note son passage, mais n'envoie rien) :
--
--   SELECT probleme, envoyer, motif_envoi, nb_total FROM preparer_veille(120);
--
-- Son état :
--
--   SELECT * FROM etat_veille();
--   SELECT * FROM veille_etat;
--
-- Les tâches :
--
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--
-- Le vrai résultat HTTP des appels (pg_cron dit « succeeded » même sur un 500) :
--
--   SELECT id, status_code, left(content, 300), created
--     FROM net._http_response ORDER BY id DESC LIMIT 10;
