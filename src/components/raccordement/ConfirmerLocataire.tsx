"use client";

/**
 * D-SÉCURITÉ — le dirigeant reconnaît le locataire Microsoft.
 *
 * ⚠ UN CLIC CONTRE UN RATTACHEMENT DE LOCATAIRE PIRATE. Détenir le lien ne
 *   suffit pas à donner l'accord : Microsoft exige de s'authentifier comme
 *   administrateur général du locataire. Mais un attaquant qui contrôle SON
 *   PROPRE locataire pourrait y rattacher la société du client. Cet écran
 *   ferme cette porte, et c'est la seule qui restait ouverte.
 *
 * ⚠ IL BLOQUE LA SUITE, IL NE SE CONTENTE PAS D'INFORMER. Un bandeau qu'on peut
 *   ignorer ne protège de rien : la moitié des gens cliquent « plus tard » et
 *   la porte reste ouverte. Tant que ce n'est pas confirmé, l'écran ne montre
 *   pas le reste.
 */
import { useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { Encadre } from "@/components/microsoft/commun";

export function ConfirmerLocataire({
  tenantId,
  onConfirme,
}: {
  tenantId: string;
  onConfirme: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/confirmer-locataire", {
        method: "POST",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onConfirme();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setEnvoi(false);
    }
  }

  if (refus) {
    return (
      <Encadre ton="danger" titre="N’allez pas plus loin">
        <p>
          Si ce n’est pas votre organisation Microsoft, quelqu’un d’autre a
          utilisé le lien que vous avez transmis. <strong>Ne confirmez
          pas</strong> : la surveillance ne démarrera pas.
        </p>
        <p className="mt-2">
          Écrivez-nous à <strong>contact@safentreprise.com</strong> en le
          signalant. Nous coupons le rattachement et vous en donnons un
          nouveau. En attendant, aucun de vos messages n’est lu.
        </p>
      </Encadre>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="titre-section text-foreground">
        Est-ce bien votre organisation&nbsp;?
      </h2>

      <p className="texte-courant text-muted">
        Une organisation Microsoft vient d’être rattachée à votre compte
        Safentreprise. Avant de démarrer la surveillance, nous vous demandons de
        la reconnaître.
      </p>

      <div className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="texte-second">Organisation rattachée</p>
        {/* `tabular-nums` via `.adresse` : un identifiant se lit caractère par
            caractère, il ne doit pas danser. */}
        <p className="adresse mt-1 break-all text-[14px] text-foreground">
          {tenantId}
        </p>
      </div>

      <Encadre ton="info" titre="Pourquoi on vous le demande">
        <p>
          Le lien que vous avez transmis permet de rattacher une organisation
          Microsoft à votre compte. Il faut être administrateur de cette
          organisation pour le faire — mais rien n’empêcherait quelqu’un de
          rattacher <strong>la sienne</strong>. Cette confirmation est ce qui
          l’en empêche.
        </p>
      </Encadre>

      {erreur && (
        <Encadre ton="attention" titre="La confirmation n’est pas passée">
          <p>{erreur}</p>
        </Encadre>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void confirmer()}
          disabled={envoi}
          className={buttonPrimary}
        >
          {envoi ? "Enregistrement…" : "Oui, c’est bien la nôtre"}
        </button>
        <button
          type="button"
          onClick={() => setRefus(true)}
          className={buttonSecondary}
        >
          Non, ce n’est pas nous
        </button>
      </div>
    </div>
  );
}
