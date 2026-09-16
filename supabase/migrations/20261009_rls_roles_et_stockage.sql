-- =============================================================================
-- 20261009 — Fermer ce que `anon` pouvait atteindre, et nommer les rôles
-- =============================================================================
--
-- ⚠ LA RÈGLE QUI AURAIT ÉVITÉ LES DEUX CAS, ET QUI VAUT DÉSORMAIS POUR TOUTE
--   POLITIQUE ÉCRITE DANS CE DÉPÔT :
--
--       Une politique SANS clause `TO` s'applique à PUBLIC, donc à `anon`.
--       Toute politique doit donc NOMMER SON RÔLE et FILTRER SUR LA SOCIÉTÉ.
--       Les deux, pas l'un ou l'autre.
--
--   Ce n'est pas une préférence de style. Sur 82 politiques, 67 n'avaient pas
--   de clause `TO` ; 64 étaient sauvées par accident, parce que leur condition
--   passait par `auth.uid()` ou `get_my_company_id()`, qui rendent NULL pour un
--   visiteur anonyme et ne laissent donc passer aucune ligne. Les 3 autres —
--   celles dont la condition ne parlait que du bucket ou d'un booléen — étaient
--   grandes ouvertes. Une protection qui tient par accident tient jusqu'au jour
--   où quelqu'un écrit une condition un peu plus simple.
--
--   La règle est aussi écrite dans `docs/SECURITE-RLS.md`, avec la liste des
--   trois brèches et la façon de refaire l'inventaire.
--
-- =============================================================================
-- SECTION 1 — Le stockage : plus personne ne peut ÉNUMÉRER les buckets
-- =============================================================================
--
-- ⚠ CE QUI FUYAIT. `certificates_storage_select` disait `USING (bucket_id =
--   'certificates')` sans clause `TO`. N'importe qui, avec la clé `anon` qui
--   est dans le bundle du navigateur, pouvait lister le bucket : un dossier par
--   `company_id`, un PDF par campagne. Et le PDF porte le nom de la société, le
--   nombre de collaborateurs ciblés et le taux de clic. C'était donc la liste
--   des clients de Safentreprise et le résultat de leurs tests, en accès libre.
--
-- ⚠ LISTER ET TÉLÉCHARGER SONT DEUX PORTES DIFFÉRENTES, ET ON NE FERME ICI QUE
--   LA PREMIÈRE. Les deux buckets sont déclarés `public = true` : la lecture par
--   l'URL publique `/storage/v1/object/public/...` ne consulte PAS ces
--   politiques. C'est délibéré et nécessaire pour `branding` — le logo d'une
--   société est affiché dans un message de simulation, ouvert par un salarié
--   dans son client de messagerie, sans session.
--
--   Conséquence à connaître : une attestation dont l'URL a déjà été distribuée
--   continue de fonctionner après cette migration. C'est voulu — on ne casse
--   pas un lien qu'un dirigeant a mis en favori — mais cela veut dire que
--   quiconque a DÉJÀ listé le bucket conserve des URL valides. Rendre le bucket
--   privé et servir les attestations par une route authentifiée est la seule
--   fermeture complète ; c'est une décision produit, pas une migration.

DROP POLICY IF EXISTS certificates_storage_select ON storage.objects;
CREATE POLICY certificates_storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_select ON storage.objects;
CREATE POLICY branding_storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

-- Les politiques d'écriture filtraient déjà sur la société, mais ne nommaient
-- pas leur rôle. On applique la règle partout plutôt que « là où ça fuyait » :
-- une politique d'écriture sans `TO` est une brèche qui attend une condition
-- plus simple.

DROP POLICY IF EXISTS certificates_storage_insert ON storage.objects;
CREATE POLICY certificates_storage_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_update ON storage.objects;
CREATE POLICY certificates_storage_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_delete ON storage.objects;
CREATE POLICY certificates_storage_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_insert ON storage.objects;
CREATE POLICY branding_storage_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_update ON storage.objects;
CREATE POLICY branding_storage_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_delete ON storage.objects;
CREATE POLICY branding_storage_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

-- =============================================================================
-- SECTION 2 — Le catalogue : rien à changer, et voici pourquoi
-- =============================================================================
--
-- ⚠ CORRECTION D'UN DIAGNOSTIC FAUX QUE J'AI RENDU LE 16 SEPTEMBRE 2026.
--   J'avais signalé que `message_templates` et `quiz_questions` étaient
--   réécrivables par n'importe quel compte connecté, et le catalogue lisible
--   sans compte. C'ÉTAIT INEXACT : `20260817_cloisonnement_modeles_quiz.sql`
--   avait déjà corrigé exactement cela le 17 août.
--
--   Mon inventaire lisait les `CREATE POLICY` sans tenir compte des
--   `DROP POLICY` qui les précèdent. Il rendait donc des politiques mortes
--   comme vivantes. Refait correctement, il ne laisse plus qu'un seul défaut
--   réel — le stockage, section 1 — et rien sur ces deux tables.
--
-- ⚠ L'ÉTAT RÉEL, DEPUIS LE 17 AOÛT, EST DÉJÀ CELUI QUI A ÉTÉ DEMANDÉ :
--
--     `company_id IS NULL`  = entrée du catalogue commun, propriété de
--                             Safentreprise. Lisible par tout compte connecté,
--                             modifiable par PERSONNE via l'API publique.
--     `company_id = <soc.>` = copie du client, qu'il est seul à voir et à gérer.
--
--   Les politiques d'écriture exigent `company_id IS NOT NULL AND company_id =
--   get_my_company_id()` : un client ne peut donc écrire QUE sur ses propres
--   copies, jamais sur un original. « Une copie rattachée à sa société, jamais
--   une modification de l'original » n'est pas une règle à noter pour plus
--   tard : c'est le modèle en place.
--
--   Retirer INSERT / UPDATE / DELETE à `authenticated` comme je l'avais proposé
--   supprimerait cette possibilité de copie. On ne le fait donc pas.
--
-- ⚠ CE QUI RESTE VRAI, ET QUI EST TRAITÉ ICI. `supabase/schema.sql` porte
--   encore les anciennes politiques, celles d'avant le 17 août :
--   `message_templates_select_actif` (sans clause `TO`, donc lisible par `anon`)
--   et `message_templates_update_auth` (`USING (true)`). Elles sont mortes en
--   production, mais un `schema.sql` rejoué pour monter un environnement neuf
--   les ressusciterait. Le fichier est corrigé dans le même commit ; les DROP
--   ci-dessous sont la ceinture, au cas où un environnement aurait déjà été
--   monté à partir de la version périmée.

DROP POLICY IF EXISTS message_templates_select_actif    ON message_templates;
DROP POLICY IF EXISTS message_templates_select_all_auth ON message_templates;
DROP POLICY IF EXISTS message_templates_update_auth     ON message_templates;

DROP POLICY IF EXISTS quiz_questions_select_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_insert_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_update_auth ON quiz_questions;
DROP POLICY IF EXISTS quiz_questions_delete_auth ON quiz_questions;

-- Si ces DROP ne trouvent rien, tout va bien : cela veut dire que la migration
-- du 17 août a bien été appliquée et que rien ne l'a écrasée depuis.

-- =============================================================================
-- SECTION 3 — Le formulaire de démo : une seule porte, et elle compte
-- =============================================================================
--
-- ⚠ CE QUI EXISTAIT. `demandes_demo_insert_public` disait `TO anon,
--   authenticated WITH CHECK (true)` : n'importe qui pouvait écrire dans la
--   table, autant de fois qu'il voulait, SANS PASSER PAR /api/demo. Toute
--   limitation posée dans la route se contournait donc par un `curl` vers
--   PostgREST avec la clé publique.
--
--   La politique disparaît. L'insertion passe désormais par une fonction
--   `SECURITY DEFINER` qui compte avant d'écrire — c'est la seule façon d'avoir
--   un compteur partagé : les fonctions Netlify sont sans état et multiples, un
--   compteur en mémoire ne compte rien.

ALTER TABLE demandes_demo
  ADD COLUMN IF NOT EXISTS ip_hmac TEXT,
  ADD COLUMN IF NOT EXISTS suspect BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motifs_suspicion TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN demandes_demo.ip_hmac IS
  'HMAC-SHA256 salé de l''adresse IP, jamais l''adresse elle-même. Sert '
  'uniquement à compter les soumissions d''une même origine. Remis à NULL au '
  'bout de 30 jours par purger_empreintes_demo().';

COMMENT ON COLUMN demandes_demo.suspect IS
  'La demande a déclenché au moins un signal automatique. Elle est CONSERVÉE '
  'et notifiée : on marque, on ne jette pas. Seul l''email de confirmation et '
  'l''en-tête Reply-To sont supprimés.';

CREATE INDEX IF NOT EXISTS idx_demandes_demo_ip
  ON demandes_demo(ip_hmac, created_at DESC)
  WHERE ip_hmac IS NOT NULL;

-- ---------------------------------------------------------------------------
-- La purge des empreintes : 30 jours, puis NULL
-- ---------------------------------------------------------------------------
--
-- ⚠ ON EFFACE L'EMPREINTE, PAS LA DEMANDE. Une adresse IP — même hachée, car
--   le sel est constant et l'espace des IPv4 se parcourt en quelques heures —
--   est une donnée personnelle. Le prospect, lui, doit rester en base : c'est
--   une donnée commerciale dont la conservation a sa propre base légale.
--   Supprimer la ligne entière ferait perdre un client pour protéger une
--   donnée qu'il suffit de mettre à NULL.

CREATE OR REPLACE FUNCTION public.purger_empreintes_demo()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purgees INTEGER;
BEGIN
  UPDATE demandes_demo
     SET ip_hmac = NULL
   WHERE ip_hmac IS NOT NULL
     AND created_at < now() - INTERVAL '30 days';

  GET DIAGNOSTICS v_purgees = ROW_COUNT;
  RETURN v_purgees;
END;
$$;

REVOKE ALL ON FUNCTION public.purger_empreintes_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purger_empreintes_demo() TO service_role;

-- ---------------------------------------------------------------------------
-- L'enregistrement, avec son compteur
-- ---------------------------------------------------------------------------
--
-- ⚠ SEUILS VOLONTAIREMENT LARGES : 10 PAR HEURE ET 30 PAR JOUR, PAR EMPREINTE.
--   Le volume observé est de 8 demandes en trois semaines, dont 5 d'un robot et
--   3 de tests internes. Aucun vrai prospect n'a encore écrit. Bloquer le
--   premier coûterait infiniment plus cher que laisser passer du bruit : le
--   robot est arrêté par le piège et par la détection de casse, pas par ces
--   seuils, qui ne sont qu'un plafond contre une rafale.
--
-- ⚠ AUCUNE LIMITE PAR ADRESSE EMAIL. Un prospect peut légitimement resoumettre
--   — il s'est trompé de numéro, il n'a pas eu de réponse. L'adresse ne sert
--   pas de compteur.
--
-- ⚠ LA FONCTION REND UN MOTIF, ELLE NE LÈVE PAS. La route doit pouvoir
--   distinguer « limite atteinte » de « panne » pour choisir quoi afficher.

CREATE OR REPLACE FUNCTION public.enregistrer_demande_demo(
  p_nom             TEXT,
  p_entreprise      TEXT,
  p_email           TEXT,
  p_telephone       TEXT,
  p_effectif        TEXT,
  p_microsoft_365   TEXT,
  p_message         TEXT,
  p_ip_hmac         TEXT,
  p_suspect         BOOLEAN,
  p_motifs          TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_heure INTEGER;
  v_jour  INTEGER;
BEGIN
  IF p_ip_hmac IS NOT NULL AND p_ip_hmac <> '' THEN
    SELECT count(*) INTO v_heure
      FROM demandes_demo
     WHERE ip_hmac = p_ip_hmac
       AND created_at > now() - INTERVAL '1 hour';

    IF v_heure >= 10 THEN
      RETURN 'limite_heure';
    END IF;

    SELECT count(*) INTO v_jour
      FROM demandes_demo
     WHERE ip_hmac = p_ip_hmac
       AND created_at > now() - INTERVAL '1 day';

    IF v_jour >= 30 THEN
      RETURN 'limite_jour';
    END IF;
  END IF;

  INSERT INTO demandes_demo (
    nom, entreprise, email, telephone,
    effectif, microsoft_365, message,
    ip_hmac, suspect, motifs_suspicion
  ) VALUES (
    p_nom, p_entreprise, p_email, NULLIF(p_telephone, ''),
    NULLIF(p_effectif, ''), NULLIF(p_microsoft_365, ''), NULLIF(p_message, ''),
    NULLIF(p_ip_hmac, ''), COALESCE(p_suspect, false), COALESCE(p_motifs, '{}')
  );

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_demande_demo(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enregistrer_demande_demo(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]
) TO anon, authenticated, service_role;

-- La porte directe se ferme APRÈS que la fonction existe : dans l'autre ordre,
-- un formulaire rempli pendant la migration se perdrait.
DROP POLICY IF EXISTS demandes_demo_insert_public ON demandes_demo;
REVOKE INSERT ON TABLE demandes_demo FROM anon, authenticated;

-- =============================================================================
-- VÉRIFICATIONS — à passer après application
-- =============================================================================
--
-- 1. Plus aucune politique atteignable par anon en dehors de celles voulues :
--
--      SELECT schemaname, tablename, policyname, roles, cmd
--        FROM pg_policies
--       WHERE 'anon' = ANY(roles) OR roles = '{public}'
--       ORDER BY tablename, policyname;
--
--    Attendu : aucune ligne sur storage.objects, message_templates,
--    quiz_questions ni demandes_demo.
--
-- 2. Le catalogue est bien dans l'état du 17 août :
--
--      SELECT policyname, cmd, roles FROM pg_policies
--       WHERE tablename IN ('message_templates', 'quiz_questions')
--       ORDER BY tablename, cmd;
--
--    Attendu : huit lignes, toutes `TO authenticated`, nommées `*_own` ou
--    `*_select_visible`. Aucune nommée `*_auth` ni `*_select_actif` : ces
--    noms-là sont ceux d'avant le cloisonnement.
--
-- 3. Les colonnes et la fonction existent :
--
--      SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'demandes_demo'
--         AND column_name IN ('ip_hmac', 'suspect', 'motifs_suspicion');
--      -- attendu : 3
--
--      SELECT proname, prosecdef FROM pg_proc
--       WHERE proname IN ('enregistrer_demande_demo', 'purger_empreintes_demo');
--      -- attendu : 2 lignes, prosecdef = true
--
-- 4. Le listage du bucket est refusé pour un visiteur anonyme, mais l'URL
--    publique d'une attestation déjà distribuée fonctionne toujours.
--    Depuis un navigateur en navigation privée :
--      - ouvrir l'URL publique d'une attestation  -> le PDF doit s'afficher
--      - appeler storage.list('certificates')     -> doit revenir vide
