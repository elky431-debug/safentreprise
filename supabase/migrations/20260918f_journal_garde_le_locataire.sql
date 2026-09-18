-- Le journal d'accès garde ses références, même après une suppression.
-- Appliquer via : npm run db:apply — ou le SQL Editor Supabase.
--
-- Référence : docs/JOURNALISATION-ACCES.md, § 2.4
--
-- ============================================================================
-- LE DÉFAUT
-- ============================================================================
--
-- `sceller_journal()` calcule l'empreinte quotidienne sur le contenu exact des
-- lignes, et `company_id` comme `tenant_uid` en font partie :
--
--     j.id || '|' || j.at || '|' || j.acteur || '|' ||
--     COALESCE(j.tache, '') || '|' || COALESCE(j.company_id::text, '') || '|' ||
--     COALESCE(j.tenant_uid::text, '') || '|' || j.ressource || '|' || …
--
-- Or les deux colonnes portaient `ON DELETE SET NULL`. Supprimer un locataire
-- Microsoft — ou une société — passait donc ces colonnes à NULL sur des lignes
-- DÉJÀ SCELLÉES. `verifier_sceaux_journal()` aurait alors rendu « JOURNAL
-- ALTÉRÉ » sur chacun des jours concernés, et il n'existe aucun rattrapage :
-- `journal_sceaux` ne se rescelle pas, et sa suppression romprait la chaîne.
--
-- ⚠ CE N'EST PAS UN AMÉNAGEMENT POUR UN TEST. C'est le comportement au premier
--   départ de client : celui qui exerce son droit à l'effacement détruirait du
--   même geste la preuve que nous avons respecté nos obligations sur les onze
--   mois précédents. Le défaut se serait révélé exactement au pire moment.
--
-- ============================================================================
-- LE CORRECTIF, ET POURQUOI IL EST DANS CE SENS
-- ============================================================================
--
-- Un journal d'accès consigne CE QUI S'EST PASSÉ. Une ligne de septembre dit
-- « le worker a lu telle boîte du locataire X » ; cette phrase reste vraie
-- après la suppression du locataire X. C'est la clé étrangère qui avait tort
-- de vouloir la corriger, pas le journal d'avoir gardé l'identifiant.
--
-- ⚠ AUCUNE RÉFÉRENCE PENDANTE NE PEUT NAÎTRE DE CETTE SUPPRESSION.
--   `journaliser()` résout `tenant_uid` en interrogeant `microsoft_tenants` à
--   l'instant de l'écriture, et ramène à NULL une société absente de
--   `companies` (défense 1 de 20260918_journal_resilient.sql). Ces deux
--   protections RESTENT EN PLACE et restent nécessaires : elles garantissent
--   qu'aucune valeur inventée n'entre. La seule façon d'obtenir une référence
--   sans cible est désormais la suppression ultérieure de la cible — ce qui
--   est précisément le fait que le journal doit conserver.
--
-- ⚠ CE N'EST PAS UN RELÂCHEMENT D'INTÉGRITÉ AILLEURS. Toutes les autres clés
--   étrangères vers `microsoft_tenants` et `companies` restent en CASCADE :
--   supprimer un locataire emporte toujours ses boîtes, ses abonnements, sa
--   file et ses analyses. Seul le journal survit, et c'est son rôle.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Les deux clés étrangères qui réécrivaient le passé
-- =============================================================================

ALTER TABLE journal_acces
  DROP CONSTRAINT IF EXISTS journal_acces_tenant_uid_fkey,
  DROP CONSTRAINT IF EXISTS journal_acces_company_id_fkey;

COMMENT ON COLUMN journal_acces.tenant_uid IS
  'Locataire Microsoft au moment de la lecture. Volontairement SANS clé '
  'étrangère : cette valeur entre dans l''empreinte du sceau quotidien et ne '
  'doit jamais changer, même si le locataire est supprimé ensuite. '
  'journaliser() ne la pose qu''après l''avoir résolue contre microsoft_tenants.';

COMMENT ON COLUMN journal_acces.company_id IS
  'Société au moment de la lecture. Volontairement SANS clé étrangère, pour la '
  'même raison que tenant_uid. journaliser() ramène à NULL une société absente '
  'de companies avant d''écrire : aucune valeur inventée n''entre par ici.';

-- =============================================================================
-- 2. Vérification
-- =============================================================================
--
-- Doit rendre zéro ligne, avant comme après une suppression de locataire :
--
--   SELECT * FROM verifier_sceaux_journal();
--
-- Et pour constater que les deux contraintes ont bien disparu :
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'journal_acces'::regclass AND contype = 'f';
--
-- ⚠ CETTE SECONDE REQUÊTE DOIT RENDRE ZÉRO LIGNE. Si elle en rend une, la
--   remise à zéro d'un locataire casserait les sceaux : ne pas supprimer.

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
-- ⚠ À NE FAIRE QUE SI AUCUNE SOCIÉTÉ NI AUCUN LOCATAIRE N'A ÉTÉ SUPPRIMÉ
--   DEPUIS. Sinon les `ADD CONSTRAINT` échoueront sur les lignes devenues
--   pendantes — et les satisfaire en les vidant romprait les sceaux, c'est-à-
--   dire exactement ce que cette migration empêche.
--
--   ALTER TABLE journal_acces
--     ADD CONSTRAINT journal_acces_tenant_uid_fkey
--       FOREIGN KEY (tenant_uid) REFERENCES microsoft_tenants(id) ON DELETE SET NULL,
--     ADD CONSTRAINT journal_acces_company_id_fkey
--       FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
