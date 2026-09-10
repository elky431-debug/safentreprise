-- Deux colonnes pour les réponses du formulaire de démonstration
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : le formulaire pose huit questions, la table n'en stockait que cinq.
-- L'effectif et l'usage de Microsoft 365 étaient repliés en tête du champ
-- `message`, sous forme de texte libre — donc impossibles à filtrer ou à
-- trier. Ils prennent chacun leur colonne.
--
-- ⚠ APPLIQUER CETTE MIGRATION AVANT DE DÉPLOYER LE CODE QUI L'ACCOMPAGNE.
--   La route /api/demo insère désormais ces deux colonnes. Si elle tourne
--   contre une base qui ne les a pas encore, PostgREST refuse l'insertion.
--   La route sait retomber sur l'ancien format dans ce cas précis — le
--   formulaire continue donc de fonctionner — mais l'effectif et la réponse
--   Microsoft 365 repartent alors dans le champ `message`, et une ligne
--   d'erreur est écrite dans les logs. Cet ordre reste le bon.

ALTER TABLE demandes_demo
  ADD COLUMN IF NOT EXISTS effectif TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_365 TEXT;

COMMENT ON COLUMN demandes_demo.effectif IS
  'Tranche d''effectif choisie dans le formulaire (liste fermée, voir src/lib/demo.ts).';

COMMENT ON COLUMN demandes_demo.microsoft_365 IS
  'Usage déclaré de Microsoft 365 (liste fermée, voir src/lib/demo.ts).';

-- ⚠ AUCUNE CONTRAINTE CHECK SUR CES DEUX COLONNES, ET C'EST VOULU. Les listes
--   de choix vivent dans src/lib/demo.ts et sont vérifiées côté serveur avant
--   l'insertion. Les recopier ici en CHECK obligerait à une migration à chaque
--   ajout d'une tranche d'effectif, et ferait échouer l'enregistrement d'une
--   demande légitime le jour où les deux listes divergeraient. Sur une table
--   de prise de contact, perdre un prospect coûte plus cher qu'accepter une
--   valeur inattendue.

-- ⚠ COLONNES NULLABLES. Les demandes déjà enregistrées n'ont pas ces valeurs
--   — elles sont dans leur champ `message`, et y restent. Aucune reprise n'est
--   tentée ici : le format du texte libre n'est pas assez fiable pour être
--   redécoupé automatiquement.

-- =============================================================================
-- Vérification
-- =============================================================================

-- Les deux colonnes sont-elles en place ?
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'demandes_demo'
--      AND column_name IN ('effectif', 'microsoft_365')
--    ORDER BY column_name;
--
-- Deux lignes attendues, toutes deux en « text » et « YES ».
