-- =============================================================================
-- Safentreprise — Schéma de base de données + Row Level Security
-- À exécuter via : npm run db:apply
-- Idempotent : peut être rejoué sur une base existante.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Table : companies
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  secteur TEXT,
  nom_responsable TEXT NOT NULL,
  email_responsable TEXT NOT NULL,
  telephone_responsable TEXT,
  nom_dirigeant TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode_resultats TEXT NOT NULL DEFAULT 'nominatif'
    CHECK (mode_resultats IN ('nominatif', 'anonymise')),
  employes_informes BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- -----------------------------------------------------------------------------
-- Table : employees
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prenom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

-- -----------------------------------------------------------------------------
-- Table : branding (charte visuelle de la société cliente)
-- Rempli / mis à jour à l'étape « Marque » d'une campagne.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  logo_url TEXT,
  couleur_principale TEXT NOT NULL DEFAULT '#0e8593',
  signature_html TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

-- -----------------------------------------------------------------------------
-- Table : suppliers (faux fournisseurs gérés par le client)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  email_type TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Table : message_templates (gabarits HTML/SMS écrits par l'opérateur)
-- Variables : {logo} {entreprise} {nom_dirigeant} {nom_fournisseur}
--             {prenom_employe} {signature} {couleur}
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_fraude TEXT NOT NULL CHECK (type_fraude IN ('president', 'fournisseur')),
  canal TEXT NOT NULL CHECK (canal IN ('email', 'sms')),
  objet TEXT,
  contenu_html TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (canal <> 'email' OR objet IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- Table : campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  type_fraude TEXT NOT NULL
    CHECK (type_fraude IN ('president', 'fournisseur', 'les_deux')),
  canal TEXT NOT NULL
    CHECK (canal IN ('email', 'sms', 'les_deux')),
  statut TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'prete', 'envoyee')),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  date_lancement TIMESTAMPTZ,
  date_planifiee TIMESTAMPTZ,
  recurrence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes ajoutées sur bases déjà déployées
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Table : campaign_messages (legacy IA — conservée, plus alimentée)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type_fraude TEXT NOT NULL CHECK (type_fraude IN ('president', 'fournisseur')),
  canal TEXT NOT NULL CHECK (canal IN ('email', 'sms')),
  objet TEXT,
  contenu TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (canal <> 'email' OR objet IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- Table : campaign_targets (un message final personnalisé par employé)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message_id UUID REFERENCES campaign_messages(id) ON DELETE SET NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  message_final_html TEXT,
  objet_final TEXT,
  token_unique TEXT UNIQUE,
  message_envoye BOOLEAN NOT NULL DEFAULT false,
  envoye_at TIMESTAMPTZ,
  a_clique BOOLEAN NOT NULL DEFAULT false,
  a_signale BOOLEAN NOT NULL DEFAULT false,
  a_relance BOOLEAN NOT NULL DEFAULT false,
  quiz_complete BOOLEAN NOT NULL DEFAULT false,
  score_quiz INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id)
);

ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;
ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS message_final_html TEXT;
ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS objet_final TEXT;
ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS token_unique TEXT;
ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS envoye_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_targets_token
  ON campaign_targets(token_unique) WHERE token_unique IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Tables structure (paiement / attestation / risque)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  montant NUMERIC(10, 2) NOT NULL,
  statut_stripe TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date_emission TIMESTAMPTZ NOT NULL DEFAULT now(),
  url_pdf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reponses JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_procedures INTEGER NOT NULL CHECK (score_procedures BETWEEN 0 AND 100),
  score_humain INTEGER NOT NULL CHECK (score_humain BETWEEN 0 AND 100),
  score_technique INTEGER NOT NULL CHECK (score_technique BETWEEN 0 AND 100),
  score_global INTEGER NOT NULL CHECK (score_global BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Table : demandes_demo (formulaire « Demander une démo » de la landing)
-- Table publique en écriture : aucun lien avec companies / auth.users.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandes_demo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  entreprise TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  message TEXT,
  statut TEXT NOT NULL DEFAULT 'nouvelle'
    CHECK (statut IN ('nouvelle', 'contactee', 'traitee', 'archivee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_company ON campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign
  ON campaign_messages(campaign_id, ordre);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_branding_company ON branding(company_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_filtre
  ON message_templates(type_fraude, canal) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_certificates_company ON certificates(company_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_company
  ON risk_assessments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demandes_demo_date
  ON demandes_demo(created_at DESC);

-- =============================================================================
-- Storage : bucket public pour logos de charte
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_demo ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM companies WHERE user_id = auth.uid() LIMIT 1
$$;

-- ---------- companies ----------
DROP POLICY IF EXISTS companies_select_own ON companies;
CREATE POLICY companies_select_own
  ON companies FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS companies_insert_own ON companies;
CREATE POLICY companies_insert_own
  ON companies FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS companies_update_own ON companies;
CREATE POLICY companies_update_own
  ON companies FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS companies_delete_own ON companies;
CREATE POLICY companies_delete_own
  ON companies FOR DELETE
  USING (user_id = auth.uid());

-- ---------- employees ----------
DROP POLICY IF EXISTS employees_select_own ON employees;
CREATE POLICY employees_select_own
  ON employees FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS employees_insert_own ON employees;
CREATE POLICY employees_insert_own
  ON employees FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS employees_update_own ON employees;
CREATE POLICY employees_update_own
  ON employees FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS employees_delete_own ON employees;
CREATE POLICY employees_delete_own
  ON employees FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ---------- branding ----------
DROP POLICY IF EXISTS branding_select_own ON branding;
CREATE POLICY branding_select_own
  ON branding FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS branding_insert_own ON branding;
CREATE POLICY branding_insert_own
  ON branding FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS branding_update_own ON branding;
CREATE POLICY branding_update_own
  ON branding FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS branding_delete_own ON branding;
CREATE POLICY branding_delete_own
  ON branding FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ---------- suppliers ----------
DROP POLICY IF EXISTS suppliers_select_own ON suppliers;
CREATE POLICY suppliers_select_own
  ON suppliers FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS suppliers_insert_own ON suppliers;
CREATE POLICY suppliers_insert_own
  ON suppliers FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS suppliers_update_own ON suppliers;
CREATE POLICY suppliers_update_own
  ON suppliers FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS suppliers_delete_own ON suppliers;
CREATE POLICY suppliers_delete_own
  ON suppliers FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ---------- message_templates (lecture seule pour les clients) ----------
DROP POLICY IF EXISTS message_templates_select_actif ON message_templates;
CREATE POLICY message_templates_select_actif
  ON message_templates FOR SELECT
  USING (actif = true);

-- ---------- campaigns ----------
DROP POLICY IF EXISTS campaigns_select_own ON campaigns;
CREATE POLICY campaigns_select_own
  ON campaigns FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS campaigns_insert_own ON campaigns;
CREATE POLICY campaigns_insert_own
  ON campaigns FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS campaigns_update_own ON campaigns;
CREATE POLICY campaigns_update_own
  ON campaigns FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS campaigns_delete_own ON campaigns;
CREATE POLICY campaigns_delete_own
  ON campaigns FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ---------- campaign_messages ----------
DROP POLICY IF EXISTS campaign_messages_select_own ON campaign_messages;
CREATE POLICY campaign_messages_select_own
  ON campaign_messages FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_messages_insert_own ON campaign_messages;
CREATE POLICY campaign_messages_insert_own
  ON campaign_messages FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_messages_update_own ON campaign_messages;
CREATE POLICY campaign_messages_update_own
  ON campaign_messages FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_messages_delete_own ON campaign_messages;
CREATE POLICY campaign_messages_delete_own
  ON campaign_messages FOR DELETE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

-- ---------- campaign_targets ----------
DROP POLICY IF EXISTS campaign_targets_select_own ON campaign_targets;
CREATE POLICY campaign_targets_select_own
  ON campaign_targets FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_targets_insert_own ON campaign_targets;
CREATE POLICY campaign_targets_insert_own
  ON campaign_targets FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_targets_update_own ON campaign_targets;
CREATE POLICY campaign_targets_update_own
  ON campaign_targets FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS campaign_targets_delete_own ON campaign_targets;
CREATE POLICY campaign_targets_delete_own
  ON campaign_targets FOR DELETE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE company_id = public.get_my_company_id()
    )
  );

-- ---------- payments ----------
DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own
  ON payments FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS payments_insert_own ON payments;
CREATE POLICY payments_insert_own
  ON payments FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS payments_update_own ON payments;
CREATE POLICY payments_update_own
  ON payments FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- ---------- certificates ----------
DROP POLICY IF EXISTS certificates_select_own ON certificates;
CREATE POLICY certificates_select_own
  ON certificates FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS certificates_insert_own ON certificates;
CREATE POLICY certificates_insert_own
  ON certificates FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS certificates_update_own ON certificates;
CREATE POLICY certificates_update_own
  ON certificates FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- ---------- risk_assessments ----------
DROP POLICY IF EXISTS risk_assessments_select_own ON risk_assessments;
CREATE POLICY risk_assessments_select_own
  ON risk_assessments FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS risk_assessments_insert_own ON risk_assessments;
CREATE POLICY risk_assessments_insert_own
  ON risk_assessments FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS risk_assessments_delete_own ON risk_assessments;
CREATE POLICY risk_assessments_delete_own
  ON risk_assessments FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ---------- demandes_demo ----------
-- Écriture publique : le formulaire est ouvert aux visiteurs non connectés.
DROP POLICY IF EXISTS demandes_demo_insert_public ON demandes_demo;
CREATE POLICY demandes_demo_insert_public
  ON demandes_demo FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Aucune politique SELECT / UPDATE / DELETE : les demandes ne sont lisibles
-- que depuis le back-office Supabase (Table Editor), jamais via l'API publique.

-- ---------- storage.objects (logos branding/{company_id}/…) ----------
DROP POLICY IF EXISTS branding_storage_select ON storage.objects;
CREATE POLICY branding_storage_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_storage_insert ON storage.objects;
CREATE POLICY branding_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_update ON storage.objects;
CREATE POLICY branding_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS branding_storage_delete ON storage.objects;
CREATE POLICY branding_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

-- =============================================================================
-- Gabarits par défaut (ids fixes → seed idempotent)
-- =============================================================================

INSERT INTO message_templates (id, type_fraude, canal, objet, contenu_html, actif)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'president',
  'email',
  'Confidentiel — virement à traiter aujourd''hui',
  $html$<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Message confidentiel</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:20px 28px;border-bottom:3px solid {couleur};">
              {logo}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 16px;">Bonjour {prenom_employe},</p>
              <p style="margin:0 0 16px;">Je suis actuellement en déplacement et j&apos;ai besoin que vous traitiez <strong>en priorité</strong> un virement confidentiel auprès de notre conseil.</p>
              <p style="margin:0 0 16px;">Le montant et l&apos;IBAN vous seront communiqués dès votre confirmation par retour de mail. Merci de ne pas en parler en interne pour le moment — dossier sensible.</p>
              <p style="margin:0 0 16px;">Pouvez-vous me confirmer votre disponibilité dans les prochaines heures&nbsp;?</p>
              <p style="margin:0 0 20px;text-align:center;">
                <a href="{lien_tracking}" style="display:inline-block;padding:12px 22px;background:{couleur};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                  Confirmer ma disponibilité
                </a>
              </p>
              <p style="margin:0 0 4px;">Cordialement,</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:14px;line-height:1.5;color:#374151;">
              {signature}
              <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">{nom_dirigeant}<br />Direction — {entreprise}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.4;color:#9ca3af;">
              Ce message est destiné à {prenom_employe} — {entreprise}. Merci de ne pas le transférer.
              <br /><br />
              <a href="{lien_signalement}" style="color:#9ca3af;text-decoration:underline;">Ce message vous semble suspect ? Signalez-le</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$html$,
  true
)
ON CONFLICT (id) DO UPDATE SET
  objet = EXCLUDED.objet,
  contenu_html = EXCLUDED.contenu_html,
  actif = true;

INSERT INTO message_templates (id, type_fraude, canal, objet, contenu_html, actif)
VALUES (
  'a1000000-0000-4000-8000-000000000002',
  'fournisseur',
  'email',
  'Mise à jour urgente de nos coordonnées bancaires',
  $html$<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Coordonnées bancaires</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:18px 28px;background:{couleur};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">{logo}</td>
                  <td align="right" style="vertical-align:middle;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;opacity:0.9;">
                    Service comptabilité
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 16px;">Bonjour {prenom_employe},</p>
              <p style="margin:0 0 16px;">Dans le cadre du renouvellement de notre relation commerciale avec <strong>{entreprise}</strong>, nous vous informons d&apos;un <strong>changement immédiat de nos coordonnées bancaires</strong>.</p>
              <p style="margin:0 0 16px;">Afin d&apos;éviter tout rejet sur les prochaines factures <strong>{nom_fournisseur}</strong>, merci de mettre à jour vos systèmes de paiement dès aujourd&apos;hui. Les nouveaux RIB seront transmis après votre accusé de réception.</p>
              <p style="margin:0 0 16px;">Pour toute question, répondez directement à ce message — notre équipe comptable reste à votre disposition.</p>
              <p style="margin:0 0 20px;text-align:center;">
                <a href="{lien_tracking}" style="display:inline-block;padding:12px 22px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                  Accuser réception du changement
                </a>
              </p>
              <p style="margin:0 0 4px;">Bien cordialement,</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:14px;line-height:1.5;color:#374151;">
              {signature}
              <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
                Service comptabilité<br />
                <strong>{nom_fournisseur}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.4;color:#9ca3af;">
              {nom_fournisseur} — message destiné au service financier de {entreprise}.
              <br /><br />
              <a href="{lien_signalement}" style="color:#9ca3af;text-decoration:underline;">Ce message vous semble suspect ? Signalez-le</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$html$,
  true
)
ON CONFLICT (id) DO UPDATE SET
  objet = EXCLUDED.objet,
  contenu_html = EXCLUDED.contenu_html,
  actif = true;

INSERT INTO message_templates (id, type_fraude, canal, objet, contenu_html, actif)
VALUES (
  'a1000000-0000-4000-8000-000000000003',
  'president',
  'sms',
  NULL,
  $html$Bonjour {prenom_employe}, c'est {nom_dirigeant}. Urgence confidentielle : j'ai besoin que vous traitiez un virement aujourd'hui pour {entreprise}. Répondez-moi dès que possible. Ne diffusez pas.$html$,
  true
)
ON CONFLICT (id) DO UPDATE SET
  contenu_html = EXCLUDED.contenu_html,
  actif = true;

INSERT INTO message_templates (id, type_fraude, canal, objet, contenu_html, actif)
VALUES (
  'a1000000-0000-4000-8000-000000000004',
  'fournisseur',
  'sms',
  NULL,
  $html${nom_fournisseur} — Bonjour {prenom_employe}, nos coordonnées bancaires changent dès aujourd'hui. Merci de mettre à jour le paiement des factures {entreprise} et de confirmer par SMS. Service comptabilité.$html$,
  true
)
ON CONFLICT (id) DO UPDATE SET
  contenu_html = EXCLUDED.contenu_html,
  actif = true;

-- =============================================================================
-- RPC publiques (SECURITY DEFINER) — tracking / quiz sans service-role
-- Un token ne donne accès qu'à SA propre cible.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_target_by_token(p_token TEXT)
RETURNS TABLE (
  target_id UUID,
  token_unique TEXT,
  prenom TEXT,
  type_fraude TEXT,
  a_clique BOOLEAN,
  a_signale BOOLEAN,
  quiz_complete BOOLEAN,
  score_quiz INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ct.id,
    ct.token_unique,
    e.prenom,
    CASE
      WHEN c.type_fraude = 'les_deux' THEN 'president'
      ELSE c.type_fraude
    END,
    ct.a_clique,
    ct.a_signale,
    ct.quiz_complete,
    ct.score_quiz
  FROM campaign_targets ct
  JOIN campaigns c ON c.id = ct.campaign_id
  JOIN employees e ON e.id = ct.employee_id
  WHERE ct.token_unique = p_token
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.marquer_clic(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE campaign_targets
     SET a_clique = true
   WHERE token_unique = p_token
     AND a_clique = false;
  RETURN EXISTS (
    SELECT 1 FROM campaign_targets WHERE token_unique = p_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marquer_signalement(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE campaign_targets
     SET a_signale = true
   WHERE token_unique = p_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.enregistrer_quiz(p_token TEXT, p_score INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'score_quiz hors bornes';
  END IF;

  UPDATE campaign_targets
     SET quiz_complete = true,
         score_quiz = p_score
   WHERE token_unique = p_token;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_target_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_clic(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_signalement(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_quiz(TEXT, INTEGER) TO anon, authenticated;

-- =============================================================================
-- quiz_questions — questions du quiz post-simulation
-- =============================================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_fraude TEXT CHECK (type_fraude IS NULL OR type_fraude IN ('president', 'fournisseur')),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  bonne_reponse INTEGER NOT NULL CHECK (bonne_reponse >= 0),
  ordre INTEGER NOT NULL DEFAULT 1,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_actif_ordre
  ON quiz_questions(actif, ordre);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_questions_select_auth ON quiz_questions;
CREATE POLICY quiz_questions_select_auth
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS quiz_questions_insert_auth ON quiz_questions;
CREATE POLICY quiz_questions_insert_auth
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS quiz_questions_update_auth ON quiz_questions;
CREATE POLICY quiz_questions_update_auth
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS quiz_questions_delete_auth ON quiz_questions;
CREATE POLICY quiz_questions_delete_auth
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_quiz_questions(p_type_fraude TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  question TEXT,
  options JSONB,
  bonne_reponse INTEGER,
  ordre INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question, q.options, q.bonne_reponse, q.ordre
    FROM quiz_questions q
   WHERE q.actif = true
     AND (
       p_type_fraude IS NULL
       OR q.type_fraude IS NULL
       OR q.type_fraude = p_type_fraude
     )
   ORDER BY q.ordre ASC, q.created_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_questions(TEXT) TO anon, authenticated;

INSERT INTO quiz_questions (id, type_fraude, question, options, bonne_reponse, ordre, actif)
VALUES
(
  'b1000000-0000-4000-8000-000000000001',
  NULL,
  'Un email urgent demande un virement « confidentiel » au nom du dirigeant. Que faites-vous en premier ?',
  '["Exécuter le virement immédiatement pour ne pas le contrarier","Vérifier par un canal indépendant (téléphone connu, discussion en personne)","Répondre à l''email pour demander l''IBAN","Transférer le message à toute la comptabilité"]'::jsonb,
  1, 1, true
),
(
  'b1000000-0000-4000-8000-000000000002',
  'fournisseur',
  'Quel signal doit vous alerter dans une demande de changement de RIB fournisseur ?',
  '["Le message mentionne le nom de votre société","La demande est pressante et contourne la procédure habituelle de double contrôle","L''objet du mail est professionnel","Le message contient une signature"]'::jsonb,
  1, 2, true
),
(
  'b1000000-0000-4000-8000-000000000003',
  NULL,
  'L''adresse d''expédition affiche le nom du dirigeant, mais le domaine est inconnu. C''est…',
  '["Normal : les dirigeants utilisent souvent des adresses personnelles","Un signal d''usurpation d''identité classique","Une preuve que le message est authentique","Sans importance si le ton est familier"]'::jsonb,
  1, 3, true
),
(
  'b1000000-0000-4000-8000-000000000004',
  NULL,
  'En cas de doute sur un message financier, la bonne pratique est de…',
  '["Cliquer sur le lien du message pour « vérifier »","Ignorer toute procédure écrite et se fier à l''urgence","Suivre la procédure interne (validation croisée) avant tout paiement","Demander les coordonnées bancaires uniquement par email"]'::jsonb,
  2, 4, true
),
(
  'b1000000-0000-4000-8000-000000000005',
  'president',
  'Quel ordre de grandeur pour le préjudice moyen d''une fraude au président ?',
  '["Quelques centaines d''euros","Environ 75 000 € en moyenne (et bien plus dans certains cas)","Toujours moins de 1 000 €","Aucun préjudice financier, seulement de l''image"]'::jsonb,
  1, 5, true
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  options = EXCLUDED.options,
  bonne_reponse = EXCLUDED.bonne_reponse,
  ordre = EXCLUDED.ordre,
  actif = true;

-- Gabarits : édition pour les utilisateurs authentifiés
DROP POLICY IF EXISTS message_templates_select_all_auth ON message_templates;
CREATE POLICY message_templates_select_all_auth
  ON message_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS message_templates_update_auth ON message_templates;
CREATE POLICY message_templates_update_auth
  ON message_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage PDF certificats
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  true,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS certificates_storage_select ON storage.objects;
CREATE POLICY certificates_storage_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates');

DROP POLICY IF EXISTS certificates_storage_insert ON storage.objects;
CREATE POLICY certificates_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_update ON storage.objects;
CREATE POLICY certificates_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

DROP POLICY IF EXISTS certificates_storage_delete ON storage.objects;
CREATE POLICY certificates_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

-- =============================================================================
-- score_history — courbe d'évolution du score de risque dynamique
-- =============================================================================
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

-- Snapshot sécurisé après quiz / signalement public (via token de cible)
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

-- Payload pour recalcul TS côté API (données minimales, pas de PII)
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



-- =============================================================================
-- Safentreprise Guard — extension navigateur (code d'activation + menaces)
-- =============================================================================

-- pièce jointe.

-- =============================================================================
-- 1. Code d'activation de l'extension (table companies)
-- =============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS code_activation TEXT;

-- Génère un code lisible « SAFE-A3X9K2 ».
-- Alphabet sans caractères ambigus (ni I, ni O, ni 0, ni 1) : le code doit
-- pouvoir être dicté au téléphone sans confusion.
CREATE OR REPLACE FUNCTION public.generer_code_activation()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_essais INTEGER := 0;
BEGIN
  LOOP
    v_code := 'SAFE-';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(
        v_alphabet,
        floor(random() * length(v_alphabet))::int + 1,
        1
      );
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM companies WHERE code_activation = v_code
    );

    v_essais := v_essais + 1;
    IF v_essais > 50 THEN
      RAISE EXCEPTION 'Impossible de générer un code d''activation unique.';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

-- Sociétés déjà créées : on leur attribue un code.
UPDATE companies
   SET code_activation = public.generer_code_activation()
 WHERE code_activation IS NULL;

-- Toute nouvelle société reçoit automatiquement son code.
ALTER TABLE companies
  ALTER COLUMN code_activation SET DEFAULT public.generer_code_activation();

ALTER TABLE companies
  ALTER COLUMN code_activation SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_activation
  ON companies(code_activation);

-- Le code est le seul secret qui autorise l'envoi d'alertes : il ne doit pas
-- pouvoir être choisi depuis le navigateur. La politique companies_update_own
-- autorise le dirigeant à modifier sa fiche ; ce déclencheur restaure
-- silencieusement l'ancien code, sauf rotation explicite (drapeau de
-- transaction posé par regenerer_code_activation).
CREATE OR REPLACE FUNCTION public.proteger_code_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code_activation IS DISTINCT FROM OLD.code_activation
     AND COALESCE(
           current_setting('safentreprise.rotation_code', true), ''
         ) <> 'on'
  THEN
    NEW.code_activation := OLD.code_activation;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_code_activation ON companies;
CREATE TRIGGER trg_proteger_code_activation
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_code_activation();

-- Rotation du code depuis la page /settings/extension.
-- Invalide immédiatement toutes les extensions déjà activées.
CREATE OR REPLACE FUNCTION public.regenerer_code_activation()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_code TEXT;
BEGIN
  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Aucune société associée à cet utilisateur.';
  END IF;

  v_code := public.generer_code_activation();

  PERFORM set_config('safentreprise.rotation_code', 'on', true);
  UPDATE companies SET code_activation = v_code WHERE id = v_company_id;
  PERFORM set_config('safentreprise.rotation_code', 'off', true);

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerer_code_activation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerer_code_activation() TO authenticated;

-- =============================================================================
-- 2. Table des menaces détectées — MÉTADONNÉES UNIQUEMENT
-- =============================================================================

CREATE TABLE IF NOT EXISTS menaces_detectees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Identité affichée par le message frauduleux
  expediteur_nom TEXT,
  expediteur_email TEXT NOT NULL,
  -- Nom signé en bas du message (celui du dirigeant usurpé)
  nom_signe TEXT,
  objet TEXT,
  niveau_risque TEXT NOT NULL
    CHECK (niveau_risque IN ('faible', 'modere', 'eleve')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Libellés des signaux relevés, ex. ["domaine_grand_public", "virement"]
  signaux JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Destinataire de l'alerte ; nul si la société est en mode anonymisé
  employe_email TEXT,
  detecte_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Volontairement absentes : aucune colonne de corps de message, d'extrait,
-- d'en-têtes bruts ou de pièce jointe. Ne pas en ajouter.

CREATE INDEX IF NOT EXISTS idx_menaces_company_date
  ON menaces_detectees(company_id, detecte_at DESC);

ALTER TABLE menaces_detectees ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque dirigeant ne voit que les menaces de SA société.
DROP POLICY IF EXISTS menaces_detectees_select_own ON menaces_detectees;
CREATE POLICY menaces_detectees_select_own
  ON menaces_detectees FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Purge manuelle depuis le tableau de bord.
DROP POLICY IF EXISTS menaces_detectees_delete_own ON menaces_detectees;
CREATE POLICY menaces_detectees_delete_own
  ON menaces_detectees FOR DELETE
  USING (company_id = public.get_my_company_id());

-- Aucune politique INSERT : l'extension n'écrit jamais en direct. Elle passe
-- par enregistrer_menace(), qui valide le code d'activation.

-- =============================================================================
-- 3. Fonctions appelées par l'extension (via les routes /api/extension/…)
-- =============================================================================

-- Vérifie un code d'activation. Renvoie le nom de la société, ou NULL.
CREATE OR REPLACE FUNCTION public.verifier_code_activation(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nom
    FROM companies
   WHERE code_activation = upper(btrim(p_code))
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.verifier_code_activation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifier_code_activation(TEXT) TO anon, authenticated;

-- Enregistre une menace après validation du code d'activation.
-- Renvoie l'identifiant créé, ou NULL si le code est inconnu (→ 401 côté API).
CREATE OR REPLACE FUNCTION public.enregistrer_menace(
  p_code_activation TEXT,
  p_expediteur_nom  TEXT,
  p_expediteur_email TEXT,
  p_nom_signe       TEXT,
  p_objet           TEXT,
  p_niveau_risque   TEXT,
  p_score           INTEGER,
  p_signaux         JSONB,
  p_employe_email   TEXT,
  p_detecte_at      TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_company_id
    FROM companies
   WHERE code_activation = upper(btrim(p_code_activation));

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO menaces_detectees (
    company_id, expediteur_nom, expediteur_email, nom_signe, objet,
    niveau_risque, score, signaux, employe_email, detecte_at
  )
  VALUES (
    v_company_id,
    p_expediteur_nom,
    p_expediteur_email,
    p_nom_signe,
    p_objet,
    p_niveau_risque,
    p_score,
    COALESCE(p_signaux, '[]'::jsonb),
    p_employe_email,
    COALESCE(p_detecte_at, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enregistrer_menace(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enregistrer_menace(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TIMESTAMPTZ
) TO anon, authenticated;
