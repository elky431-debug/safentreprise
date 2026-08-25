-- Notifications Microsoft Graph — tables et file d'attente
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.
--
-- OBJET : recevoir les notifications de Microsoft quand un mail arrive dans
-- la boîte d'un client, et les mettre en file pour un traitement différé.
--
-- POURQUOI UNE FILE. Microsoft attend une réponse 2xx en 3 secondes. Au-delà
-- il retente (jusqu'à 4 h), mais si plus de 15 % des réponses dépassent 10
-- secondes sur une fenêtre de 10 minutes, il passe le point d'entrée en état
-- « drop » et JETTE les notifications pendant 10 minutes. Le webhook ne fait
-- donc rien d'autre qu'écrire une ligne ici.
--
-- Cette migration est idempotente : elle peut être rejouée sans dommage.

-- =============================================================================
-- 1. Locataires Microsoft 365 raccordés
-- =============================================================================

CREATE TABLE IF NOT EXISTS microsoft_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Identifiant du locataire Entra ID (GUID).
  tenant_id TEXT NOT NULL UNIQUE,
  -- Qui a accordé le consentement administrateur, et quand.
  consenti_par TEXT,
  consenti_at TIMESTAMPTZ,
  statut TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'revoque', 'erreur')),
  derniere_erreur TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ms_tenants_company
  ON microsoft_tenants(company_id);

-- =============================================================================
-- 2. Boîtes surveillées
-- =============================================================================

-- Il n'existe pas d'abonnement à l'échelle d'un locataire : on s'abonne boîte
-- par boîte. Une ligne par boîte réellement surveillée.
CREATE TABLE IF NOT EXISTS boites_surveillees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_uid UUID NOT NULL REFERENCES microsoft_tenants(id) ON DELETE CASCADE,
  -- Identifiant Graph de l'utilisateur, et son adresse principale.
  graph_user_id TEXT NOT NULL,
  upn TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  -- Curseur de la requête delta, pour rattraper les messages manqués.
  delta_link TEXT,
  delta_maj_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_uid, graph_user_id)
);

CREATE INDEX IF NOT EXISTS idx_boites_company
  ON boites_surveillees(company_id) WHERE actif;

-- =============================================================================
-- 3. Abonnements Graph
-- =============================================================================

CREATE TABLE IF NOT EXISTS graph_abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boite_id UUID NOT NULL REFERENCES boites_surveillees(id) ON DELETE CASCADE,
  -- Identifiant renvoyé par Graph à la création.
  subscription_id TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL,
  -- Secret partagé : Graph le renvoie dans chaque notification. C'est la SEULE
  -- authentification d'une notification simple — Graph ne signe pas ces
  -- charges utiles. À tirer aléatoirement sur 256 bits minimum.
  client_state TEXT NOT NULL,
  expire_at TIMESTAMPTZ NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'expire', 'supprime', 'erreur')),
  tentatives_renouvellement INTEGER NOT NULL DEFAULT 0,
  derniere_erreur TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Le renouvellement balaie par date d'expiration.
CREATE INDEX IF NOT EXISTS idx_abonnements_expiration
  ON graph_abonnements(expire_at) WHERE statut = 'actif';

-- =============================================================================
-- 4. File d'attente des notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS graph_file_attente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boite_id UUID NOT NULL REFERENCES boites_surveillees(id) ON DELETE CASCADE,
  abonnement_id UUID REFERENCES graph_abonnements(id) ON DELETE SET NULL,

  -- Identifiant Graph du message. La clé d'idempotence.
  message_id TEXT NOT NULL,

  -- Chemin brut annoncé par la notification. Conservé pour le diagnostic
  -- UNIQUEMENT : il vient de l'extérieur et ne doit jamais servir à construire
  -- un appel. La boîte à interroger est celle de boite_id, la nôtre.
  resource_brut TEXT,
  change_type TEXT,

  -- D'où vient la ligne : notification temps réel, ou rattrapage delta.
  origine TEXT NOT NULL DEFAULT 'webhook'
    CHECK (origine IN ('webhook', 'delta')),

  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'traite', 'echec', 'ignore')),
  tentatives INTEGER NOT NULL DEFAULT 0,
  erreur TEXT,

  recu_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ,

  -- Un message n'est traité qu'une fois, quelle que soit l'origine et quel
  -- que soit le nombre de notifications reçues pour lui.
  UNIQUE (company_id, message_id)
);

-- Le worker draine les plus anciens d'abord.
CREATE INDEX IF NOT EXISTS idx_file_a_traiter
  ON graph_file_attente(recu_at) WHERE statut = 'en_attente';

-- =============================================================================
-- 5. Row Level Security
-- =============================================================================

-- Lecture seule pour le dirigeant, sur SA société. Aucune politique d'écriture :
-- tout passe par les fonctions SECURITY DEFINER ci-dessous.

ALTER TABLE microsoft_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ms_tenants_select_own ON microsoft_tenants;
CREATE POLICY ms_tenants_select_own ON microsoft_tenants FOR SELECT
  USING (company_id = public.get_my_company_id());

ALTER TABLE boites_surveillees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boites_select_own ON boites_surveillees;
CREATE POLICY boites_select_own ON boites_surveillees FOR SELECT
  USING (company_id = public.get_my_company_id());

ALTER TABLE graph_abonnements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abonnements_select_own ON graph_abonnements;
CREATE POLICY abonnements_select_own ON graph_abonnements FOR SELECT
  USING (company_id = public.get_my_company_id());

ALTER TABLE graph_file_attente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS file_select_own ON graph_file_attente;
CREATE POLICY file_select_own ON graph_file_attente FOR SELECT
  USING (company_id = public.get_my_company_id());

-- =============================================================================
-- 6. Mise en file d'une notification
-- =============================================================================

-- Appelée par /api/microsoft/webhook, avec la clé anonyme.
--
-- La vérification du clientState se fait ICI, dans la même requête que
-- l'insertion : un seul aller-retour réseau au lieu de deux, ce qui compte
-- dans un budget de 3 secondes.
--
-- Le company_id et la boîte viennent de NOTRE enregistrement d'abonnement,
-- jamais de la notification. Si un clientState fuitait, une notification
-- forgée ne pourrait pas nous faire lire une autre boîte du locataire.
CREATE OR REPLACE FUNCTION public.enregistrer_notification_graph(
  p_subscription_id TEXT,
  p_client_state TEXT,
  p_message_id TEXT,
  p_resource TEXT DEFAULT NULL,
  p_change_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  abonnement RECORD;
  ligne_id UUID;
BEGIN
  IF p_subscription_id IS NULL OR p_client_state IS NULL OR p_message_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.id, a.company_id, a.boite_id, a.client_state
    INTO abonnement
    FROM graph_abonnements a
   WHERE a.subscription_id = p_subscription_id
     AND a.statut = 'actif'
   LIMIT 1;

  -- Abonnement inconnu, ou secret qui ne correspond pas : on ne dit pas
  -- lequel des deux, et on n'enregistre rien.
  IF abonnement.id IS NULL OR abonnement.client_state <> p_client_state THEN
    RETURN NULL;
  END IF;

  INSERT INTO graph_file_attente (
    company_id, boite_id, abonnement_id, message_id,
    resource_brut, change_type, origine
  )
  VALUES (
    abonnement.company_id, abonnement.boite_id, abonnement.id, p_message_id,
    left(p_resource, 500), left(p_change_type, 40), 'webhook'
  )
  -- Message déjà en file : on ne crée pas de doublon, et on renvoie quand
  -- même l'identifiant pour que l'appelant sache que c'est pris en compte.
  ON CONFLICT (company_id, message_id) DO UPDATE
    SET recu_at = graph_file_attente.recu_at
  RETURNING id INTO ligne_id;

  RETURN ligne_id;
END;
$$;

COMMENT ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Vérifie le clientState d''un abonnement Graph et met le message en file. Renvoie NULL si l''abonnement est inconnu ou le secret incorrect.';

-- Appelée avec la clé anonyme depuis le webhook, comme les routes de
-- l'extension. Le secret exigé est le clientState, pas la clé.
REVOKE ALL ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_notification_graph(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

-- =============================================================================
-- 7. Vérification
-- =============================================================================

-- Les quatre tables existent-elles, et la RLS est-elle active ?
--
--   SELECT tablename, rowsecurity FROM pg_tables
--    WHERE tablename IN ('microsoft_tenants','boites_surveillees',
--                        'graph_abonnements','graph_file_attente');
--
-- Ce qui attend d'être traité :
--
--   SELECT message_id, origine, statut, recu_at
--     FROM graph_file_attente
--    ORDER BY recu_at DESC LIMIT 20;
