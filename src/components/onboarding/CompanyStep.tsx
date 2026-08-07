"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Field,
  Panel,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

type Props = {
  userId: string;
  userEmail: string;
  /** Remonte l'identifiant de la société créée pour enchaîner sur l'étape 2. */
  onDone: (companyId: string) => void;
};

/** Étape 1 : informations société et identité du dirigeant à usurper. */
export function CompanyStep({ userId, userEmail, onDone }: Props) {
  const [nom, setNom] = useState("");
  const [nomResponsable, setNomResponsable] = useState("");
  const [emailResponsable, setEmailResponsable] = useState(userEmail);
  const [telephoneResponsable, setTelephoneResponsable] = useState("");
  const [secteur, setSecteur] = useState("");
  const [nomDirigeant, setNomDirigeant] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Le responsable est souvent le dirigeant lui-même : on recopie son nom. */
  function copierResponsable() {
    setNomDirigeant(nomResponsable);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("companies")
      .insert({
        nom: nom.trim(),
        secteur: secteur.trim() || null,
        nom_responsable: nomResponsable.trim(),
        email_responsable: emailResponsable.trim(),
        telephone_responsable: telephoneResponsable.trim() || null,
        nom_dirigeant: nomDirigeant.trim(),
        user_id: userId,
        mode_resultats: "nominatif",
        employes_informes: false,
      })
      .select("id")
      .single<{ id: string }>();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "La société n'a pas pu être enregistrée.");
      return;
    }

    onDone(data.id);
  }

  return (
    <Panel className="p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Nom de l'entreprise"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Dupont Finance SAS"
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Nom du responsable"
            hint="Qui gère les campagnes"
            required
            value={nomResponsable}
            onChange={(e) => setNomResponsable(e.target.value)}
            placeholder="Claire Bertin"
          />

          <Field
            label="Email du responsable"
            type="email"
            required
            value={emailResponsable}
            onChange={(e) => setEmailResponsable(e.target.value)}
            placeholder="claire.bertin@entreprise.fr"
          />

          <Field
            label="Téléphone du responsable"
            type="tel"
            required
            value={telephoneResponsable}
            onChange={(e) => setTelephoneResponsable(e.target.value)}
            placeholder="06 12 34 56 78"
          />

          <Field
            label="Secteur d'activité"
            hint="Facultatif"
            value={secteur}
            onChange={(e) => setSecteur(e.target.value)}
            placeholder="Comptabilité, industrie, BTP…"
          />
        </div>

        <Field
          label="Nom du dirigeant à usurper"
          hint="Celui dont les fraudeurs prendraient l'identité"
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              required
              value={nomDirigeant}
              onChange={(e) => setNomDirigeant(e.target.value)}
              placeholder="Jean Dupont"
            />
            <button
              type="button"
              onClick={copierResponsable}
              disabled={!nomResponsable.trim()}
              className={`${buttonSecondary} shrink-0`}
            >
              C&apos;est moi
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className={`${buttonPrimary} h-10 w-full`}
        >
          {loading ? "Enregistrement…" : "Continuer"}
          {!loading && <IconArrowRight />}
        </button>
      </form>
    </Panel>
  );
}
