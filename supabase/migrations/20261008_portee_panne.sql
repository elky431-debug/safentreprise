-- =============================================================================
-- Deux portes, pas une : le courrier et l'annuaire se coupent séparément
-- Appliquer via le SQL Editor Supabase. Idempotente.
-- =============================================================================
--
-- CE QU'UN TEST RÉEL A MONTRÉ. Révoquer les autorisations Entra de
-- l'application (User.Read.All, User.Read) N'ARRÊTE PAS l'analyse du courrier :
-- les bannières continuent de se poser. Parce que l'accès aux boîtes ne vient
-- PAS d'un rôle d'application Entra, mais de l'attribution de rôle Exchange
-- « Application Mail.ReadWrite » que pose le script de l'étape 3.
--
-- Safentreprise franchit donc DEUX portes indépendantes :
--
--   • LE COURRIER  — RBAC Exchange, posé par le script PowerShell.
--                    Se coupe avec Remove-ManagementRoleAssignment.
--   • L'ANNUAIRE   — rôle d'application Entra (User.Read.All).
--                    Se coupe en révoquant le consentement administrateur.
--
-- Et les remèdes sont OPPOSÉS : refaire le consentement ne rétablit pas le
-- courrier, réexécuter le script ne rétablit pas l'annuaire. Un écran qui dit
-- « votre surveillance est arrêtée » sans dire LAQUELLE des deux a lâché envoie
-- le client corriger ce qui n'est pas cassé.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠ L'ANNUAIRE COUPÉ NE DOIT PAS TOUCHER À `statut`, ET C'EST LE PIÈGE
--   CENTRAL DE CETTE MIGRATION.
--
--   QUARANTE requêtes exigent `statut = 'actif'`, dont
--   `abonnements_a_renouveler`. Marquer un locataire en panne parce que son
--   ANNUAIRE est coupé arrêterait le renouvellement des abonnements Graph :
--   ils expirent en moins de sept jours, et la surveillance du COURRIER — qui
--   fonctionnait parfaitement — mourrait d'un problème d'annuaire. On
--   s'infligerait la panne qu'on prétend détecter.
--
--   D'où deux axes indépendants, et non un état à cinq valeurs :
--
--     Axe 1, LE COURRIER ET LE JETON — `statut`, `echecs_sante`,
--       `sante_bascule_at`, et la nouvelle `panne_portee`. Il arrête la
--       chaîne, parce que dans ces deux cas plus rien n'est analysé.
--
--     Axe 2, L'ANNUAIRE — `annuaire_ko_at`, `annuaire_erreur`. Il n'arrête
--       RIEN. Les messages continuent d'être analysés ; c'est la
--       reconnaissance des dirigeants et collaborateurs qui se dégrade, donc
--       l'usurpation d'annuaire qui cesse d'être repérée.
--
-- ⚠ LA CONTRAINTE SUR `statut` NE CHANGE PAS. 'actif' | 'revoque' | 'erreur'
--   portent 40 requêtes ; y ajouter des valeurs demanderait de toutes les
--   relire. La portée est une colonne À CÔTÉ, pas une valeur de plus.
-- ─────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. Les deux axes
-- =============================================================================

ALTER TABLE public.microsoft_tenants
  -- Laquelle des deux portes a lâché, quand `statut` n'est plus 'actif'.
  -- NULL quand tout va bien. L'annuaire n'y figure PAS : il ne touche pas au
  -- statut, il a ses propres colonnes.
  ADD COLUMN IF NOT EXISTS panne_portee TEXT,
  -- Depuis quand l'annuaire est inaccessible. NULL = il répond.
  ADD COLUMN IF NOT EXISTS annuaire_ko_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS annuaire_erreur TEXT;

ALTER TABLE public.microsoft_tenants
  DROP CONSTRAINT IF EXISTS microsoft_tenants_panne_portee_check;

ALTER TABLE public.microsoft_tenants
  ADD CONSTRAINT microsoft_tenants_panne_portee_check
  CHECK (panne_portee IS NULL OR panne_portee IN ('courrier', 'tout'));

COMMENT ON COLUMN public.microsoft_tenants.panne_portee IS
  'Porte coupée : courrier (RBAC Exchange) ou tout (jeton refusé). Décide du texte affiché au client, et donc du remède.';
COMMENT ON COLUMN public.microsoft_tenants.annuaire_ko_at IS
  'Annuaire Entra inaccessible depuis cette date. N''arrête pas la surveillance : la dégrade.';

-- =============================================================================
-- 2. La machine à états, par porte
-- =============================================================================

-- ⚠ L'HYSTÉRÉSIS SE COMPTE PAR PORTE. Trois échecs consécutifs font une
--   révocation — mais trois échecs du MÊME diagnostic. Si la portée change
--   entre deux passages, le compteur repart à 1 : « courrier coupé » puis
--   « tout coupé » sont deux constats différents, et enchaîner l'un sur
--   l'autre ne confirme rien.
--
-- ⚠ L'ANNUAIRE EST TRAITÉ À PART, SANS HYSTÉRÉSIS ET SANS EFFET SUR `statut`.
--   Il ne déclenche pas de bascule de surveillance : il lève ou baisse un
--   drapeau, daté. Un faux positif y coûte un encadré ambre, pas l'arrêt d'un
--   client.
DROP FUNCTION IF EXISTS public.constater_sante_tenant(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.constater_sante_tenant(UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.constater_sante_tenant(
  p_tenant_uid UUID,
  p_verdict TEXT,                      -- 'ok' | 'passager' | 'definitif'
  p_portee TEXT DEFAULT NULL,          -- 'courrier' | 'tout' | NULL
  p_detail TEXT DEFAULT NULL,
  p_annuaire_ok BOOLEAN DEFAULT NULL,  -- NULL = non testé, on ne touche à rien
  p_annuaire_detail TEXT DEFAULT NULL
)
RETURNS TABLE (
  statut_avant TEXT,
  statut_apres TEXT,
  bascule BOOLEAN,
  echecs INTEGER,
  portee TEXT,
  annuaire_bascule BOOLEAN,
  annuaire_coupe BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  SEUIL_REVOCATION CONSTANT INTEGER := 3;
  v_avant TEXT;
  v_echecs INTEGER;
  v_portee_avant TEXT;
  v_apres TEXT;
  v_portee TEXT;
  v_annuaire_avant TIMESTAMPTZ;
  v_annuaire_bascule BOOLEAN := false;
BEGIN
  IF p_verdict NOT IN ('ok', 'passager', 'definitif') THEN
    RAISE EXCEPTION 'Verdict inconnu : %', p_verdict;
  END IF;
  IF p_portee IS NOT NULL AND p_portee NOT IN ('courrier', 'tout') THEN
    RAISE EXCEPTION 'Portée inconnue : %', p_portee;
  END IF;

  SELECT t.statut, t.echecs_sante, t.panne_portee, t.annuaire_ko_at
    INTO v_avant, v_echecs, v_portee_avant, v_annuaire_avant
    FROM microsoft_tenants t
   WHERE t.id = p_tenant_uid
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ---- Axe 1 : le courrier et le jeton ------------------------------------
  IF p_verdict = 'ok' THEN
    v_apres := 'actif';
    v_echecs := 0;
    v_portee := NULL;

  ELSIF p_verdict = 'passager' THEN
    -- Une panne passagère n'incrémente rien : trois coupures réseau étalées
    -- sur la semaine ne doivent pas faire une révocation.
    v_apres := 'erreur';
    v_portee := v_portee_avant;

  ELSE
    v_portee := COALESCE(p_portee, 'courrier');
    -- Portée différente = diagnostic différent : on recommence à compter.
    IF v_portee_avant IS DISTINCT FROM v_portee THEN
      v_echecs := 1;
    ELSE
      v_echecs := v_echecs + 1;
    END IF;
    v_apres := CASE WHEN v_echecs >= SEUIL_REVOCATION THEN 'revoque'
                    ELSE 'erreur' END;
  END IF;

  -- Une révocation constatée ne se dégrade pas sur un hoquet : seul un SUCCÈS
  -- en sort.
  IF v_avant = 'revoque' AND p_verdict <> 'ok' THEN
    v_apres := 'revoque';
    v_portee := COALESCE(v_portee, v_portee_avant);
  END IF;

  -- ---- Axe 2 : l'annuaire, indépendant ------------------------------------
  IF p_annuaire_ok IS NOT NULL THEN
    IF p_annuaire_ok AND v_annuaire_avant IS NOT NULL THEN
      v_annuaire_bascule := true;
      UPDATE microsoft_tenants
         SET annuaire_ko_at = NULL, annuaire_erreur = NULL
       WHERE id = p_tenant_uid;
    ELSIF NOT p_annuaire_ok THEN
      v_annuaire_bascule := (v_annuaire_avant IS NULL);
      UPDATE microsoft_tenants
         SET annuaire_ko_at = COALESCE(annuaire_ko_at, now()),
             annuaire_erreur = left(p_annuaire_detail, 500)
       WHERE id = p_tenant_uid;
    END IF;
  END IF;

  UPDATE microsoft_tenants
     SET echecs_sante = v_echecs,
         panne_portee = v_portee
   WHERE id = p_tenant_uid;

  PERFORM maj_sante_tenant(p_tenant_uid, v_apres, p_detail);

  RETURN QUERY
    SELECT v_avant,
           v_apres,
           (v_avant IS DISTINCT FROM v_apres),
           v_echecs,
           v_portee,
           v_annuaire_bascule,
           (SELECT t.annuaire_ko_at IS NOT NULL
              FROM microsoft_tenants t WHERE t.id = p_tenant_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.constater_sante_tenant(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.constater_sante_tenant(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  TO service_role;

-- =============================================================================
-- 3. Signaler une panne d'annuaire depuis ailleurs que la sonde
-- =============================================================================

-- ⚠ LA MAINTENANCE LAISSAIT L'ANNUAIRE MOURIR EN SILENCE. Son rafraîchissement
--   échouait sur un `console.error`, puis passait au locataire suivant
--   (`maintenance/route.ts:1329`). Aucune alerte, aucune trace en base : la
--   détection d'usurpation se dégradait sans que personne ne l'apprenne.
--   C'est la même maladie que `maj_sante_tenant` jamais appelée.
CREATE OR REPLACE FUNCTION public.signaler_annuaire_graph(
  p_tenant_uid UUID,
  p_ok BOOLEAN,
  p_detail TEXT DEFAULT NULL
)
RETURNS BOOLEAN   -- true si l'état a basculé
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avant TIMESTAMPTZ;
BEGIN
  SELECT annuaire_ko_at INTO v_avant
    FROM microsoft_tenants WHERE id = p_tenant_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_ok THEN
    UPDATE microsoft_tenants
       SET annuaire_ko_at = NULL, annuaire_erreur = NULL
     WHERE id = p_tenant_uid;
    RETURN v_avant IS NOT NULL;
  END IF;

  UPDATE microsoft_tenants
     SET annuaire_ko_at = COALESCE(annuaire_ko_at, now()),
         annuaire_erreur = left(p_detail, 500)
   WHERE id = p_tenant_uid;
  RETURN v_avant IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.signaler_annuaire_graph(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signaler_annuaire_graph(UUID, BOOLEAN, TEXT)
  TO service_role;

-- =============================================================================
-- 4. La vue de contrôle voit les deux portes
-- =============================================================================

-- DROP obligatoire : on ajoute des colonnes ET on garde security_invoker.
-- ⚠ `security_invoker = true` N'EST PAS FACULTATIF — sans lui la RLS de
--   `microsoft_tenants` cesse de s'appliquer et la vue fuit entre sociétés.
--   Voir 20261007, qui corrigeait précisément cet oubli.
DROP VIEW IF EXISTS public.tenants_en_alerte;

CREATE VIEW public.tenants_en_alerte
WITH (security_invoker = true) AS
  SELECT t.id AS tenant_uid,
         t.company_id,
         c.nom AS societe,
         t.tenant_id,
         t.statut,
         t.panne_portee,
         t.annuaire_ko_at,
         t.consenti_par,
         t.consenti_at,
         t.verifie_at,
         t.restriction_verifiee_at,
         t.derniere_erreur,
         t.echecs_sante,
         t.sante_bascule_at,
         t.sante_verifiee_at,
         (SELECT count(*) FROM boites_surveillees b
           WHERE b.tenant_uid = t.id AND b.actif) AS boites_actives,
         CASE
           WHEN t.statut = 'revoque' AND t.panne_portee = 'tout' THEN
             'TOUT COUPÉ — Microsoft refuse toute autorisation depuis ' ||
             COALESCE(t.sante_bascule_at::TEXT, 'une date inconnue') ||
             '. L''application a probablement été supprimée du locataire. ' ||
             COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'revoque' THEN
             'COURRIER COUPÉ — l''attribution de rôle Exchange a été retirée ' ||
             'depuis ' || COALESCE(t.sante_bascule_at::TEXT, 'une date inconnue') ||
             '. Plus aucun message n''est analysé. Le script PowerShell de ' ||
             'l''étape 3 doit être réexécuté. ' || COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'erreur' THEN
             'Santé incertaine (' || COALESCE(t.echecs_sante, 0) || '/3, portée ' ||
             COALESCE(t.panne_portee, 'indéterminée') || ') — ' ||
             COALESCE(t.derniere_erreur, 'sans détail')

           -- ⚠ L'ANNUAIRE PASSE APRÈS LES PANNES DE COURRIER, mais AVANT les
           --   motifs d'avancement : un client dont le courrier marche et
           --   l'annuaire pas est en dégradation active, ce qui prime sur un
           --   raccordement inachevé.
           WHEN t.annuaire_ko_at IS NOT NULL THEN
             'ANNUAIRE COUPÉ depuis ' || t.annuaire_ko_at::TEXT ||
             ' — les messages sont toujours analysés, mais l''usurpation ' ||
             'd''annuaire n''est plus détectée. Le consentement Entra doit ' ||
             'être réaccordé. ' || COALESCE(t.annuaire_erreur, '')

           WHEN t.restriction_verifiee_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM boites_surveillees b
                                 WHERE b.tenant_uid = t.id AND b.actif) THEN
             'RACCORDEMENT INACHEVÉ — la restriction des boîtes n''a pas été ' ||
             'vérifiée, donc rien n''est surveillé.'
           WHEN t.restriction_verifiee_at IS NULL THEN
             'PÉRIMÈTRE MODIFIÉ — ' ||
             (SELECT count(*) FROM boites_surveillees b
               WHERE b.tenant_uid = t.id AND b.actif)::TEXT ||
             ' boîte(s) déjà vérifiée(s) restent surveillées ; ' ||
             (SELECT count(*) FROM boites_surveillees b
               WHERE b.tenant_uid = t.id AND NOT b.actif)::TEXT ||
             ' attendent que la restriction soit vérifiée à nouveau.'
           WHEN NOT EXISTS (SELECT 1 FROM boites_surveillees b
                             WHERE b.tenant_uid = t.id AND b.actif) THEN
             'Aucune boîte active : rien n''est surveillé.'
           WHEN t.sante_verifiee_at IS NULL
                OR t.sante_verifiee_at < now() - INTERVAL '3 hours' THEN
             'Aucune vérification de santé depuis ' ||
             COALESCE(age(now(), t.sante_verifiee_at)::TEXT, 'toujours') ||
             ' — la tâche planifiée ne tourne plus.'
           ELSE 'À surveiller'
         END AS motif
    FROM microsoft_tenants t
    LEFT JOIN companies c ON c.id = t.company_id
   WHERE t.statut <> 'actif'
      OR t.annuaire_ko_at IS NOT NULL
      OR t.restriction_verifiee_at IS NULL
      OR t.sante_verifiee_at IS NULL
      OR t.sante_verifiee_at < now() - INTERVAL '3 hours'
      OR NOT EXISTS (SELECT 1 FROM boites_surveillees b
                      WHERE b.tenant_uid = t.id AND b.actif);

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires coupés (courrier, annuaire ou tout), inachevés, ou dont la santé n''est plus vérifiée. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

-- =============================================================================
-- 5. Vérification
-- =============================================================================
--
--   SELECT count(*) AS colonnes FROM information_schema.columns
--    WHERE table_name = 'microsoft_tenants'
--      AND column_name IN ('panne_portee','annuaire_ko_at','annuaire_erreur');
--   -- Attendu : 3
--
--   SELECT count(*) AS fonctions
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('constater_sante_tenant','signaler_annuaire_graph');
--   -- Attendu : 2  (une seule version de constater_sante_tenant)
--
--   SELECT COALESCE((SELECT o FROM unnest(c.reloptions) o
--                     WHERE o LIKE 'security_invoker%'),
--                   'ABSENT — LA VUE FUIT') AS securite
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname='public' AND c.relname='tenants_en_alerte';
--   -- Attendu : security_invoker=true
--
--   SELECT societe, statut, panne_portee, motif FROM tenants_en_alerte;
--   -- Doit rester vide.
