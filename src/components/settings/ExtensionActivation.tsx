"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";
import { IconCheck, IconRefresh } from "@/components/icons";

type Props = {
  /** Code actuel, rendu côté serveur */
  codeInitial: string;
};

/**
 * Bloc d'activation de l'extension : affichage du code, copie,
 * et rotation du code (qui invalide les postes déjà activés).
 */
export function ExtensionActivation({ codeInitial }: Props) {
  const router = useRouter();
  const [code, setCode] = useState(codeInitial);
  const [copieOk, setCopieOk] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [rotation, setRotation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  async function copier() {
    setErreur(null);
    try {
      await navigator.clipboard.writeText(code);
      setCopieOk(true);
      window.setTimeout(() => setCopieOk(false), 2000);
    } catch {
      setErreur("Impossible de copier automatiquement — sélectionnez le code.");
    }
  }

  async function regenerer() {
    setErreur(null);
    setSucces(null);
    setRotation(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("regenerer_code_activation");

    setRotation(false);
    setConfirmation(false);

    if (error || !data) {
      setErreur(
        "La régénération a échoué. Rechargez la page et réessayez.",
      );
      return;
    }

    setCode(data as string);
    setSucces(
      "Nouveau code généré. Les postes déjà activés doivent le saisir à nouveau.",
    );
    router.refresh();
  }

  return (
    <>
      <Panel>
        <PanelHeader
          title="Code d'activation de votre société"
          description="Ce code relie l'extension installée par vos collaborateurs à votre espace. C'est le seul secret qui autorise la remontée d'alertes : diffusez-le en interne uniquement."
        />

        <div className="space-y-4 px-6 py-5">
          {erreur && <Alert tone="error">{erreur}</Alert>}
          {succes && <Alert tone="success">{succes}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <code className="tabular select-all rounded-lg border border-accent-line bg-accent-soft px-4 py-3 font-mono text-[20px] font-semibold tracking-[0.08em] text-accent-text">
              {code}
            </code>

            <button
              type="button"
              onClick={copier}
              className={buttonSecondary}
              aria-live="polite"
            >
              {copieOk ? <IconCheck /> : null}
              {copieOk ? "Copié" : "Copier"}
            </button>
          </div>

          <p className="text-[12.5px] leading-relaxed text-faint">
            Le code ne donne accès à aucune donnée de votre espace : il autorise
            seulement l&apos;envoi d&apos;alertes vers votre tableau de bord.
          </p>
        </div>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Régénérer le code"
          description="Utile si le code a circulé hors de l'entreprise. Les extensions déjà activées cesseront de remonter des alertes tant que le nouveau code n'y sera pas saisi."
        />

        <div className="px-6 py-5">
          {confirmation ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13.5px] text-foreground">
                Confirmer&nbsp;? Tous les postes devront être réactivés.
              </span>
              <button
                type="button"
                onClick={regenerer}
                disabled={rotation}
                className={buttonPrimary}
              >
                {rotation ? "Génération…" : "Oui, régénérer"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmation(false)}
                disabled={rotation}
                className={buttonSecondary}
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmation(true)}
              className={buttonSecondary}
            >
              <IconRefresh />
              Régénérer le code
            </button>
          )}
        </div>
      </Panel>
    </>
  );
}
