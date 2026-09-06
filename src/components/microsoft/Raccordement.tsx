"use client";

/**
 * Le parcours de raccordement Microsoft 365, de bout en bout.
 *
 * ⚠ L'ÉTAPE AFFICHÉE VIENT DU SERVEUR. Le client fermera son onglet entre le
 *   moment où il transmet le script et le retour de son administrateur —
 *   parfois plusieurs jours. Rien n'est gardé dans le navigateur : à la
 *   réouverture, la page reprend exactement là où la BASE dit qu'on en est.
 *
 *   Le seul état local est `vue`, qui permet de revenir volontairement sur une
 *   étape déjà faite (modifier la sélection de boîtes). Il ne survit pas au
 *   rechargement, et c'est voulu : ce n'est pas une progression, c'est un
 *   détour.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconArrowRight, IconRefresh } from "@/components/icons";
import type { EtapeRaccordement, Raccordement as Etat } from "@/lib/microsoft/etat";
import { ChoixBoites } from "./ChoixBoites";
import { EcranRestriction } from "./EcranRestriction";
import { EtatSurveillance } from "./EtatSurveillance";
import { Encadre, Progression } from "./commun";

export function Raccordement({ etat }: { etat: Etat }) {
  const router = useRouter();
  const [detour, setDetour] = useState<EtapeRaccordement | null>(null);

  const etape = detour ?? etat.etape;

  function rafraichir() {
    setDetour(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Progression etape={etape} />

      {etape === "non-raccorde" && <EtapeAutoriser etat={etat} />}

      {etape === "boites" && etat.tenant_uid && (
        <ChoixBoites
          tenantUid={etat.tenant_uid}
          temoinUpn={etat.temoin_upn}
          onEnregistre={rafraichir}
          retour={detour ? () => setDetour(null) : undefined}
        />
      )}

      {etape === "restriction" && etat.tenant_uid && (
        <EcranRestriction
          tenantUid={etat.tenant_uid}
          onVerifie={rafraichir}
          onModifierSelection={() => setDetour("boites")}
        />
      )}

      {etape === "activation" && etat.tenant_uid && (
        <EtapeDemarrer tenantUid={etat.tenant_uid} onDemarre={rafraichir} />
      )}

      {etape === "actif" && (
        <Encadre ton="succes" titre="La surveillance est en place">
          Les messages qui arrivent dans les boîtes ci-dessous sont analysés. Les
          tentatives repérées apparaissent dans l&apos;onglet Menaces, et le
          message reçu porte une bannière d&apos;avertissement.
        </Encadre>
      )}

      {/* L'état est permanent : il reste visible à toutes les étapes, dès
          qu'un locataire existe. Le client doit pouvoir vérifier ce qui est
          réellement surveillé sans avoir à refaire le parcours. */}
      {etat.tenant_uid && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
              État du raccordement
            </h2>
            <div className="flex flex-wrap gap-2">
              {etape !== "boites" && etat.boites.some((b) => b.choisie) && (
                <button
                  type="button"
                  onClick={() => setDetour("boites")}
                  className={buttonSecondary}
                >
                  Modifier les boîtes
                </button>
              )}
              <button
                type="button"
                onClick={() => router.refresh()}
                className={buttonSecondary}
              >
                <IconRefresh />
                Actualiser
              </button>
            </div>
          </div>

          <EtatSurveillance etat={etat} />
        </>
      )}
    </div>
  );
}

/* ==========================================================================
   Étape 1 — l'accord administrateur
   ========================================================================== */

function EtapeAutoriser({ etat }: { etat: Etat }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function demarrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/microsoft/consentement/demarrer", {
        method: "POST",
      });
      const corps = await reponse.json();
      if (!reponse.ok || !corps.url) {
        setErreur(corps.erreur ?? "Le raccordement n'a pas pu être préparé.");
        return;
      }
      window.location.href = corps.url as string;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-4">
      {etat.statut === "revoque" && (
        <Encadre ton="danger" titre="L'autorisation a été retirée">
          Un administrateur a retiré l&apos;accès de Safentreprise dans votre
          annuaire Microsoft. Plus aucun message n&apos;est analysé. Redonner
          l&apos;accord ci-dessous reprend le parcours.
        </Encadre>
      )}

      <Encadre ton="info" titre="Ce que vous allez autoriser">
        <p>
          Vous allez être redirigé vers Microsoft, qui demandera à un{" "}
          <strong className="font-medium text-foreground">
            administrateur de votre organisation
          </strong>{" "}
          d&apos;autoriser Safentreprise à lire et modifier le courrier.
        </p>
        <p className="mt-2">
          Microsoft ne sait pas limiter cette autorisation à quelques boîtes au
          moment de l&apos;accord : elle porte d&apos;abord sur toutes. Les deux
          étapes suivantes servent précisément à la ramener aux seules boîtes
          que vous aurez choisies, et à le vérifier.{" "}
          <strong className="font-medium text-foreground">
            Aucun message n&apos;est analysé avant cette vérification.
          </strong>
        </p>
      </Encadre>

      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h3 className="text-[14px] font-semibold text-foreground">
          Ce dont vous avez besoin
        </h3>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
          <li>
            Le compte d&apos;un administrateur général Microsoft 365, ou son
            aide pour cette étape.
          </li>
          <li>
            Un peu plus tard, un administrateur Exchange qui exécutera un court
            script PowerShell. Vous pourrez lui transmettre le script sans
            refaire le parcours.
          </li>
        </ul>
      </section>

      {erreur && (
        <Encadre ton="danger" titre="Le raccordement n'a pas pu démarrer">
          {erreur}
        </Encadre>
      )}

      <button
        type="button"
        disabled={envoi}
        onClick={() => void demarrer()}
        className={buttonPrimary}
      >
        {envoi ? "Préparation…" : "Autoriser chez Microsoft"}
        <IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ==========================================================================
   Étape 4 — démarrer la surveillance
   ========================================================================== */

type Bilan = {
  surveillance_active: boolean;
  message: string;
  abonnements?: {
    crees: number;
    echecs: number;
    details: { upn?: string; etat?: string; erreur?: string }[];
  };
  annuaire?: { etat?: string; personnes?: number; erreur?: string };
  erreur?: string;
};

function EtapeDemarrer({
  tenantUid,
  onDemarre,
}: {
  tenantUid: string;
  onDemarre: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  async function demarrer() {
    setEnvoi(true);
    setBilan(null);
    try {
      const reponse = await fetch(
        `/api/microsoft/activation?tenant=${encodeURIComponent(tenantUid)}`,
        { method: "POST" },
      );
      const corps = (await reponse.json()) as Bilan;
      setBilan(corps);
      if (corps.surveillance_active) setTimeout(onDemarre, 1500);
    } catch (e) {
      setBilan({
        surveillance_active: false,
        message: "Le démarrage n'a pas abouti.",
        erreur: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnvoi(false);
    }
  }

  const echecs = bilan?.abonnements?.details.filter((d) => d.etat === "echec") ?? [];

  return (
    <div className="space-y-4">
      <Encadre ton="succes" titre="La restriction est vérifiée">
        Safentreprise ne peut atteindre que les boîtes que vous avez choisies —
        Microsoft nous refuse les autres, et nous l&apos;avons constaté. Il
        reste à demander à Microsoft de nous prévenir à chaque nouveau message
        dans ces boîtes.
      </Encadre>

      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h3 className="text-[14px] font-semibold text-foreground">
          Ce que fait ce dernier geste
        </h3>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
          <li>
            Il abonne chaque boîte vérifiée aux notifications Microsoft : à
            partir de là, chaque message reçu est analysé.
          </li>
          <li>
            Il lit une fois votre annuaire — noms, adresses, domaines — pour
            savoir reconnaître une usurpation de vos dirigeants et de vos
            collaborateurs.
          </li>
        </ul>
      </section>

      {bilan && (
        <Encadre
          ton={
            bilan.surveillance_active
              ? "succes"
              : echecs.length > 0
                ? "attention"
                : "danger"
          }
          titre={
            bilan.surveillance_active
              ? "La surveillance est en marche"
              : "Le démarrage n'est pas complet"
          }
        >
          <p>{bilan.erreur ?? bilan.message}</p>

          {echecs.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {echecs.map((d, i) => (
                <li key={`${d.upn}-${i}`} className="text-[12.5px]">
                  <span className="font-mono text-foreground">{d.upn}</span> —{" "}
                  {d.erreur}
                </li>
              ))}
            </ul>
          )}

          {bilan.annuaire?.etat === "echec" && (
            <p className="mt-2 text-[12.5px]">
              L&apos;annuaire n&apos;a pas pu être lu. La surveillance
              fonctionne quand même, mais la détection d&apos;usurpation est
              moins fine tant que ce n&apos;est pas rattrapé.
            </p>
          )}
        </Encadre>
      )}

      <button
        type="button"
        disabled={envoi}
        onClick={() => void demarrer()}
        className={buttonPrimary}
      >
        {envoi ? "Démarrage…" : "Démarrer la surveillance"}
        <IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
