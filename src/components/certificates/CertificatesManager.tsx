"use client";

import { useState } from "react";
import {
  Alert,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

export type CertificatLigne = {
  id: string;
  campaign_id: string;
  date_emission: string;
  url_pdf: string | null;
  campagne_nom: string;
};

export type CampagneEligible = {
  id: string;
  nom: string;
  date_envoi: string | null;
};

type Props = {
  certificats: CertificatLigne[];
  eligibles: CampagneEligible[];
};

/**
 * Liste des attestations + génération pour les campagnes « envoyée ».
 */
export function CertificatesManager({ certificats: initial, eligibles }: Props) {
  const [certificats, setCertificats] = useState(initial);
  const [restantes, setRestantes] = useState(eligibles);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  async function generer(campaignId: string, nomCampagne: string) {
    setErreur(null);
    setSucces(null);
    setBusyId(campaignId);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/certificate`, {
        method: "POST",
      });
      const body = (await res.json()) as {
        url_pdf?: string;
        erreur?: string;
      };

      if (!res.ok || !body.url_pdf) {
        setErreur(body.erreur ?? "La génération a échoué.");
        return;
      }

      const maintenant = new Date().toISOString();
      setCertificats((prev) => {
        const sansDoublon = prev.filter((c) => c.campaign_id !== campaignId);
        return [
          {
            id: crypto.randomUUID(),
            campaign_id: campaignId,
            date_emission: maintenant,
            url_pdf: body.url_pdf!,
            campagne_nom: nomCampagne,
          },
          ...sansDoublon,
        ];
      });
      setRestantes((prev) => prev.filter((c) => c.id !== campaignId));
      setSucces(`Attestation générée pour « ${nomCampagne} ».`);
    } catch {
      setErreur("Erreur réseau lors de la génération.");
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Certificats"
        description="Attestations de sensibilisation pour vos campagnes terminées — documents sobres destinés à la conformité interne."
      />

      {erreur && (
        <div className="mb-4">
          <Alert tone="error">{erreur}</Alert>
        </div>
      )}
      {succes && (
        <div className="mb-4">
          <Alert tone="success">{succes}</Alert>
        </div>
      )}

      {restantes.length > 0 && (
        <Panel className="mb-6">
          <PanelHeader
            title="Campagnes éligibles"
            description="Campagnes au statut « envoyée » sans attestation (ou à régénérer ci-dessous)."
          />
          <ul className="divide-y divide-border">
            {restantes.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div>
                  <p className="text-[14px] font-medium text-foreground">
                    {c.nom}
                  </p>
                  {c.date_envoi && (
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Envoyée le {formatDate(c.date_envoi)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={buttonPrimary}
                  disabled={busyId === c.id}
                  onClick={() => generer(c.id, c.nom)}
                >
                  {busyId === c.id
                    ? "Génération…"
                    : "Générer l'attestation"}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Attestations émises"
          description="Téléchargez le PDF récapitulant les taux de clic, signalement et quiz."
        />
        {certificats.length === 0 ? (
          <p className="px-6 py-8 text-[13.5px] text-muted">
            Aucune attestation pour le moment. Terminez une campagne puis
            générez le document ici.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {certificats.map((cert) => (
              <li
                key={cert.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div>
                  <p className="text-[14px] font-medium text-foreground">
                    {cert.campagne_nom}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    Émise le {formatDate(cert.date_emission)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonSecondary}
                    disabled={busyId === cert.campaign_id}
                    onClick={() =>
                      generer(cert.campaign_id, cert.campagne_nom)
                    }
                  >
                    Régénérer
                  </button>
                  {cert.url_pdf && (
                    <a
                      href={cert.url_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonPrimary}
                      download
                    >
                      Télécharger
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
