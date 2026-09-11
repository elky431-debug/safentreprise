-- Le journal d'accès sort du chemin critique de la détection
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : depuis 20260915, `journaliser()` écrit une ligne AVANT que les
-- fonctions de lecture ne rendent leur résultat. Sans bloc d'exception, un
-- refus d'écriture faisait échouer toute la fonction appelante. Pour
-- `contexte_detection_graph()`, le worker rattrape et poursuit — mais SANS
-- contexte, donc privé de l'usurpation d'annuaire et du domaine ressemblant,
-- ses deux règles les plus fortes. Silencieusement, à une ligne de log près.
--
-- Trois défenses en couches, dans cet ordre :
--
--   1. LA CAUSE RÉELLE EST SUPPRIMÉE. Une société inconnue de `companies` est
--      ramenée à NULL avant l'insertion. La colonne est nullable ; la clé
--      étrangère est satisfaite ; la ligne dit « lecture non rattachable à
--      une société connue », ce qui est exactement le fait.
--
--   2. UN FILET, POUR LES AUTRES CAUSES. L'insertion passe sous un bloc
--      d'exception. En PL/pgSQL ce bloc ouvre une sous-transaction : l'écriture
--      ratée est annulée, la transaction englobante survit, et la lecture rend
--      son résultat. L'échec est constaté dans `journal_echecs`.
--
--   3. L'ALERTE PASSE PAR LA VEILLE EXISTANTE. `problemes_de_veille()` gagne
--      une troisième source. Aucun mécanisme nouveau : le mail, l'empreinte
--      anti-répétition et la route sont déjà là.
--
-- ⚠ POURQUOI CE N'EST PAS « RENDRE LE JOURNAL OPTIONNEL ». Un journal qui perd
--   des lignes en silence n'est pas une preuve. Un journal qui DOCUMENTE ses
--   propres trous — combien, quand, quel code — en reste une : on peut dire à
--   un auditeur « à telle heure, N écritures ont été refusées avec tel code »,
--   ce qui vaut mieux qu'un journal d'apparence complète dont nul ne sait s'il
--   l'est.

-- =============================================================================
-- 1. La table des échecs
-- =============================================================================

-- ⚠ ELLE EST CONÇUE POUR NE PAS POUVOIR ÉCHOUER À SON TOUR. Aucune clé
--   étrangère, aucune contrainte CHECK sur des valeurs énumérées, toutes les
--   colonnes nullables. Une table de constat qui refuse un constat ne sert à
--   rien — et la valeur qui a fait échouer l'écriture d'origine est
--   précisément celle qu'on veut pouvoir consigner.
CREATE TABLE IF NOT EXISTS journal_echecs (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Le contexte de l'écriture refusée, tel qu'il a été reçu.
  acteur TEXT,
  ressource TEXT,
  operation TEXT,

  -- Le diagnostic.
  etat_sql TEXT,
  contrainte TEXT
);

-- ⚠ ON NE STOCKE PAS SQLERRM, ET C'EST UNE DÉCISION DE PROTECTION DES DONNÉES.
--   Le message d'erreur de PostgreSQL recopie la valeur fautive. Or la
--   contrainte `journal_sans_adresse` de `journal_acces` se déclenche
--   précisément quand une adresse électronique s'est glissée dans un champ :
--   consigner SQLERRM ferait entrer cette adresse dans `journal_echecs`, soit
--   exactement ce que tout le dispositif interdit. Le SQLSTATE sur cinq
--   caractères et le nom de la contrainte suffisent au diagnostic et ne
--   peuvent porter aucune donnée personnelle.
COMMENT ON TABLE journal_echecs IS
  'Constats d''écritures refusées dans journal_acces. Ne contient ni message d''erreur ni valeur fautive : un code SQLSTATE et un nom de contrainte. Alimentée par journaliser() seule.';

CREATE INDEX IF NOT EXISTS idx_journal_echecs_at ON journal_echecs(at);

ALTER TABLE journal_echecs ENABLE ROW LEVEL SECURITY;

-- Aucune politique : inaccessible au client comme au collaborateur, au même
-- titre que journal_acces. Seules les fonctions SECURITY DEFINER y écrivent.
REVOKE ALL ON TABLE journal_echecs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE journal_echecs_id_seq FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. `journaliser` devient increvable
-- =============================================================================

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
  v_etat TEXT;
  v_contrainte TEXT;
BEGIN
  -- Le locataire est désigné par son GUID Microsoft côté application ; on le
  -- résout ici, et on en déduit la société si elle n'a pas été donnée.
  IF p_tenant_id IS NOT NULL THEN
    SELECT t.id, COALESCE(v_company, t.company_id)
      INTO v_tenant_uid, v_company
      FROM microsoft_tenants t
     WHERE t.tenant_id = p_tenant_id;
  END IF;

  -- ---- Défense 1 : une société inconnue ne fait pas tomber l'écriture ----
  --
  -- ⚠ CE N'EST PAS UN CONTOURNEMENT DE LA CLÉ ÉTRANGÈRE. En trafic réel le cas
  --   ne se produit pas : le company_id vient toujours d'une table qui le
  --   contraint déjà (boites_surveillees, microsoft_tenants). Il ne survient
  --   que pour un appel de diagnostic, qui n'est rattaché à aucune société —
  --   et NULL est alors la valeur juste, pas un pis-aller.
  IF v_company IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_company) THEN
    v_company := NULL;
  END IF;

  -- ---- Défense 2 : le filet ----
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- ⚠ ON CAPTURE L'ÉTAT AVANT D'OUVRIR LE BLOC SUIVANT. `SQLSTATE` désigne
    --   l'exception du bloc courant ; une fois entré dans le BEGIN imbriqué,
    --   il ne désignerait plus celle qu'on veut consigner.
    GET STACKED DIAGNOSTICS
      v_etat = RETURNED_SQLSTATE,
      v_contrainte = CONSTRAINT_NAME;

    BEGIN
      INSERT INTO journal_echecs (acteur, ressource, operation, etat_sql, contrainte)
      VALUES (
        NULLIF(btrim(p_acteur), ''),
        NULLIF(btrim(p_ressource), ''),
        NULLIF(btrim(p_operation), ''),
        v_etat,
        NULLIF(v_contrainte, '')
      );
    EXCEPTION WHEN OTHERS THEN
      -- Dernier recours : les deux écritures sont refusées, la cause est donc
      -- globale (disque, base en lecture seule). Il ne reste que le log
      -- PostgreSQL — que personne ne lit, mais dans ce cas de figure le
      -- journal n'est plus le problème principal.
      RAISE WARNING
        'journaliser : écriture refusée (%), et son constat aussi', v_etat;
    END;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.journaliser(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. La veille voit les échecs de journalisation
-- =============================================================================

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
    FROM abonnements_en_alerte b

  UNION ALL

  -- ⚠ FENÊTRE DE 24 HEURES, ET PAS `p_age_minutes`. Les deux autres sources
  --   attendent volontairement avant d'alerter — une bannière peut être posée
  --   avec quelques minutes de retard. Un refus d'écriture du journal, lui,
  --   n'est jamais normal : on le signale au premier passage de la veille.
  --   La fenêtre borne aussi l'alerte dans le temps : un incident vieux de
  --   plus d'un jour cesse de maintenir la veille au rouge, ses lignes
  --   restant consultables en base.
  --
  -- ⚠ AGRÉGÉ PAR CODE ET PAR JOUR. Une panne de journalisation produit une
  --   ligne par message analysé ; l'empreinte ne retient que le code et la
  --   date, sinon chaque nouveau refus relancerait un mail. Le décompte
  --   figure dans l'intitulé, hors empreinte, comme pour les abonnements.
  SELECT 'journalisation',
         e.etat_sql,
         e.etat_sql || '/' || COALESCE(e.contrainte, '-') || '/' ||
           (e.premier AT TIME ZONE 'UTC')::date::TEXT,
         'Journal d''accès : ' || e.nb || ' écriture(s) refusée(s)',
         'Code SQL ' || COALESCE(e.etat_sql, 'inconnu') ||
           COALESCE(', contrainte ' || e.contrainte, '') ||
           '. La lecture concernée a abouti, mais sa trace manque.',
         e.premier
    FROM (
      SELECT etat_sql, contrainte, count(*) AS nb, min(at) AS premier
        FROM journal_echecs
       WHERE at > now() - INTERVAL '24 hours'
       GROUP BY etat_sql, contrainte
    ) e;
$$;

REVOKE ALL ON FUNCTION public.problemes_de_veille(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.problemes_de_veille(INTEGER) TO service_role;

-- =============================================================================
-- 4. Compter les échecs, pour le contrôle du worker
-- =============================================================================

-- Lue par POST /api/microsoft/worker?verifier=1. Elle ne rend que des nombres
-- et des codes : rien qui doive rester hors de portée.
CREATE OR REPLACE FUNCTION public.echecs_de_journalisation()
RETURNS TABLE (
  recents INTEGER,
  total INTEGER,
  dernier_at TIMESTAMPTZ,
  codes TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FILTER (WHERE at > now() - INTERVAL '24 hours')::INTEGER,
         count(*)::INTEGER,
         max(at),
         COALESCE(string_agg(DISTINCT etat_sql, ', '), '')
    FROM journal_echecs;
$$;

REVOKE ALL ON FUNCTION public.echecs_de_journalisation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echecs_de_journalisation() TO service_role;

-- =============================================================================
-- 5. La purge emporte aussi les constats
-- =============================================================================

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

  -- Les constats d'échec suivent la même conservation que le journal qu'ils
  -- complètent : ils n'ont pas de sens séparés de lui.
  DELETE FROM journal_echecs
   WHERE (at AT TIME ZONE 'UTC')::date < v_horizon;

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

REVOKE ALL ON FUNCTION public.purger_journal_acces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purger_journal_acces() TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- 6.1 La table et les deux fonctions sont-elles en place ?
--
--   SELECT to_regclass('public.journal_echecs') IS NOT NULL AS table_echecs,
--          EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--                   WHERE n.nspname = 'public' AND p.proname = 'echecs_de_journalisation')
--            AS fonction_compteur;
--
-- 6.2 Une société inconnue ne fait plus échouer la journalisation :
--
--   SELECT public.contexte_detection_graph('00000000-0000-0000-0000-000000000000');
--   -- Doit renvoyer {"annuaire": [], "domainesInternes": [], "domainesAutorises": []}
--   -- et NON une erreur 23503.
--
-- 6.3 Le filet fonctionne-t-il ? On provoque un refus que la défense 1 ne
--     couvre pas — un `acteur` hors de la liste autorisée :
--
--   SELECT public.journaliser('acteur-invalide', 'annuaire', 'lecture');
--   -- Ne doit lever AUCUNE erreur.
--   SELECT * FROM journal_echecs ORDER BY at DESC LIMIT 1;
--   -- Une ligne, etat_sql = '23514' (violation de contrainte CHECK).
--
-- 6.4 La veille voit-elle l'échec ?
--
--   SELECT source, intitule, motif FROM problemes_de_veille() WHERE source = 'journalisation';
--
-- 6.5 Nettoyer l'essai :
--
--   DELETE FROM journal_echecs WHERE acteur = 'acteur-invalide';
