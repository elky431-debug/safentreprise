"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Alert, Field, buttonPrimaryLg, inputClass } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { EFFECTIFS, REPONSES_MICROSOFT } from "@/lib/demo";

type Champs = {
  entreprise: string;
  effectif: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  microsoft365: string;
  besoin: string;
};

const CHAMPS_VIDES: Champs = {
  entreprise: "",
  effectif: "",
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  microsoft365: "",
  besoin: "",
};

/**
 * Liste déroulante : même apparence que les champs texte.
 *
 * ⚠ PAS D'`appearance-none` : sans chevron dessiné pour le remplacer, il ne
 *   restait qu'un champ texte d'apparence, sans rien qui signale qu'il
 *   s'ouvre. La flèche native est laissée en place.
 */
const selectClass = `${inputClass} pr-9`;

/**
 * Formulaire de demande de démonstration.
 * Envoie la demande à /api/demo, qui l'enregistre dans la table demandes_demo.
 *
 * ⚠ LES DEUX LISTES VIENNENT DE `@/lib/demo`, PAS D'UNE COPIE LOCALE. La route
 *   valide contre exactement les mêmes valeurs : une option ajoutée ici sans
 *   l'être là-bas serait refusée par le serveur au moment de l'envoi.
 *
 * `offre` : nom de l'offre depuis laquelle la demande a été lancée (page
 * /tarifs). Il pré-remplit le besoin pour que la demande arrive qualifiée.
 */
export function DemoRequestForm({ offre }: { offre?: string }) {
  const [champs, setChamps] = useState<Champs>(() => ({
    ...CHAMPS_VIDES,
    besoin: offre ? `Je souhaite un devis pour l’offre ${offre}.` : "",
  }));
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
      <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-[0_18px_48px_-24px_rgba(16,24,40,0.22)]">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
          <IconCheck />
        </span>
        <h2 className="mt-5 text-[18px] font-semibold text-foreground">
          Demande enregistrée
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-muted">
          Merci {champs.prenom}. Nous revenons vers vous sous 24&nbsp;heures
          ouvrées à l&apos;adresse {champs.email} pour convenir d&apos;un
          créneau de démonstration.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface px-6 py-7 shadow-[0_18px_48px_-24px_rgba(16,24,40,0.22)] md:px-8 md:py-8"
    >
      {erreur && (
        <div className="mb-5">
          <Alert tone="error">{erreur}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Entreprise"
            required
            value={champs.entreprise}
            onChange={(e) => modifier("entreprise", e.target.value)}
            placeholder="Martin & Associés"
            autoComplete="organization"
          />
        </div>

        <div className="sm:col-span-2">
          <Field label="Effectif de votre entreprise">
            <select
              required
              value={champs.effectif}
              onChange={(e) => modifier("effectif", e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Choisissez…
              </option>
              {EFFECTIFS.map((effectif) => (
                <option key={effectif} value={effectif}>
                  {effectif}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Prénom"
          required
          value={champs.prenom}
          onChange={(e) => modifier("prenom", e.target.value)}
          placeholder="Sophie"
          autoComplete="given-name"
        />

        <Field
          label="Nom"
          required
          value={champs.nom}
          onChange={(e) => modifier("nom", e.target.value)}
          placeholder="Martin"
          autoComplete="family-name"
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
          type="tel"
          required
          value={champs.telephone}
          onChange={(e) => modifier("telephone", e.target.value)}
          placeholder="06 12 34 56 78"
          autoComplete="tel"
        />

        <div className="sm:col-span-2">
          <Field label="Utilisez-vous Microsoft 365 ?">
            <select
              required
              value={champs.microsoft365}
              onChange={(e) => modifier("microsoft365", e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Choisissez…
              </option>
              {REPONSES_MICROSOFT.map((reponse) => (
                <option key={reponse} value={reponse}>
                  {reponse}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Dites-nous en plus sur votre besoin" hint="facultatif">
            <textarea
              value={champs.besoin}
              onChange={(e) => modifier("besoin", e.target.value)}
              rows={4}
              placeholder="Échéance, organisation comptable, question particulière…"
              className={`${inputClass} h-auto resize-y py-2.5 leading-relaxed`}
            />
          </Field>
        </div>
      </div>

      <button
        type="submit"
        disabled={envoi}
        className={`${buttonPrimaryLg} mt-6 w-full`}
      >
        {envoi ? "Envoi…" : "Demander une démo"}
      </button>

      <p className="mt-3.5 text-[12px] leading-relaxed text-faint">
        Les informations recueillies servent uniquement à traiter votre demande.
        Consultez notre{" "}
        <Link
          href="/politique-de-confidentialite"
          className="underline underline-offset-2 transition-colors hover:text-muted"
        >
          politique de confidentialité
        </Link>
        .
      </p>
    </form>
  );
}
