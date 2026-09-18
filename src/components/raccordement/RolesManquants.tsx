"use client";

/**
 * Ce qu'on affiche à quelqu'un qui n'a pas les rôles.
 *
 * ⚠ CET ÉCRAN EXISTE POUR QU'UN « NON » NE SOIT PAS UNE IMPASSE. Sans lui,
 *   l'informaticien referme l'onglet et personne n'apprend jamais pourquoi le
 *   raccordement n'a pas avancé — c'est le blocage silencieux, le plus
 *   fréquent et le plus coûteux. Il lui faut donc trois choses : quoi
 *   demander, à qui, et un moyen de prévenir sans écrire un mail.
 */
import { useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { Encadre } from "@/components/microsoft/commun";

export function RolesManquants({
  jeton,
  dirigeant,
  onRetour,
}: {
  jeton: string;
  dirigeant: string;
  onRetour: () => void;
}) {
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function prevenir() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/blocage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jeton,
          etape: "I0",
          motif: "role-manquant",
          texte: "L’informaticien indique ne pas disposer des rôles requis.",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEnvoye(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="titre-section text-foreground">
        Il vous manque un rôle Microsoft
      </h1>

      <p className="texte-courant text-muted">
        Ce n’est pas bloquant : les deux rôles peuvent être portés par deux
        personnes différentes, et le lien se repasse tel quel.
      </p>

      <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="titre-bloc text-foreground">Ce qu’il faut demander</p>
        <ul className="mt-3 space-y-3">
          <li className="texte-courant text-muted">
            <span className="font-semibold text-foreground">
              Administrateur général
            </span>
            {" "}— pour l’étape 1 uniquement. Il peut être retiré juste après.
          </li>
          <li className="texte-courant text-muted">
            <span className="font-semibold text-foreground">
              Administrateur Exchange
            </span>
            {" "}— pour l’étape 3, l’exécution du script.
          </li>
        </ul>
      </section>

      <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="titre-bloc text-foreground">À qui</p>
        <p className="texte-courant mt-1.5 text-muted">
          À la personne qui administre le locataire Microsoft 365 de
          l’entreprise. Dans une PME, c’est souvent le prestataire
          informatique ; parfois le dirigeant lui-même, sans le savoir, parce
          que c’est lui qui a créé l’abonnement.
        </p>
        <p className="texte-second mt-2.5">
          Dans le portail Microsoft&nbsp;: Rôles → Administrateur général →
          Attributions actives.
        </p>
      </section>

      {envoye ? (
        <Encadre ton="succes" titre="C’est noté">
          <p>
            {dirigeant} et Safentreprise sont prévenus. Vous pouvez fermer cette
            page ; le lien reste valable si vous obtenez les rôles plus tard.
          </p>
        </Encadre>
      ) : (
        <div className="space-y-3">
          {erreur && (
            <Encadre ton="attention" titre="Le signalement n’est pas parti">
              <p>{erreur} — vous pouvez réessayer.</p>
            </Encadre>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void prevenir()}
              disabled={envoi}
              className={buttonPrimary}
            >
              {envoi ? "Envoi…" : `Prévenir ${dirigeant}`}
            </button>
            <button type="button" onClick={onRetour} className={buttonSecondary}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
