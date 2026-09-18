-- Lot 5 du parcours de raccordement : les alertes.
-- Appliquer via : npm run db:apply — ou le SQL Editor Supabase.
--
-- Référence : docs/PARCOURS-RACCORDEMENT.md, « Si l'informaticien bloque »
--
-- ============================================================================
-- POURQUOI DES ALERTES, ET PAS SEULEMENT UN ÉCRAN
-- ============================================================================
--
-- ⚠ UN BLOCAGE SILENCIEUX EST LE PLUS FRÉQUENT ET LE PLUS COÛTEUX. Le bouton
--   « je suis bloqué » ne couvre que ceux qui le disent. Ceux qui ferment
--   l'onglet — la majorité — ne laissent aucune trace, et personne n'apprend
--   jamais pourquoi le raccordement s'est arrêté. Ces deux alertes existent
--   pour eux.
--
-- ⚠ ELLES NE SE RÉPÈTENT PAS. Une alerte qui repart toutes les minutes finit
--   dans un filtre, et c'est alors la vraie qu'on ne voit plus. Chaque motif
--   est daté sur la ligne, et la condition l'exclut ensuite.
--
-- Cette migration est idempotente.

-- =============================================================================
-- 1. Ce qui a déjà été signalé
-- =============================================================================

ALTER TABLE raccordement_jetons
  ADD COLUMN IF NOT EXISTS alerte_inertie_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerte_propagation_at TIMESTAMPTZ;

COMMENT ON COLUMN raccordement_jetons.alerte_inertie_at IS
  'Lien ouvert mais sans progression depuis 48 h : alerte envoyée à cette date. '
  'Non NULL = ne plus alerter pour ce motif sur ce lien.';

COMMENT ON COLUMN raccordement_jetons.alerte_propagation_at IS
  'Périmètre posé mais restriction non constatée depuis 4 h : idem.';

ALTER TABLE raccordement_blocages
  ADD COLUMN IF NOT EXISTS notifie_at TIMESTAMPTZ;

COMMENT ON COLUMN raccordement_blocages.notifie_at IS
  'Le signalement a été transmis par email. NULL = pas encore transmis. '
  'Distinct de `traite_at`, qui dit que le problème est RÉSOLU.';

-- =============================================================================
-- 2. Ce qu'il faut signaler maintenant
-- =============================================================================

-- ⚠ ELLE MARQUE EN MÊME TEMPS QU'ELLE REND, ET C'EST INDISPENSABLE. Le worker
--   tourne toutes les minutes et peut se doubler : lire puis marquer en deux
--   appels ferait partir la même alerte deux fois. Ici la mise à jour EST la
--   sélection — `RETURNING` ne rend que les lignes que cet appel a marquées.
--
-- ⚠ LES TROIS MOTIFS SORTENT PAR LA MÊME PORTE. Un worker qui aurait trois
--   requêtes à appeler en oublierait une le jour où on en ajoute une
--   quatrième. Le `type` dit lequel, et l'appelant choisit le texte.
CREATE OR REPLACE FUNCTION public.alertes_raccordement_a_envoyer()
RETURNS TABLE (
  type TEXT,
  company_id UUID,
  societe_nom TEXT,
  dirigeant_email TEXT,
  destinataire_email TEXT,
  jeton TEXT,
  detail TEXT,
  depuis TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ---- 1. Un blocage signalé, pas encore transmis ---------------------------
  RETURN QUERY
  WITH pris AS (
    UPDATE raccordement_blocages r
       SET notifie_at = now()
     WHERE r.id IN (
       SELECT id FROM raccordement_blocages
        WHERE notifie_at IS NULL
        ORDER BY signale_at
        LIMIT 20
        FOR UPDATE SKIP LOCKED
     )
    RETURNING r.*
  )
  SELECT 'blocage', p.company_id, c.nom, c.email_responsable,
         j.destinataire_email, j.jeton,
         p.motif || COALESCE(' — ' || p.texte_libre, '')
                 || COALESCE(' [' || p.erreur_technique || ']', ''),
         p.signale_at
    FROM pris p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN raccordement_jetons j ON j.id = p.jeton_id;

  -- ---- 2. Lien ouvert, aucune progression depuis 48 h -----------------------
  --
  -- ⚠ « AUCUNE PROGRESSION » = AUCUN ACCORD MICROSOFT. C'est le seul jalon
  --   qu'on sache dater sans ambiguïté. Quelqu'un qui aurait donné l'accord
  --   puis calé plus loin est couvert par l'alerte 3.
  RETURN QUERY
  WITH pris AS (
    UPDATE raccordement_jetons j
       SET alerte_inertie_at = now()
     WHERE j.id IN (
       SELECT jj.id FROM raccordement_jetons jj
        WHERE jj.revoque_at IS NULL
          AND jj.termine_at IS NULL
          AND jj.expire_at > now()
          AND jj.ouvert_at IS NOT NULL
          AND jj.ouvert_at < now() - INTERVAL '48 hours'
          AND jj.alerte_inertie_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM microsoft_tenants t WHERE t.company_id = jj.company_id
          )
        ORDER BY jj.ouvert_at
        LIMIT 20
        FOR UPDATE SKIP LOCKED
     )
    RETURNING j.*
  )
  SELECT 'inertie', p.company_id, c.nom, c.email_responsable,
         p.destinataire_email, p.jeton,
         'Lien ouvert, accord Microsoft toujours pas donné.',
         p.ouvert_at
    FROM pris p
    JOIN companies c ON c.id = p.company_id;

  -- ---- 3. Périmètre posé, restriction non constatée depuis 4 h --------------
  --
  -- ⚠ QUATRE HEURES, PAS UNE. La propagation Microsoft en demande environ une ;
  --   alerter à une heure ferait partir un signalement à chaque raccordement
  --   normal, et c'est ainsi qu'une alerte devient du bruit. Quatre heures
  --   laissent passer une propagation lente, une pause déjeuner et un aller-
  --   retour de mails.
  RETURN QUERY
  WITH pris AS (
    UPDATE raccordement_jetons j
       SET alerte_propagation_at = now()
     WHERE j.id IN (
       SELECT jj.id FROM raccordement_jetons jj
        WHERE jj.revoque_at IS NULL
          AND jj.termine_at IS NULL
          AND jj.alerte_propagation_at IS NULL
          AND EXISTS (
            SELECT 1 FROM microsoft_tenants t
             JOIN boites_surveillees b ON b.tenant_uid = t.id AND b.choisie
            WHERE t.company_id = jj.company_id
              AND b.created_at < now() - INTERVAL '4 hours'
          )
          AND NOT EXISTS (
            SELECT 1 FROM microsoft_tenants t
             JOIN boites_surveillees b ON b.tenant_uid = t.id
            WHERE t.company_id = jj.company_id AND b.actif
          )
        LIMIT 20
        FOR UPDATE SKIP LOCKED
     )
    RETURNING j.*
  )
  SELECT 'propagation', p.company_id, c.nom, c.email_responsable,
         p.destinataire_email, p.jeton,
         'Périmètre posé, mais la restriction n''a jamais été constatée.',
         p.ouvert_at
    FROM pris p
    JOIN companies c ON c.id = p.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.alertes_raccordement_a_envoyer()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertes_raccordement_a_envoyer() TO service_role;

-- =============================================================================
-- 3. Vérification
-- =============================================================================
--
-- Ce qui partirait maintenant, SANS le marquer — à lancer en lecture seule
-- dans une transaction annulée, sinon l'appel consomme les alertes :
--
--   BEGIN;
--     SELECT type, societe_nom, destinataire_email, detail
--       FROM alertes_raccordement_a_envoyer();
--   ROLLBACK;
--
-- ⚠ LE `ROLLBACK` N'EST PAS UNE PRÉCAUTION DE STYLE. Sans lui, l'appel marque
--   les lignes comme signalées et les vraies alertes ne partiront jamais.

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
--   DROP FUNCTION IF EXISTS public.alertes_raccordement_a_envoyer();
--   ALTER TABLE raccordement_blocages DROP COLUMN IF EXISTS notifie_at;
--   ALTER TABLE raccordement_jetons
--     DROP COLUMN IF EXISTS alerte_propagation_at,
--     DROP COLUMN IF EXISTS alerte_inertie_at;
--
-- Effet : les alertes cessent. Rien d'autre ne change — ni le parcours, ni la
-- surveillance. Les signalements déjà écrits restent lisibles à l'écran.
