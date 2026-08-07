-- score_history + RPC snapshot (extrait de schema.sql)
-- Appliquer via : npm run db:apply
-- Ou coller dans le SQL Editor Supabase.

CREATE TABLE IF NOT EXISTS score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score_global INTEGER NOT NULL CHECK (score_global BETWEEN 0 AND 100),
  score_humain INTEGER NOT NULL CHECK (score_humain BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_history_company_date
  ON score_history(company_id, created_at ASC);

ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS score_history_select_own ON score_history;
CREATE POLICY score_history_select_own
  ON score_history FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS score_history_insert_own ON score_history;
CREATE POLICY score_history_insert_own
  ON score_history FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

CREATE OR REPLACE FUNCTION public.snapshot_score_from_token(
  p_token TEXT,
  p_score_global INTEGER,
  p_score_humain INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN false;
  END IF;
  IF p_score_global IS NULL OR p_score_global < 0 OR p_score_global > 100 THEN
    RAISE EXCEPTION 'score_global hors bornes';
  END IF;
  IF p_score_humain IS NULL OR p_score_humain < 0 OR p_score_humain > 100 THEN
    RAISE EXCEPTION 'score_humain hors bornes';
  END IF;

  SELECT c.company_id INTO v_company_id
    FROM campaign_targets ct
    JOIN campaigns c ON c.id = ct.campaign_id
   WHERE ct.token_unique = p_token
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO score_history (company_id, score_global, score_humain)
  VALUES (v_company_id, p_score_global, p_score_humain);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_score_from_token(TEXT, INTEGER, INTEGER)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_risk_payload_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_result JSONB;
BEGIN
  SELECT c.company_id INTO v_company_id
    FROM campaign_targets ct
    JOIN campaigns c ON c.id = ct.campaign_id
   WHERE ct.token_unique = p_token
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'company_id', v_company_id,
    'assessment', (
      SELECT jsonb_build_object(
        'score_procedures', ra.score_procedures,
        'score_humain', ra.score_humain,
        'score_technique', ra.score_technique
      )
      FROM risk_assessments ra
      WHERE ra.company_id = v_company_id
      ORDER BY ra.created_at DESC
      LIMIT 1
    ),
    'employee_ids', COALESCE((
      SELECT jsonb_agg(e.id ORDER BY e.created_at)
      FROM employees e
      WHERE e.company_id = v_company_id
    ), '[]'::jsonb),
    'cibles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employee_id', ct.employee_id,
        'message_envoye', ct.message_envoye,
        'a_clique', ct.a_clique,
        'a_signale', ct.a_signale,
        'quiz_complete', ct.quiz_complete,
        'score_quiz', ct.score_quiz
      ))
      FROM campaign_targets ct
      JOIN campaigns c2 ON c2.id = ct.campaign_id
      WHERE c2.company_id = v_company_id
    ), '[]'::jsonb),
    'derniere_campagne_at', (
      SELECT c3.date_lancement
      FROM campaigns c3
      WHERE c3.company_id = v_company_id
        AND c3.statut = 'envoyee'
      ORDER BY c3.date_lancement DESC NULLS LAST
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_risk_payload_by_token(TEXT) TO anon, authenticated;
