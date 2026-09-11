-- Le déplacement qui force Outlook desktop à relire le corps modifié
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT QU'ON CORRIGE, ET IL ÉTAIT LE PLUS GRAVE DU PRODUIT.
--
-- Outlook pour Windows, en mode mis en cache, ne redemande JAMAIS un corps
-- de message qu'il a déjà téléchargé. Le worker modifie le message quelques
-- dizaines de secondes après sa réception ; le client, lui, l'a synchronisé
-- dans la seconde. Il gagne la course presque toujours.
--
-- Constaté sur deux messages, à treize minutes d'écart, même expéditeur :
--   • reçu Outlook FERMÉ  → bannière visible dans le client lourd
--   • reçu Outlook OUVERT → bannière absente, alors qu'OWA l'affichait
--
-- Autrement dit : des clients qui travaillent la boîte ouverte toute la
-- journée ne voyaient PRATIQUEMENT JAMAIS les bannières. Le produit posait
-- des avertissements que personne ne lisait, et ses propres compteurs
-- disaient que tout allait bien.
--
-- La cause n'est pas un défaut à corriger : `message.body` n'est modifiable
-- que sur un BROUILLON, Microsoft le documente. L'écriture est acceptée et
-- honorée par OWA, mais elle ne passe pas par le chemin qui signale aux
-- clients MAPI qu'un corps a changé.
--
-- LA PARADE : déplacer le message après l'avoir modifié. Un déplacement est,
-- côté MAPI, une suppression suivie d'une création — le message obtient un
-- NOUVEL IDENTIFIANT, pour lequel le client n'a aucun corps en cache. Il le
-- redescend, bannière comprise. Vérifié à la main avant d'écrire une ligne.
--
-- ⚠ ET C'EST UNE OPÉRATION SUPPORTÉE, contrairement à la modification du
--   corps. On cesse de s'appuyer sur un comportement non documenté.
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠ CE QUE CETTE MIGRATION PROTÈGE AVANT TOUT : LA RESTAURATION. Le
--   `message_id` est clé dans trois tables, et la restauration retrouve le
--   message par cet identifiant. Le perdre, c'est laisser un faux positif
--   défiguré à jamais — la garantie sur laquelle repose tout l'argumentaire
--   du produit. Tout ce qui suit existe pour que ça n'arrive pas.

-- =============================================================================
-- 1. Le dossier de service, par boîte
-- =============================================================================

-- ⚠ UN SOUS-DOSSIER VISIBLE DE LA BOÎTE DE RÉCEPTION, jamais la corbeille ni
--   les indésirables ni un dossier caché. Si le second déplacement échoue, le
--   message doit être là où son destinataire peut le voir et le remettre
--   lui-même. C'est le plancher de sécurité ; les trois autres couches
--   existent pour qu'on n'y descende jamais.
ALTER TABLE boites_surveillees
  ADD COLUMN IF NOT EXISTS dossier_service_id TEXT;

COMMENT ON COLUMN boites_surveillees.dossier_service_id IS
  'Identifiant Graph du sous-dossier de transit, créé une fois par boîte. Le message n''y séjourne qu''une fraction de seconde en fonctionnement normal.';

-- =============================================================================
-- 2. L'état du déplacement
-- =============================================================================

-- ⚠ L'INTENTION EST ÉCRITE AVANT L'ACTE. `deplacement_at` est posé avant le
--   premier déplacement et effacé après le retour. Toute ligne qui le porte
--   encore désigne un message peut-être resté dans le dossier de service : on
--   sait donc LESQUELS, sans avoir à fouiller la boîte.
ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS deplacement_at TIMESTAMPTZ;

-- Combien de fois ce message a été déplacé. Sert au diagnostic : un message
-- qui repart en boucle signale un webhook rejoué mal traité.
ALTER TABLE graph_analyses
  ADD COLUMN IF NOT EXISTS deplacements INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN graph_analyses.deplacement_at IS
  'Posé avant le déplacement, effacé après le retour en boîte de réception. Non NULL = déplacement en cours ou interrompu.';

CREATE INDEX IF NOT EXISTS idx_analyses_deplacement_en_cours
  ON graph_analyses(deplacement_at) WHERE deplacement_at IS NOT NULL;

-- =============================================================================
-- 3. Le renommage — une seule écriture, ou aucune
-- =============================================================================

-- ⚠ LES TROIS TABLES BASCULENT ENSEMBLE. `graph_file_attente`,
--   `graph_analyses` et `graph_corps_originaux` portent chacune une contrainte
--   d'unicité sur (company_id, message_id). Les renommer une par une depuis
--   l'application laisserait, en cas de panne au milieu, une sauvegarde de
--   corps orpheline — donc un message modifié dont l'original existe mais
--   n'est plus rattachable. Une fonction, une transaction, pas d'état
--   intermédiaire.
--
-- ⚠ ELLE EST IDEMPOTENTE. Rejouée avec un ancien identifiant déjà renommé,
--   elle ne trouve rien et ne fait rien. C'est ce qui permet à la passe de
--   réparation de la rappeler sans précaution.
CREATE OR REPLACE FUNCTION public.renommer_message_graph(
  p_company_id UUID,
  p_ancien_id TEXT,
  p_nouveau_id TEXT
)
RETURNS TABLE (table_modifiee TEXT, lignes INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF p_ancien_id IS NULL OR p_nouveau_id IS NULL OR p_ancien_id = p_nouveau_id THEN
    RETURN;
  END IF;

  -- ⚠ SI LE NOUVEL IDENTIFIANT EXISTE DÉJÀ, ON NE RENOMME PAS. C'est le cas
  --   du webhook rejoué : une seconde ligne d'analyse a pu être créée sous le
  --   nouvel identifiant avant qu'on arrive ici. Écraser ferait perdre l'une
  --   des deux ; on laisse l'appelant trancher (voir `fusionner_analyse_graph`).
  IF EXISTS (SELECT 1 FROM graph_analyses
              WHERE company_id = p_company_id AND message_id = p_nouveau_id) THEN
    table_modifiee := 'conflit'; lignes := 0; RETURN NEXT; RETURN;
  END IF;

  UPDATE graph_analyses
     SET message_id = p_nouveau_id,
         deplacement_at = NULL,
         deplacements = deplacements + 1
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_analyses'; lignes := v_n; RETURN NEXT;

  UPDATE graph_corps_originaux
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_corps_originaux'; lignes := v_n; RETURN NEXT;

  -- La file est la moins critique — une entrée orpheline finit par être
  -- purgée — mais la laisser sur l'ancien identifiant ferait retenter un
  -- message qui n'existe plus, et remplirait le journal d'échecs pour rien.
  UPDATE graph_file_attente
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = p_ancien_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  table_modifiee := 'graph_file_attente'; lignes := v_n; RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.renommer_message_graph(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renommer_message_graph(UUID, TEXT, TEXT)
  TO service_role;

-- =============================================================================
-- 4. Le webhook rejoué
-- =============================================================================

-- ⚠ LE PIÈGE QUE CE CHANTIER CRÉE, ET QU'IL FAUT DÉSAMORCER AVANT LA MISE EN
--   SERVICE. Déplacer un message fait apparaître un nouvel élément dans la
--   boîte de réception : Graph émet une notification, le message revient en
--   file, et le worker l'analyse une seconde fois — sous un identifiant
--   différent.
--
--   `enregistrer_analyse_graph` fait un ON CONFLICT (company_id, message_id).
--   Sous un NOUVEL identifiant, il ne trouve pas de conflit : il CRÉE une
--   seconde ligne pour le même message physique. Conséquences, toutes
--   visibles par le client :
--
--     • deux alertes dans /menaces pour un seul message,
--     • DEUX EMAILS AU DIRIGEANT,
--     • des compteurs gonflés dans le rapport mensuel et dans le taux de
--       faux positifs.
--
--   « Deux alertes et deux emails pour un seul message serait pire que le
--   problème qu'on corrige. » C'est exact, et c'est la raison de cette
--   section.
--
-- La parade : la bannière porte l'identifiant de la ligne qui l'a posée
-- (`data-ref`). Le worker, avant d'analyser, regarde si le corps porte déjà
-- une de NOS bannières. Si oui, il ne réanalyse pas : il rattache.
CREATE OR REPLACE FUNCTION public.rattacher_message_graph(
  p_company_id UUID,
  p_ref UUID,
  p_nouveau_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancien TEXT;
  v_en_route BOOLEAN;
BEGIN
  SELECT message_id, deplacement_at IS NOT NULL INTO v_ancien, v_en_route
    FROM graph_analyses
   WHERE id = p_ref AND company_id = p_company_id;

  IF v_ancien IS NULL THEN
    RETURN 'inconnue';           -- ref qui ne correspond à rien chez nous
  END IF;

  IF v_ancien = p_nouveau_id THEN
    -- Déjà à jour : le renommage a gagné la course contre le webhook.
    UPDATE graph_analyses SET deplacement_at = NULL WHERE id = p_ref;
    RETURN 'deja-a-jour';
  END IF;

  -- ⚠ LA RÉFÉRENCE N'EST PAS UN SECRET. Elle voyage en clair dans le corps
  --   d'un message, sous les yeux de qui le reçoit — et de qui s'en fait
  --   suivre une copie. Si la seule condition pour être « rattaché » était
  --   d'en porter une valide, il suffirait d'en recopier une dans un mail
  --   frauduleux pour que le worker saute l'analyse : contournement complet
  --   du produit, et au passage la ligne visée basculerait sur l'identifiant
  --   du fraudeur — la sauvegarde du corps du VRAI message deviendrait
  --   irrattachable.
  --
  --   D'où cette condition, qui ne se falsifie pas : on ne rattache qu'une
  --   ligne DONT ON A SOI-MÊME ANNONCÉ LE DÉPLACEMENT quelques instants plus
  --   tôt. Hors de cette fenêtre, la référence ne prouve rien et l'appelant
  --   doit analyser le message normalement.
  IF NOT v_en_route THEN
    RETURN 'hors-fenetre';
  END IF;

  -- Une ligne existe déjà sous le nouvel identifiant : c'est le doublon que
  -- cette fonction existe pour empêcher. Il a été créé avant qu'on arrive ;
  -- on l'efface et on garde l'originale, qui porte l'historique (bannière,
  -- compteurs, notification au dirigeant).
  DELETE FROM graph_analyses
   WHERE company_id = p_company_id AND message_id = p_nouveau_id AND id <> p_ref;

  UPDATE graph_analyses
     SET message_id = p_nouveau_id,
         deplacement_at = NULL,
         deplacements = deplacements + 1
   WHERE id = p_ref;

  UPDATE graph_corps_originaux
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = v_ancien;

  UPDATE graph_file_attente
     SET message_id = p_nouveau_id
   WHERE company_id = p_company_id AND message_id = v_ancien;

  RETURN 'rattachee';
END;
$$;

REVOKE ALL ON FUNCTION public.rattacher_message_graph(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rattacher_message_graph(UUID, UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 5. Les messages restés en route
-- =============================================================================

-- Lecture seule. Alimente le balayage de la maintenance et le contrôle du
-- worker.
--
-- ⚠ « EN COURS » N'EST PAS « BLOQUÉ ». Un déplacement dure une fraction de
--   seconde ; une ligne vue à l'instant même est normale. C'est au-delà de
--   quelques minutes que ça devient un incident, d'où le paramètre.
CREATE OR REPLACE FUNCTION public.messages_en_deplacement(
  p_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  analyse_id UUID,
  company_id UUID,
  message_id TEXT,
  boite_id UUID,
  graph_user_id TEXT,
  tenant_id TEXT,
  dossier_service_id TEXT,
  depuis TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.company_id, a.message_id, a.boite_id,
         b.graph_user_id, t.tenant_id, b.dossier_service_id, a.deplacement_at
    FROM graph_analyses a
    JOIN boites_surveillees b ON b.id = a.boite_id
    JOIN microsoft_tenants t ON t.id = b.tenant_uid
   WHERE a.deplacement_at IS NOT NULL
     AND a.deplacement_at < now() - make_interval(mins => GREATEST(0, p_minutes))
     AND b.actif
   ORDER BY a.deplacement_at;
$$;

REVOKE ALL ON FUNCTION public.messages_en_deplacement(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messages_en_deplacement(INTEGER) TO service_role;

-- Le décompte, pour le voyant du worker.
CREATE OR REPLACE FUNCTION public.etat_deplacements()
RETURNS TABLE (
  en_cours BIGINT,
  bloques BIGINT,
  plus_ancien TIMESTAMPTZ,
  multiples BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FILTER (WHERE deplacement_at IS NOT NULL),
         count(*) FILTER (WHERE deplacement_at < now() - interval '5 minutes'),
         min(deplacement_at) FILTER (WHERE deplacement_at IS NOT NULL),
         -- Un message déplacé plus de deux fois signale un webhook rejoué que
         -- le rattachement n'a pas attrapé : la boucle qu'on veut voir venir.
         (SELECT count(*) FROM graph_analyses WHERE deplacements > 2)
    FROM graph_analyses;
$$;

REVOKE ALL ON FUNCTION public.etat_deplacements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etat_deplacements() TO service_role;

-- Enregistre l'identifiant du dossier de service, créé côté Graph.
CREATE OR REPLACE FUNCTION public.enregistrer_dossier_service(
  p_boite_id UUID,
  p_dossier_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE boites_surveillees SET dossier_service_id = p_dossier_id
   WHERE id = p_boite_id;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_dossier_service(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_dossier_service(UUID, TEXT)
  TO service_role;

-- Marque l'intention, avant l'acte.
CREATE OR REPLACE FUNCTION public.marquer_deplacement_graph(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE graph_analyses SET deplacement_at = now()
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

REVOKE ALL ON FUNCTION public.marquer_deplacement_graph(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_deplacement_graph(UUID, TEXT)
  TO service_role;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- 6.1 Colonnes et fonctions en place. UNE SEULE REQUÊTE À COLLER :
--
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name = 'boites_surveillees'
--                     AND column_name = 'dossier_service_id')      AS dossier_ok,
--          EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name = 'graph_analyses'
--                     AND column_name = 'deplacement_at')          AS etat_ok,
--          (SELECT count(*) FROM pg_proc p
--             JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public'
--              AND p.proname IN ('renommer_message_graph',
--                                'rattacher_message_graph',
--                                'messages_en_deplacement',
--                                'etat_deplacements',
--                                'enregistrer_dossier_service',
--                                'marquer_deplacement_graph'))      AS fonctions;
--
--   Attendu : dossier_ok = t, etat_ok = t, fonctions = 6.
--
-- 6.2 Rien n'est en cours de déplacement sur une base saine :
--
--   SELECT * FROM etat_deplacements();
--   -- en_cours = 0, bloques = 0, multiples = 0
--
-- 6.3 Le renommage, à blanc sur un identifiant qui n'existe pas — il ne doit
--     rien toucher et ne pas échouer :
--
--   SELECT * FROM renommer_message_graph('<company_id>', 'inexistant', 'autre');
--   -- trois lignes à 0
--
-- 6.4 Ce qui traîne, s'il y a lieu :
--
--   SELECT * FROM messages_en_deplacement(5);
--
--   Une ligne ici veut dire : un message est peut-être dans le dossier de
--   service de sa boîte. La maintenance le ramène à son prochain passage ;
--   POST /api/microsoft/maintenance le déclenche à la demande.
--
-- 6.5 Les messages déplacés plus de deux fois — la boucle à ne pas laisser
--     s'installer :
--
--   SELECT message_id, deplacements, analyse_at FROM graph_analyses
--    WHERE deplacements > 2 ORDER BY deplacements DESC;
--
-- 6.6 LA RÉFÉRENCE RECOPIÉE — la vérification de sécurité. Prendre l'identifiant
--     d'une analyse au repos (donc pas en cours de déplacement) et tenter de la
--     rattacher à un message quelconque : ce doit être REFUSÉ. Sans ce refus,
--     recopier une référence lue dans une bannière suffirait à faire sauter
--     l'analyse d'un message frauduleux.
--
--   SELECT rattacher_message_graph(company_id, id, 'identifiant-de-test')
--     FROM graph_analyses WHERE deplacement_at IS NULL LIMIT 1;
--   -- Attendu : « hors-fenetre ». Tout autre résultat est une faille.
--
--   Puis vérifier que la ligne n'a pas bougé :
--   SELECT count(*) FROM graph_analyses WHERE message_id = 'identifiant-de-test';
--   -- Attendu : 0.
