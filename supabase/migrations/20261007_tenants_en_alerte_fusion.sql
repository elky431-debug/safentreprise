-- =============================================================================
-- CORRECTIF URGENT — `tenants_en_alerte` restaurée, et refermée
-- Appliquer via le SQL Editor Supabase, AVANT toute autre chose. Idempotente.
-- =============================================================================
--
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠ CE QUE `20261006` A CASSÉ, ET POURQUOI IL FAUT L'APPLIQUER TOUT DE SUITE.
--
--   `tenants_en_alerte` existait DÉJÀ depuis `20260907_raccordement.sql:454`.
--   La migration 20261006 en a écrit une SECONDE définition, plus pauvre, sous
--   le même nom, sans que personne ne s'en aperçoive. Postgres a refusé le
--   remplacement (42P16, « cannot drop columns from view ») ; le contournement
--   appliqué — un DROP VIEW devant — a fait passer la version pauvre.
--
--   1. FUITE ENTRE SOCIÉTÉS — c'est le point urgent. L'originale portait
--      `WITH (security_invoker = true)`, la nouvelle non. `microsoft_tenants`
--      est protégée par RLS (`ms_tenants_select_own`, 20260825:136-138), mais
--      une vue SANS security_invoker s'exécute avec les droits de son
--      PROPRIÉTAIRE, pas de celui qui l'interroge : la politique ne s'applique
--      plus. Et `GRANT SELECT ... TO authenticated` est posé sur cette vue.
--      Résultat : tout client connecté pouvait lire le locataire, le statut et
--      la dernière erreur de TOUTES les sociétés.
--
--   2. CAS DE CONTRÔLE PERDUS. L'originale distinguait « RACCORDEMENT
--      INACHEVÉ », « PÉRIMÈTRE MODIFIÉ » et « aucune boîte active » — c'est-à-
--      dire exactement les états où un client attend son produit sans être
--      protégé. La version pauvre ne voyait que la santé du consentement.
--
--   3. COLONNES PERDUES : consenti_par, consenti_at, verifie_at,
--      restriction_verifiee_at, boites_actives.
--
-- ⚠ CETTE MIGRATION FUSIONNE, ELLE NE CHOISIT PAS. Les deux définitions
--   disaient des choses vraies et différentes : l'une surveille l'AVANCEMENT du
--   raccordement, l'autre sa SANTÉ. Une vue de contrôle qui perd la moitié de
--   ses cas ne vaut rien.
--
-- ⚠ LA LEÇON, ET ELLE ÉTAIT DÉJÀ ÉCRITE. `CREATE OR REPLACE VIEW` ne sait ni
--   retirer ni renommer une colonne. C'est le même piège que
--   `repartition_diagnostics` en 20261005, où il avait fallu DROP puis CREATE
--   pour renommer `avec_email`. Ici il a masqué bien pire qu'un échec : une
--   collision de noms entre deux migrations. AVANT DE CRÉER UNE VUE, VÉRIFIER
--   QU'ELLE N'EXISTE PAS DÉJÀ :
--
--     grep -rn "VIEW public.<nom>" supabase/migrations/
-- ─────────────────────────────────────────────────────────────────────────

-- DROP obligatoire : on change à la fois les colonnes et l'option de sécurité.
DROP VIEW IF EXISTS public.tenants_en_alerte;

-- ⚠ `security_invoker = true` N'EST PAS FACULTATIF. Sans lui, la RLS de
--   `microsoft_tenants` cesse de s'appliquer et cette vue devient une fuite
--   entre sociétés. Ne jamais l'enlever, et ne jamais recréer cette vue sans
--   la relire.
CREATE VIEW public.tenants_en_alerte
WITH (security_invoker = true) AS
  SELECT t.id AS tenant_uid,
         t.company_id,
         c.nom AS societe,
         t.tenant_id,
         t.statut,
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
           -- --- Santé du consentement, écrite par /api/microsoft/sante ------
           WHEN t.statut = 'revoque' THEN
             'AUTORISATION RETIRÉE — plus aucun message n''est analysé depuis ' ||
             COALESCE(t.sante_bascule_at::TEXT, 'une date inconnue') ||
             '. Le client doit redonner l''accord administrateur. ' ||
             COALESCE(t.derniere_erreur, '')
           WHEN t.statut = 'erreur' THEN
             'Santé incertaine (' || COALESCE(t.echecs_sante, 0) ||
             '/3 refus d''autorisation) — ' ||
             COALESCE(t.derniere_erreur, 'sans détail')

           -- --- Avancement du raccordement, restauré de 20260907 ------------
           --
           -- Deux situations très différentes derrière « non vérifié ».
           --
           -- Un premier raccordement : aucune boîte n'est active, rien n'est
           -- surveillé, le client attend son produit.
           --
           -- Un périmètre modifié après coup : les boîtes déjà vérifiées
           -- RESTENT actives — les désactiver ouvrirait une fenêtre sans
           -- protection le temps que l'administrateur repasse son script.
           -- Seules les nouvelles attendent. Dire « rien n'est surveillé »
           -- serait faux, et une vue de contrôle qui dit faux ne vaut rien.
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

           -- --- La vérification elle-même ne tourne plus --------------------
           --
           -- ⚠ ON MESURE `sante_verifiee_at`, PAS `verifie_at`. Le second
           --   n'est écrit QUE sur un succès : un locataire en panne le
           --   garderait vieux pour toujours et déclencherait ce motif en
           --   plus du sien, sans rien apprendre. Le premier est écrit à
           --   chaque passage, réussi ou non — s'il vieillit, c'est la tâche
           --   planifiée qui est arrêtée, et l'absence d'alerte ressemblerait
           --   alors à « tout va bien ».
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
      OR t.restriction_verifiee_at IS NULL
      OR t.sante_verifiee_at IS NULL
      OR t.sante_verifiee_at < now() - INTERVAL '3 hours'
      OR NOT EXISTS (SELECT 1 FROM boites_surveillees b
                      WHERE b.tenant_uid = t.id AND b.actif);

COMMENT ON VIEW public.tenants_en_alerte IS
  'Locataires dont le raccordement est inachevé, retiré, en erreur, ou dont la santé n''est plus vérifiée. Doit rester vide.';

GRANT SELECT ON public.tenants_en_alerte TO authenticated, service_role;

-- =============================================================================
-- Vérification
-- =============================================================================
--
--   -- 1. La vue est refermée : security_invoker doit être actif.
--   SELECT c.relname,
--          COALESCE(
--            (SELECT o FROM unnest(c.reloptions) o
--              WHERE o LIKE 'security_invoker%'),
--            'ABSENT — LA VUE FUIT') AS securite
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'tenants_en_alerte';
--   -- Attendu : security_invoker=true
--
--   -- 2. Les colonnes restaurées sont revenues.
--   SELECT count(*) AS colonnes_restaurees
--     FROM information_schema.columns
--    WHERE table_name = 'tenants_en_alerte'
--      AND column_name IN ('consenti_par','consenti_at','verifie_at',
--                          'restriction_verifiee_at','boites_actives');
--   -- Attendu : 5
--
--   -- 3. La vue doit rester vide.
--   SELECT societe, statut, motif FROM tenants_en_alerte;
