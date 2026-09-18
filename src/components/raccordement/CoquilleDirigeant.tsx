"use client";

/**
 * La coquille du parcours dirigeant : D1 à D5, plus D-SÉCURITÉ.
 *
 * ⚠ ELLE S'INTERCALE AVANT L'ANCIEN PARCOURS, ELLE NE LE REMPLACE PAS. Un
 *   raccordement déjà ACTIF ne repasse jamais par ici — c'est la règle de
 *   compatibilité arrêtée avec le document. Et le dirigeant qui déclare être
 *   l'administrateur retombe sur l'ancien parcours, intact.
 *
 * ⚠ L'ORDRE DES ÉCRANS EST UN ORDRE DE PRIORITÉ, PAS UNE SUITE. La
 *   confirmation du locataire passe AVANT le suivi : tant qu'elle n'est pas
 *   faite, le reste ne s'affiche pas. Un bandeau qu'on peut ignorer ne protège
 *   de rien.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Encadre } from "@/components/microsoft/commun";
import { buttonSecondary } from "@/components/ui";
import { IconRefresh } from "@/components/icons";
import { Transmettre } from "./Transmettre";
import { SuiviRaccordement } from "./SuiviRaccordement";
import { ConfirmerLocataire } from "./ConfirmerLocataire";
import { phaseDe, type Suivi } from "@/lib/raccordement/suivi";

export function CoquilleDirigeant({
  onInstallerMoiMeme,
}: {
  onInstallerMoiMeme: () => void;
}) {
  const router = useRouter();
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/suivi", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { suivi: Suivi | null };
      setSuivi(j.suivi);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  async function changerInformaticien() {
    await fetch("/api/raccordement/suivi", { method: "DELETE" }).catch(() => {});
    setSuivi(null);
  }

  if (!charge) return <p className="texte-second">Lecture…</p>;

  if (erreur && !suivi) {
    return (
      <Encadre ton="attention" titre="Nous n’avons pas pu lire l’avancement">
        <p>
          Le raccordement n’a pas bougé — c’est l’affichage qui n’a pas pu se
          mettre à jour ({erreur}).
        </p>
        <button
          type="button"
          onClick={() => void relire()}
          className={`${buttonSecondary} mt-2.5`}
        >
          <IconRefresh className="h-4 w-4" />
          Réessayer
        </button>
      </Encadre>
    );
  }

  // Aucun lien vivant : le dirigeant n'a encore rien transmis.
  if (!suivi) {
    return (
      <Transmettre
        onTransmis={() => void relire()}
        onInstallerMoiMeme={onInstallerMoiMeme}
      />
    );
  }

  // ⚠ LA CONFIRMATION DU LOCATAIRE DOMINE. Voir le commentaire d'en-tête.
  if (suivi.accord_donne && suivi.tenant_id && !suivi.tenant_confirme_at) {
    return (
      <ConfirmerLocataire
        tenantId={suivi.tenant_id}
        onConfirme={() => void relire()}
      />
    );
  }

  // D5 — la confirmation de fin.
  if (phaseDe(suivi) === "actif") {
    return (
      <div className="space-y-4">
        <h2 className="titre-section text-foreground">
          La surveillance est active
        </h2>
        <Encadre ton="succes" titre={`${suivi.boites_actives} boîte${suivi.boites_actives > 1 ? "s" : ""} surveillée${suivi.boites_actives > 1 ? "s" : ""}`}>
          <p>
            Les messages qui y arrivent sont analysés. Les tentatives repérées
            apparaissent dans l’onglet Menaces, et le message reçu porte une
            bannière d’avertissement.
          </p>
        </Encadre>
        <button
          type="button"
          onClick={() => router.refresh()}
          className={buttonSecondary}
        >
          <IconRefresh className="h-4 w-4" />
          Voir le détail
        </button>
      </div>
    );
  }

  return (
    <SuiviRaccordement
      suivi={suivi}
      onChanger={() => void changerInformaticien()}
      onRafraichir={() => void relire()}
    />
  );
}
