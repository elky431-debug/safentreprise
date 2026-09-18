"use client";

/**
 * « Je suis bloqué », présent à CHAQUE étape.
 *
 * ⚠ NE PAS L'ENTERRER DANS UN PIED DE PAGE NI LE TRANSFORMER EN LIEN DISCRET.
 *   Quelqu'un de bloqué ne cherche pas : il ferme l'onglet. Le bouton doit
 *   être visible au moment exact où ça coince, c'est-à-dire partout.
 */
import { useState } from "react";
import { buttonGhost, buttonPrimary, buttonSecondary } from "@/components/ui";
import { Encadre } from "@/components/microsoft/commun";

const MOTIFS = [
  { cle: "role-manquant", libelle: "Je n’ai pas le rôle nécessaire" },
  { cle: "script-echoue", libelle: "Le script échoue" },
  { cle: "verification-echoue", libelle: "La vérification ne passe pas" },
  { cle: "autre", libelle: "Autre chose" },
] as const;

export function BoutonBloque({
  jeton,
  etape,
  erreurTechnique,
}: {
  jeton: string;
  etape: string;
  /** Joint automatiquement : évite l'aller-retour « quelle erreur exactement ? ». */
  erreurTechnique?: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<string>("autre");
  const [texte, setTexte] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/blocage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jeton,
          etape,
          motif,
          texte: texte || null,
          erreur: erreurTechnique ?? null,
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

  if (envoye) {
    return (
      <Encadre ton="succes" titre="C’est signalé">
        <p>
          Nous sommes prévenus, et la personne qui vous a transmis ce lien aussi.
          Le lien reste valable : vous pourrez reprendre où vous en êtes.
        </p>
      </Encadre>
    );
  }

  if (!ouvert) {
    return (
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className={buttonGhost}
        >
          Je suis bloqué
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface px-5 py-4">
      <p className="titre-bloc text-foreground">Qu’est-ce qui bloque&nbsp;?</p>

      <div className="space-y-1.5">
        {MOTIFS.map((m) => (
          <label key={m.cle} className="flex cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              name="motif-blocage"
              value={m.cle}
              checked={motif === m.cle}
              onChange={() => setMotif(m.cle)}
              className="h-4 w-4"
            />
            <span className="text-[13.5px] text-foreground">{m.libelle}</span>
          </label>
        ))}
      </div>

      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={3}
        placeholder="Détail, si vous voulez"
        className="w-full rounded-[12px] border border-border bg-surface px-3 py-2 text-[13.5px] text-foreground"
      />

      {erreurTechnique && (
        <p className="texte-second">
          Le message d’erreur technique sera joint automatiquement.
        </p>
      )}

      {erreur && (
        <Encadre ton="attention" titre="Le signalement n’est pas parti">
          <p>{erreur}</p>
        </Encadre>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={envoi}
          className={buttonPrimary}
        >
          {envoi ? "Envoi…" : "Envoyer"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className={buttonSecondary}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
