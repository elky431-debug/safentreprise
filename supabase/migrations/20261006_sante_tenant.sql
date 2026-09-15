-- =============================================================================
-- La santé du raccordement se constate, au lieu d'être supposée
-- Appliquer via le SQL Editor Supabase. Idempotente.
-- =============================================================================
--
-- CE QUI EST CASSÉ AUJOURD'HUI. `maj_sante_tenant` et `tenants_a_verifier`
-- existent depuis 20260907 et ne sont appelées par PERSONNE — ni par
-- l'application, ni par une tâche planifiée. Rien n'écrit donc jamais
-- `statut = 'revoque'` ni `'erreur'` dans microsoft_tenants.
--
-- Conséquence : un administrateur qui retire l'autorisation Microsoft arrête
-- toute la chaîne d'analyse, et l'interface continue d'afficher « n boîtes
-- surveillées » jusqu'à l'expiration naturelle des abonnements — soit près de
-- SEPT JOURS d'aveuglement présenté comme une protection.
--
-- CE QUE CETTE MIGRATION AJOUTE.
--   1. De quoi compter les échecs consécutifs, et dater la bascule.
--   2. `constater_sante_tenant` : la machine à états, avec son hystérésis.
--   3. `tenants_a_verifier` corrigée — elle affamait sa propre file.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠ DEUX ÉTATS QUI NE VEULENT PAS DIRE LA MÊME CHOSE, ET C'EST TOUT L'ENJEU.
--
--   « erreur »  est PASSAGER : on ne sait plus si la surveillance fonctionne.
--               Écrit dès le PREMIER échec, parce qu'un doute doit se voir
--               tout de suite. S'efface au premier succès.
--
--   « revoque » est DÉFINITIF : l'accord a été retiré, il faut refaire le
--               parcours. Écrit seulement après SEUIL_REVOCATION échecs
--               consécutifs de nature AUTORISATION.
--
--   Confondre les deux, c'est soit annoncer une révocation à un client dont
--   Microsoft a hoqueté cinq minutes, soit laisser un client vraiment coupé
--   se croire protégé. L'hystérésis est ce qui sépare les deux.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. Ce qu'il faut retenir entre deux vérifications
-- =============================================================================

ALTER TABLE public.microsoft_tenants
  -- Échecs de nature AUTORISATION enchaînés sans un seul succès.
  ADD COLUMN IF NOT EXISTS echecs_sante INTEGER NOT NULL DEFAULT 0,
  -- Dernière vérification, qu'elle ait réussi ou non.
  -- ⚠ DISTINCT DE `verifie_at`, qui ne marque QUE les succès. Trier la file
  --   sur `verifie_at` faisait revenir indéfiniment le même locataire en
  --   panne, pendant que les autres n'étaient jamais regardés.
  ADD COLUMN IF NOT EXISTS sante_verifiee_at TIMESTAMPTZ,
  -- Depuis quand le statut courant dure. C'est ce que l'écran affiche au
  -- client : « interrompue depuis le 14 septembre à 9 h 12 ».
  ADD COLUMN IF NOT EXISTS sante_bascule_at TIMESTAMPTZ;

COMMENT ON COLUMN public.microsoft_tenants.echecs_sante IS
  'Échecs d''autorisation consécutifs. Remis à 0 au premier succès.';
COMMENT ON COLUMN public.microsoft_tenants.sante_verifiee_at IS
  'Dernière vérification de santé, succès ou échec. Ordonne la file.';
COMMENT ON COLUMN public.microsoft_tenants.sante_bascule_at IS
  'Date d''entrée dans le statut courant. Alimente le « depuis quand ».';

-- =============================================================================
-- 2. L'écriture de bas niveau — enfin appelée
-- =============================================================================

-- Inchangée dans son intention, complétée sur deux points : elle date
-- désormais CHAQUE vérification, et elle remet le compteur à zéro sur un
-- retour à la normale.
--
-- ⚠ SIGNATURE ET TYPE DE RETOUR IDENTIQUES : CREATE OR REPLACE suffit.
--   Postgres refuserait le remplacement si l'un des deux changeait.
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
         verifie_at = CASE WHEN p_etat = 'actif' THEN now() ELSE verifie_at END,
         sante_verifiee_at = now(),
         echecs_sante = CASE WHEN p_etat = 'actif' THEN 0 ELSE echecs_sante END,
         sante_bascule_at = CASE WHEN statut IS DISTINCT FROM p_etat
                                 THEN now() ELSE sante_bascule_at END
   WHERE id = p_tenant_uid;
$$;

REVOKE ALL ON FUNCTION public.maj_sante_tenant(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maj_sante_tenant(UUID, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 3. La machine à états
-- =============================================================================

-- Le verdict que rend la sonde, et rien d'autre :
--
--   'ok'        le jeton ET l'appel Graph ont réussi
--   'passager'  429, 5xx, réseau, délai dépassé, cause inconnue
--   'definitif' l'autorisation elle-même est refusée (401/403, consentement
--               retiré, application absente du locataire)
--
-- ⚠ LA SONDE NE DÉCIDE PAS DU STATUT. Elle rapporte ce qu'elle a vu ; c'est
--   ici, et ici seulement, que l'on décide si cela vaut une révocation. Un
--   seul endroit à relire pour savoir ce qui fait basculer un client.
DROP FUNCTION IF EXISTS public.constater_sante_tenant(UUID, TEXT, TEXT);

CREATE FUNCTION public.constater_sante_tenant(
  p_tenant_uid UUID,
  p_verdict TEXT,
  p_detail TEXT DEFAULT NULL
)
RETURNS TABLE (
  statut_avant TEXT,
  statut_apres TEXT,
  bascule BOOLEAN,
  echecs INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ⚠ TROIS ÉCHECS, PAS UN. À une vérification toutes les trente minutes,
  --   cela met une heure et demie avant d'annoncer une révocation — et rend
  --   impossible qu'une indisponibilité Microsoft de quelques minutes fasse
  --   basculer un client payant. Le doute, lui, est affiché dès le premier
  --   échec sous la forme « erreur ».
  SEUIL_REVOCATION CONSTANT INTEGER := 3;
  v_avant TEXT;
  v_echecs INTEGER;
  v_apres TEXT;
BEGIN
  IF p_verdict NOT IN ('ok', 'passager', 'definitif') THEN
    RAISE EXCEPTION 'Verdict inconnu : %', p_verdict;
  END IF;

  SELECT t.statut, t.echecs_sante INTO v_avant, v_echecs
    FROM microsoft_tenants t
   WHERE t.id = p_tenant_uid
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_verdict = 'ok' THEN
    v_apres := 'actif';
    v_echecs := 0;

  ELSIF p_verdict = 'passager' THEN
    -- ⚠ UNE PANNE PASSAGÈRE N'INCRÉMENTE RIEN. Sinon trois coupures réseau
    --   étalées sur la semaine finiraient par déclarer une révocation qui
    --   n'a jamais eu lieu. Le compteur ne mesure QUE des refus
    --   d'autorisation.
    v_apres := 'erreur';

  ELSE
    v_echecs := v_echecs + 1;
    v_apres := CASE WHEN v_echecs >= SEUIL_REVOCATION THEN 'revoque'
                    ELSE 'erreur' END;
  END IF;

  -- ⚠ UNE RÉVOCATION CONSTATÉE NE SE DÉGRADE PAS EN « erreur ». Une fois
  --   l'accord retiré, les appels suivants peuvent très bien renvoyer un 429 :
  --   repasser en « erreur » sur ce hoquet effacerait un diagnostic sûr.
  --   Seul un SUCCÈS sort de « revoque ».
  IF v_avant = 'revoque' AND p_verdict <> 'ok' THEN
    v_apres := 'revoque';
  END IF;

  UPDATE microsoft_tenants
     SET echecs_sante = v_echecs
   WHERE id = p_tenant_uid;

  PERFORM maj_sante_tenant(p_tenant_uid, v_apres, p_detail);

  RETURN QUERY
    SELECT v_avant, v_apres, (v_avant IS DISTINCT FROM v_apres), v_echecs;
END;
$$;

REVOKE ALL ON FUNCTION public.constater_sante_tenant(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.constater_sante_tenant(UUID, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- 4. La file d'attente — elle s'affamait elle-même
-- =============================================================================

-- ⚠ LE TRI CHANGE, ET C'EST LA CORRECTION D'UN DÉFAUT. L'ancien ordonnait sur
--   `verifie_at`, que `maj_sante_tenant` n'écrit QUE sur un succès : un
--   locataire en panne gardait éternellement la date la plus ancienne, restait
--   en tête de file à chaque passage, et les autres n'étaient jamais
--   regardés. On trie sur la date de DERNIÈRE VÉRIFICATION, succès ou non.
--
-- Signature et type de retour inchangés : CREATE OR REPLACE passe.
CREATE OR REPLACE FUNCTION public.tenants_a_verifier(p_limite INTEGER DEFAULT 50)
RETURNS TABLE (tenant_uid UUID, tenant_id TEXT, company_id UUID, statut TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.tenant_id, t.company_id, t.statut
    FROM microsoft_tenants t
   WHERE t.statut IN ('actif', 'erreur', 'revoque')
   ORDER BY COALESCE(t.sante_verifiee_at, '-infinity'::TIMESTAMPTZ)
   LIMIT GREATEST(1, LEAST(p_limite, 200));
$$;

REVOKE ALL ON FUNCTION public.tenants_a_verifier(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenants_a_verifier(INTEGER) TO service_role;

-- ⚠ « revoque » EST DÉSORMAIS DANS LA FILE, ET C'EST DÉLIBÉRÉ. L'ancienne
--   version l'excluait : un client qui redonnait son accord serait resté
--   marqué révoqué pour toujours, sans que rien ne vienne le constater. C'est
--   ce qui rend la bascule réversible sans intervention.

-- =============================================================================
-- 5. Ce que la veille doit voir
-- =============================================================================

CREATE OR REPLACE VIEW public.tenants_en_alerte AS
  SELECT t.id AS tenant_uid,
         t.tenant_id,
         t.company_id,
         c.nom AS societe,
         t.statut,
         t.echecs_sante,
         t.sante_bascule_at,
         t.sante_verifiee_at,
         CASE
           WHEN t.statut = 'revoque' THEN
             'AUTORISATION RETIRÉE — plus aucun message n''est analysé depuis ' ||
             COALESCE(t.sante_bascule_at::TEXT, 'une date inconnue') || '. ' ||
             COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'erreur' THEN
             'Santé incertaine (' || t.echecs_sante || '/3 refus d''autorisation) — ' ||
             COALESCE(t.derniere_erreur, 'sans détail')
           -- Une vérification qui ne passe plus est un problème en soi : la
           -- tâche planifiée est peut-être arrêtée, et l'absence d'alerte
           -- ressemblerait alors à « tout va bien ».
           ELSE 'Aucune vérification de santé depuis ' ||
                COALESCE(age(now(), t.sante_verifiee_at)::TEXT, 'toujours')
         END AS motif
    FROM microsoft_tenants t
    LEFT JOIN companies c ON c.id = t.company_id
   WHERE t.statut IN ('revoque', 'erreur')
      OR t.sante_verifiee_at IS NULL
      OR t.sante_verifiee_at < now() - INTERVAL '3 hours';

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires coupés, douteux, ou plus vérifiés du tout. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

-- =============================================================================
-- 6. Le journal doit pouvoir nommer le nouvel acteur
-- =============================================================================

-- ⚠ SANS CETTE LIGNE, LA SONDE NE PEUT RIEN JOURNALISER. `journal_acces`
--   contraint la liste des acteurs ; « sante » n'en fait pas partie, et chaque
--   appel Graph de la vérification échouerait à l'écriture de sa trace.
--
-- ⚠ POURQUOI UN ACTEUR À ELLE, ET PAS « maintenance ». Ce sont deux travaux
--   distincts qui touchent les boîtes des clients pour des raisons
--   différentes. Un journal d'accès qui les confond ne permet plus de répondre
--   à « qui a lu cette boîte, et pourquoi » — ce à quoi il existe précisément
--   pour répondre.
ALTER TABLE public.journal_acces
  DROP CONSTRAINT IF EXISTS journal_acces_acteur_check;

ALTER TABLE public.journal_acces
  ADD CONSTRAINT journal_acces_acteur_check
  CHECK (acteur IN ('worker', 'maintenance', 'veille', 'raccordement',
                    'restauration', 'exploitation', 'purge', 'sante',
                    'inconnu'));

-- =============================================================================
-- 7. Vérification
-- =============================================================================
--
--   SELECT count(*) AS colonnes
--     FROM information_schema.columns
--    WHERE table_name = 'microsoft_tenants'
--      AND column_name IN ('echecs_sante','sante_verifiee_at','sante_bascule_at');
--   -- Attendu : 3
--
--   SELECT count(*) AS fonctions
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('constater_sante_tenant','maj_sante_tenant','tenants_a_verifier');
--   -- Attendu : 3
--
--   SELECT count(*) AS vue FROM pg_views
--    WHERE schemaname = 'public' AND viewname = 'tenants_en_alerte';
--   -- Attendu : 1
--
--   -- La vue doit rester vide. Si elle ne l'est pas, lire la colonne motif :
--   SELECT societe, statut, motif FROM tenants_en_alerte;
--
--   -- L'acteur « sante » est accepté par le journal :
--   SELECT pg_get_constraintdef(oid) LIKE '%sante%' AS acteur_accepte
--     FROM pg_constraint WHERE conname = 'journal_acces_acteur_check';
--   -- Attendu : t
