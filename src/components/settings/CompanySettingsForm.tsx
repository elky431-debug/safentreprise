"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, ModeResultats } from "@/lib/types";
import {
  Alert,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";

const NOTE_INFORMATION = `Objet : Sensibilisation à la fraude — simulations internes

Bonjour,

Dans le cadre de notre démarche de cybersécurité, notre entreprise réalisera périodiquement des simulations de fraude (faux emails ou SMS d'arnaque au président / faux fournisseur).

Ces exercices sont strictement internes, consentis au niveau de la direction, et n'entraînent aucun risque financier réel. Leur seul objectif est de mesurer et renforcer nos réflexes collectifs.

Si vous recevez un message suspect, signalez-le à votre référent IT / sécurité selon la procédure habituelle. Les résultats individuels peuvent être traités de façon nominative ou anonymisée selon la politique choisie par la direction.

Merci de votre vigilance.

La direction`;

type Props = { company: Company };

/** Formulaire d'édition de la société + cadre CNIL. */
export function CompanySettingsForm({ company }: Props) {
  const [nom, setNom] = useState(company.nom);
  const [secteur, setSecteur] = useState(company.secteur ?? "");
  const [nomResponsable, setNomResponsable] = useState(company.nom_responsable);
  const [emailResponsable, setEmailResponsable] = useState(
    company.email_responsable,
  );
  const [telephone, setTelephone] = useState(
    company.telephone_responsable ?? "",
  );
  const [nomDirigeant, setNomDirigeant] = useState(company.nom_dirigeant);
  const [mode, setMode] = useState<ModeResultats>(company.mode_resultats);
  const [informes, setInformes] = useState(company.employes_informes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copieOk, setCopieOk] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    const supabase = createClient();
    const { error: err } = await supabase
      .from("companies")
      .update({
        nom: nom.trim(),
        secteur: secteur.trim() || null,
        nom_responsable: nomResponsable.trim(),
        email_responsable: emailResponsable.trim(),
        telephone_responsable: telephone.trim() || null,
        nom_dirigeant: nomDirigeant.trim(),
        mode_resultats: mode,
        employes_informes: informes,
      })
      .eq("id", company.id);

    setSaving(false);

    if (err) {
      setError(err.message);
      return;
    }
    setSuccess("Paramètres enregistrés.");
  }

  async function copierNote() {
    try {
      await navigator.clipboard.writeText(NOTE_INFORMATION);
      setCopieOk(true);
      window.setTimeout(() => setCopieOk(false), 2000);
    } catch {
      setError("Impossible de copier automatiquement — sélectionnez le texte.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <PageHeader
        title="Paramètres"
        description="Informations de votre société et cadre de traitement des résultats."
      />

      {(error || success) && (
        <div className="mb-6 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>
      )}

      <Panel>
        <PanelHeader title="Société" />
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <Field label="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
          <Field
            label="Secteur"
            value={secteur}
            onChange={(e) => setSecteur(e.target.value)}
          />
          <Field
            label="Nom du responsable"
            required
            value={nomResponsable}
            onChange={(e) => setNomResponsable(e.target.value)}
          />
          <Field
            label="Email du responsable"
            type="email"
            required
            value={emailResponsable}
            onChange={(e) => setEmailResponsable(e.target.value)}
          />
          <Field
            label="Téléphone"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
          />
          <Field
            label="Nom du dirigeant (identité usurpée)"
            required
            value={nomDirigeant}
            onChange={(e) => setNomDirigeant(e.target.value)}
          />
        </div>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Mode de résultats"
          description="Cadre CNIL : informez vos collaborateurs et choisissez le niveau de détail des résultats."
        />
        <div className="space-y-3 px-6 py-5">
          {(
            [
              {
                value: "nominatif" as const,
                titre: "Nominatif",
                texte:
                  "Les résultats (clic, signalement, score quiz) restent associés à chaque collaborateur. Réservé à un usage interne de sensibilisation, avec information préalable.",
              },
              {
                value: "anonymise" as const,
                titre: "Anonymisé",
                texte:
                  "Seuls des agrégats sont exploités pour le pilotage. Les résultats individuels ne sont pas mis en avant dans le reporting.",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 ${
                mode === opt.value
                  ? "border-accent-line bg-accent-soft"
                  : "border-border bg-surface-2/40"
              }`}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[13.5px] font-medium text-foreground">
                  {opt.titre}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                  {opt.texte}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Information des collaborateurs" />
        <div className="space-y-4 px-6 py-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={informes}
              onChange={(e) => setInformes(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-[13.5px] leading-relaxed text-muted">
              <span className="font-medium text-foreground">
                Les employés ont été informés
              </span>{" "}
              que des simulations de fraude consenties peuvent avoir lieu.
            </span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-medium text-muted">
                Modèle de note d&apos;information
              </p>
              <button
                type="button"
                onClick={() => void copierNote()}
                className={buttonSecondary}
              >
                {copieOk ? "Copié" : "Copier"}
              </button>
            </div>
            <textarea
              readOnly
              rows={14}
              value={NOTE_INFORMATION}
              className={`${inputClass} h-auto resize-y py-3 font-mono text-[12px] leading-relaxed text-muted`}
            />
          </div>
        </div>
      </Panel>

      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
