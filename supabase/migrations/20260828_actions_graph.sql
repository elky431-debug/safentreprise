-- Actions posées sur les messages : catégorie et bannière
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- OBJET : garder la trace de ce qu'on a MODIFIÉ dans la boîte du client, pour
-- pouvoir tout défaire.
--
-- CE QU'ON NE STOCKE PAS : le corps d'origine. La restauration ne s'appuie pas
-- sur une sauvegarde mais sur une DÉCOUPE — la bannière est encadrée par deux
-- marqueurs, on retire ce qu'il y a entre eux, et ce qui reste est le corps
-- d'origine au caractère près. Cette table ne sert qu'à savoir QUELS messages
-- ont été touchés.
--
-- C'est la seule écriture irréversible du produit. Un faux positif défigure
-- définitivement le mail d'un vrai fournisseur : tout ici est conçu pour que
-- l'annulation soit possible à tout moment, en masse, sans rien d'autre que
-- l'identifiant du message.

-- =============================================================================
-- 1. Trace de l'action
-- =============================================================================

ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS categorie TEXT,
  ADD COLUMN IF NOT EXISTS categorie_posee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banniere_posee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restauree_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_erreur TEXT;

-- Retrouver vite ce qui reste à défaire.
CREATE INDEX IF NOT EXISTS idx_analyses_a_restaurer
  ON graph_analyses(company_id)
  WHERE restauree_at IS NULL
    AND (banniere_posee_at IS NOT NULL OR categorie_posee_at IS NOT NULL);

-- =============================================================================
-- 2. Enregistrer une action
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marquer_action_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_categorie TEXT,
  p_banniere_posee BOOLEAN,
  p_erreur TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET categorie = COALESCE(p_categorie, categorie),
         categorie_posee_at = CASE
           WHEN p_categorie IS NOT NULL THEN now() ELSE categorie_posee_at END,
         banniere_posee_at = CASE
           WHEN p_banniere_posee THEN now() ELSE banniere_posee_at END,
         action_erreur = p_erreur,
         -- Une nouvelle action annule une restauration antérieure.
         restauree_at = CASE
           WHEN p_categorie IS NOT NULL OR p_banniere_posee THEN NULL
           ELSE restauree_at END
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- =============================================================================
-- 3. Ce qu'il reste à défaire
-- =============================================================================

-- Renvoie tout ce dont le script de restauration a besoin pour appeler Graph :
-- le locataire et l'identifiant de boîte viennent de NOS enregistrements.
--
-- p_company_id NULL = toutes les sociétés. p_message_id renseigné = un seul
-- message, même s'il a déjà été restauré (pour pouvoir réessayer).
CREATE OR REPLACE FUNCTION public.messages_a_restaurer(
  p_company_id UUID DEFAULT NULL,
  p_message_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id TEXT,
  company_id UUID,
  tenant_id TEXT,
  graph_user_id TEXT,
  upn TEXT,
  categorie TEXT,
  banniere_posee BOOLEAN,
  analyse_at TIMESTAMPTZ,
  niveau TEXT,
  objet TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.message_id, a.company_id, t.tenant_id, b.graph_user_id, b.upn,
         a.categorie, a.banniere_posee_at IS NOT NULL, a.analyse_at,
         a.niveau, a.objet
    FROM graph_analyses a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE (p_company_id IS NULL OR a.company_id = p_company_id)
     AND (
       -- Un message nommé : on le rend même s'il est déjà marqué restauré.
       (p_message_id IS NOT NULL AND a.message_id = p_message_id)
       OR (
         p_message_id IS NULL
         AND a.restauree_at IS NULL
         AND (a.banniere_posee_at IS NOT NULL OR a.categorie_posee_at IS NOT NULL)
       )
     )
   ORDER BY a.analyse_at DESC;
$$;

-- =============================================================================
-- 4. Marquer restauré
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marquer_restauration_graph(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses
     SET restauree_at = now(),
         categorie_posee_at = NULL,
         banniere_posee_at = NULL,
         categorie = NULL,
         action_erreur = NULL
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- =============================================================================
-- 5. Droits
-- =============================================================================

REVOKE ALL ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.messages_a_restaurer(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marquer_restauration_graph(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.marquer_action_graph(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.messages_a_restaurer(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.marquer_restauration_graph(UUID, TEXT) TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- Ce qui a été modifié et n'a pas été défait :
--
--   SELECT analyse_at, niveau, categorie,
--          banniere_posee_at IS NOT NULL AS banniere,
--          expediteur_email, objet
--     FROM graph_analyses
--    WHERE restauree_at IS NULL
--      AND (banniere_posee_at IS NOT NULL OR categorie_posee_at IS NOT NULL)
--    ORDER BY analyse_at DESC;
--
-- Tout défaire : npm run graph:restaurer
