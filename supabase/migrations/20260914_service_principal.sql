-- L'ObjectId du service principal, pour sortir Microsoft.Graph du script
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- CE QUI A ÉTÉ CONSTATÉ SUR UN LOCATAIRE RÉEL. Le script de restriction
-- cherchait l'ObjectId du service principal de Safentreprise avec
-- Get-MgServicePrincipal, c'est-à-dire en imposant le module
-- Microsoft.Graph.Applications à l'administrateur du client :
--
--   • le module 2.39 ne se charge pas en PowerShell 5.1 — TypeLoadException à
--     l'Import-Module — il oblige donc à installer PowerShell 7 ;
--   • une fois installé, il entre en conflit avec WAM et fait échouer
--     Connect-ExchangeOnline sur une NullReferenceException ;
--   • et le script appelait Get-MgServicePrincipal sans jamais avoir appelé
--     Connect-MgGraph : il n'aurait de toute façon pas fonctionné.
--
-- Demander à l'administrateur d'une PME d'installer PowerShell 7 et un module
-- Graph pour lire UN identifiant que nous pouvons lire nous-mêmes n'est pas
-- défendable. Nous le lisons donc côté serveur, une fois, et nous l'écrivons
-- en dur dans le script.
--
-- CE QUE ÇA NE CHANGE PAS. Aucune permission supplémentaire n'est demandée au
-- client : Microsoft documente qu'un service principal peut lire ses propres
-- détails sans permission d'application. Nous ne lisons que nous-mêmes.

-- =============================================================================
-- 1. La colonne
-- =============================================================================

ALTER TABLE microsoft_tenants
  ADD COLUMN IF NOT EXISTS sp_object_id TEXT,
  ADD COLUMN IF NOT EXISTS sp_object_id_at TIMESTAMPTZ;

COMMENT ON COLUMN microsoft_tenants.sp_object_id IS
  'ObjectId du service principal de Safentreprise dans l''annuaire du client. Exigé par New-ServicePrincipal côté Exchange, lu par nos soins après le consentement, et injecté dans le script de restriction.';

-- =============================================================================
-- 2. L'enregistrer
-- =============================================================================

-- Appelée par la route de consentement juste après la preuve, et par la route
-- de restriction en rattrapage pour les locataires raccordés avant cette
-- migration.
CREATE OR REPLACE FUNCTION public.enregistrer_sp_graph(
  p_tenant_uid UUID,
  p_sp_object_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un identifiant vide effacerait celui qui fonctionne. On refuse plutôt que
  -- d'écrire un NULL qui casserait le script à la génération suivante.
  IF p_sp_object_id IS NULL OR btrim(p_sp_object_id) = '' THEN
    RAISE EXCEPTION 'Identifiant de service principal vide.';
  END IF;

  UPDATE microsoft_tenants
     SET sp_object_id = btrim(p_sp_object_id),
         sp_object_id_at = now()
   WHERE id = p_tenant_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locataire % inconnu.', p_tenant_uid;
  END IF;
END;
$$;

-- ⚠ SERVICE_ROLE SEULEMENT. L'identifiant écrit ici finit dans un script que
--   le client exécute en administrateur Exchange, et qui attribue un rôle à ce
--   service principal. Laisser un client l'écrire reviendrait à le laisser
--   désigner l'application à qui son organisation accorde Mail.ReadWrite.
REVOKE ALL ON FUNCTION public.enregistrer_sp_graph(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_sp_graph(UUID, TEXT) TO service_role;
