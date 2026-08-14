"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, buttonPrimary, inputClass } from "@/components/ui";
import { IconCheck } from "@/components/icons";

type Champs = {
  nom: string;
  entreprise: string;
  email: string;
  telephone: string;
  message: string;
};

const CHAMPS_VIDES: Champs = {
  nom: "",
  entreprise: "",
  email: "",
  telephone: "",
  message: "",
};

/**
 * Formulaire de demande de démonstration.
 * Envoie la demande à /api/demo, qui l'enregistre dans la table demandes_demo.
 */
export function DemoRequestForm() {
  const [champs, setChamps] = useState<Champs>(CHAMPS_VIDES);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  /** Met à jour un seul champ sans toucher aux autres. */
  function modifier(champ: keyof Champs, valeur: string) {
    setChamps((precedent) => ({ ...precedent, [champ]: valeur }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(champs),
      });

      const donnees = (await reponse.json()) as { erreur?: string };

      if (!reponse.ok) {
        setErreur(
          donnees.erreur ??
            "L'enregistrement a échoué. Réessayez dans un instant.",
        );
        return;
      }

      setEnvoye(true);
    } catch {
      setErreur(
        "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      setEnvoi(false);
    }
  }

  // Confirmation : le formulaire disparaît au profit du message de succès
  if (envoye) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
          <IconCheck />
        </span>
        <h2 className="mt-5 text-[18px] font-bold text-foreground">
          Demande enregistrée
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-muted">
          Merci {champs.nom.split(" ")[0]}. Nous revenons vers vous sous
          24&nbsp;heures ouvrées à l&apos;adresse {champs.email} pour convenir
          d&apos;un créneau de démonstration.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-surface px-6 py-7"
    >
      <div>
        <h2 className="text-[16px] font-bold text-foreground">
          Demander une démonstration
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          30 minutes, en visioconférence, sur vos propres cas.
        </p>
      </div>

      {erreur && <Alert tone="error">{erreur}</Alert>}

      <Field
        label="Nom et prénom"
        required
        value={champs.nom}
        onChange={(e) => modifier("nom", e.target.value)}
        placeholder="Sophie Martin"
        autoComplete="name"
      />

      <Field
        label="Entreprise"
        required
        value={champs.entreprise}
        onChange={(e) => modifier("entreprise", e.target.value)}
        placeholder="Martin & Associés"
        autoComplete="organization"
      />

      <Field
        label="Email professionnel"
        type="email"
        required
        value={champs.email}
        onChange={(e) => modifier("email", e.target.value)}
        placeholder="vous@entreprise.fr"
        autoComplete="email"
      />

      <Field
        label="Téléphone"
        hint="facultatif"
        type="tel"
        value={champs.telephone}
        onChange={(e) => modifier("telephone", e.target.value)}
        placeholder="06 12 34 56 78"
        autoComplete="tel"
      />

      <Field label="Votre contexte" hint="facultatif">
        <textarea
          value={champs.message}
          onChange={(e) => modifier("message", e.target.value)}
          rows={3}
          placeholder="Nombre de collaborateurs, échéance, question particulière…"
          className={`${inputClass} h-auto resize-y py-2.5 leading-relaxed`}
        />
      </Field>

      <button
        type="submit"
        disabled={envoi}
        className={`${buttonPrimary} mt-2 w-full`}
      >
        {envoi ? "Envoi…" : "Envoyer ma demande"}
      </button>

      <p className="pt-1 text-[12px] leading-relaxed text-faint">
        Vos coordonnées servent uniquement à organiser cette démonstration.
      </p>
    </form>
  );
}
