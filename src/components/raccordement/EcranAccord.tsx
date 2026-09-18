"use client";

/**
 * I1 — l'accord Microsoft.
 *
 * ⚠ ON DIT CE QUE L'AUTORISATION PORTE, ET CE QU'ELLE NE PORTE PAS ENCORE.
 *   L'accord Microsoft s'applique techniquement à TOUTES les boîtes du
 *   locataire : c'est ainsi que Microsoft délivre les autorisations. Le taire
 *   ici pour ne pas inquiéter, puis présenter le script comme une formalité,
 *   ferait de nous exactement ce qu'on reproche aux autres.
 */
import { useState } from "react";
import { buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { Encadre } from "@/components/microsoft/commun";

export function EcranAccord({
  jeton,
  societe,
}: {
  jeton: string;
  societe: string;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function partir() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/consentement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      const j = (await r.json()) as { url?: string; erreur?: string };
      if (!r.ok || !j.url) throw new Error(j.erreur ?? `HTTP ${r.status}`);
      window.location.href = j.url;
    } catch (e) {
      // ⚠ ON RESTE SUR LA PAGE. Rediriger vers une page d'erreur perdrait le
      //   jeton de l'URL et obligerait à rouvrir le mail.
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="texte-second">Étape 1 sur 3</p>
        <h2 className="titre-section mt-0.5 text-foreground">
          Autoriser Safentreprise chez Microsoft
        </h2>
      </header>

      <p className="texte-courant text-muted">
        Vous allez être redirigé vers Microsoft, qui vous demandera de vous
        connecter avec un compte <strong>Administrateur général</strong> et
        d’accorder l’autorisation pour {societe}.
      </p>

      <Encadre ton="info" titre="Ce que cette autorisation permet, à cet instant">
        <p>
          Lire les messages et écrire dans leur corps, sur{" "}
          <strong>toutes les boîtes du locataire</strong>. C’est ainsi que
          Microsoft délivre les autorisations : il n’existe pas de consentement
          limité à quelques boîtes.
        </p>
        <p className="mt-2">
          L’étape 3 ramène cet accès aux seules boîtes choisies. Tant qu’elle
          n’est pas faite, <strong>aucun message n’est analysé</strong> — nous
          refusons de démarrer sur une autorisation trop large.
        </p>
      </Encadre>

      {erreur && (
        <Encadre ton="attention" titre="Nous n’avons pas pu préparer la redirection">
          <p>{erreur}</p>
          <p className="mt-2">
            Rien n’a été envoyé à Microsoft. Vous pouvez réessayer&nbsp;; si
            l’erreur revient, signalez-la avec le bouton en bas de page.
          </p>
        </Encadre>
      )}

      <button
        type="button"
        onClick={() => void partir()}
        disabled={envoi}
        className={buttonPrimary}
      >
        {envoi ? "Préparation…" : "Continuer vers Microsoft"}
        <IconArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
