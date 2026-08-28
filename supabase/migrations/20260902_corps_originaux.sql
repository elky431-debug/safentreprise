-- Conservation du corps d'origine avant modification
-- Appliquer via le SQL Editor Supabase. Idempotente.
--
-- ⚠ CETTE TABLE CONTIENT DU CONTENU DE MESSAGE.
--
--   C'est un changement de nature. Jusqu'ici le produit ne stockait que des
--   métadonnées et un verdict, et la restauration se faisait par découpe des
--   marqueurs. Conserver le corps rend la restauration exacte et autorise la
--   conversion d'un corps texte en HTML — mais ce sont des données
--   personnelles au sens du RGPD, souvent sensibles.
--
--   Trois conséquences, toutes traitées ici :
--     • purge automatique à 30 jours (le corps ne sert qu'à défaire) ;
--     • effacement immédiat dès qu'une restauration a réussi ;
--     • aucun accès en lecture, pas même au dirigeant de la société.
--
--   La politique de confidentialité affirme encore qu'aucun contenu n'est
--   conservé. Elle doit être corrigée AVANT toute mise en service client.

-- =============================================================================
-- 1. La table
-- =============================================================================

CREATE TABLE IF NOT EXISTS graph_corps_originaux (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,

  -- Le corps EXACTEMENT tel que Graph l'a rendu, avant toute modification.
  contenu TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text', 'html')),

  -- Pour vérifier après coup qu'on réécrit bien ce qu'on avait lu.
  taille_octets INTEGER NOT NULL,
  empreinte TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Purge automatique : le corps ne sert qu'à défaire une modification.
  purge_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',

  PRIMARY KEY (company_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_corps_purge ON graph_corps_originaux(purge_at);

ALTER TABLE graph_corps_originaux ENABLE ROW LEVEL SECURITY;

-- AUCUNE politique : personne ne lit cette table par PostgREST, pas même le
-- dirigeant de la société. Le corps d'un message n'a aucune raison d'être
-- affiché ; il ne sert qu'à la restauration, faite par le worker.
REVOKE ALL ON TABLE graph_corps_originaux FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. Sauvegarder — sans jamais écraser
-- =============================================================================

-- Plafond. Un corps HTML ordinaire pèse 20 à 100 Ko ; au-delà du mégaoctet on
-- a affaire à des images encodées en ligne. On refuse alors la sauvegarde, et
-- l'appelant NE MODIFIE PAS le message : mieux vaut un mail non annoté qu'un
-- mail modifié sans retour possible.
CREATE OR REPLACE FUNCTION public.sauvegarder_corps_graph(
  p_company_id UUID,
  p_message_id TEXT,
  p_contenu TEXT,
  p_content_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taille INTEGER;
BEGIN
  -- Déjà sauvegardé : on NE TOUCHE À RIEN. C'est la garantie centrale — un
  -- second passage sur le même message écraserait sinon l'original par une
  -- version déjà bannerisée, et la restauration remettrait la bannière.
  IF EXISTS (
    SELECT 1 FROM graph_corps_originaux
     WHERE company_id = p_company_id AND message_id = p_message_id
  ) THEN
    RETURN 'deja-sauvegarde';
  END IF;

  IF p_contenu IS NULL THEN
    RETURN 'corps-absent';
  END IF;

  -- Second garde-fou, indépendant du premier : si le corps porte déjà une
  -- bannière, ce n'est pas un original. Le sauvegarder figerait la bannière
  -- dans ce qu'on est censé pouvoir restaurer.
  IF p_contenu LIKE '%SAFENTREPRISE-BANNIERE:DEBUT%'
     OR p_contenu LIKE '%data-safentreprise%'
     OR p_contenu LIKE '%SAFENTREPRISE — AVERTISSEMENT%'
  THEN
    RETURN 'contient-banniere';
  END IF;

  v_taille := octet_length(p_contenu);
  IF v_taille > 1000000 THEN
    RETURN 'trop-volumineux';
  END IF;

  INSERT INTO graph_corps_originaux
    (company_id, message_id, contenu, content_type, taille_octets, empreinte)
  VALUES (
    p_company_id, p_message_id, p_contenu,
    CASE WHEN lower(p_content_type) = 'text' THEN 'text' ELSE 'html' END,
    v_taille,
    encode(sha256(convert_to(p_contenu, 'UTF8')), 'hex')
  )
  -- Ceinture et bretelles : deux workers concurrents sur le même message.
  ON CONFLICT (company_id, message_id) DO NOTHING;

  RETURN 'sauvegarde';
END;
$$;

-- =============================================================================
-- 3. Relire pour restaurer
-- =============================================================================

CREATE OR REPLACE FUNCTION public.corps_original_graph(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS TABLE (contenu TEXT, content_type TEXT, empreinte TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT contenu, content_type, empreinte, created_at
    FROM graph_corps_originaux
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- Une fois le message remis en état, le corps n'a plus aucune raison d'exister.
CREATE OR REPLACE FUNCTION public.oublier_corps_graph(
  p_company_id UUID,
  p_message_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM graph_corps_originaux
   WHERE company_id = p_company_id AND message_id = p_message_id;
$$;

-- =============================================================================
-- 4. Purge
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purger_corps_originaux()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supprimes INTEGER;
BEGIN
  DELETE FROM graph_corps_originaux WHERE purge_at < now();
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;
  RETURN v_supprimes;
END;
$$;

-- Tous les jours à 3h15, avant la purge des menaces à 3h30.
--
-- Perdre la sauvegarde ne perd PAS la réversibilité : la découpe par
-- marqueurs reste en place et reprend le relais. On perd seulement l'exactitude
-- au caractère près sur les messages convertis.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-corps-originaux') THEN
      PERFORM cron.unschedule('purge-corps-originaux');
    END IF;
    PERFORM cron.schedule(
      'purge-corps-originaux',
      '15 3 * * *',
      $c$ SELECT public.purger_corps_originaux(); $c$
    );
  ELSE
    RAISE WARNING 'pg_cron absent : la purge des corps doit être planifiée à la main.';
  END IF;
END $$;

-- =============================================================================
-- 5. Droits
-- =============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'sauvegarder_corps_graph(UUID, TEXT, TEXT, TEXT)',
    'corps_original_graph(UUID, TEXT)',
    'oublier_corps_graph(UUID, TEXT)',
    'purger_corps_originaux()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- =============================================================================
-- 6. Vérification
-- =============================================================================

-- Combien de corps conservés, quelle taille, et pour combien de temps :
--
--   SELECT count(*) AS corps,
--          pg_size_pretty(sum(taille_octets)::bigint) AS volume,
--          min(created_at) AS plus_ancien,
--          min(purge_at) AS prochaine_purge
--     FROM graph_corps_originaux;
--
-- ⚠ Ne JAMAIS faire « SELECT contenu FROM graph_corps_originaux » : ce sont
--   les mails de vos clients.
