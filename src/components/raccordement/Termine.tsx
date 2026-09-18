"use client";

/**
 * I6 — la fin.
 *
 * ⚠ LE LIEN SE REFERME ICI, ET ON LE DIT. Laisser croire qu'il reste utilisable
 *   ferait revenir l'informaticien dessus pour « vérifier », sur une page qui
 *   ne fait plus rien. On annonce donc l'état, ce qui a été fait, et qui a été
 *   prévenu — puis plus rien à cliquer.
 */
import { useEffect, useState } from "react";
import { Encadre } from "@/components/microsoft/commun";

export function Termine({
  jeton,
  dirigeant,
  boites,
}: {
  jeton: string;
  dirigeant: string;
  boites: number;
}) {
  const [clos, setClos] = useState(false);

  useEffect(() => {
    // ⚠ LA CLÔTURE EST IDEMPOTENTE CÔTÉ BASE. Deux appels — un rechargement,
    //   un retour en arrière du navigateur — gardent la PREMIÈRE date, celle du
    //   moment où le raccordement a réellement abouti.
    void fetch("/api/raccordement/clore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jeton }),
    })
      .then(() => setClos(true))
      .catch(() => setClos(false));
  }, [jeton]);

  return (
    <div className="space-y-5">
      <h2 className="titre-section text-foreground">C’est opérationnel</h2>

      <Encadre ton="succes" titre="La surveillance est active">
        <p>
          {boites === 1
            ? "Une boîte est surveillée."
            : `${boites} boîtes sont surveillées.`}{" "}
          Les messages qui y arrivent sont analysés, et une bannière est posée
          sur ceux qui présentent un risque.
        </p>
        <p className="mt-2">
          {dirigeant} est prévenu. Vous n’avez plus rien à faire.
        </p>
      </Encadre>

      <p className="texte-second">
        {clos
          ? "Ce lien est refermé : il ne permet plus de modifier le raccordement."
          : "Ce lien se referme automatiquement."}{" "}
        Le périmètre des boîtes surveillées se pilote depuis l’espace
        Safentreprise de la société.
      </p>
    </div>
  );
}
