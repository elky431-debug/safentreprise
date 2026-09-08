"use client";

/**
 * Étape 3 : restreindre l'accès, puis le PROUVER.
 *
 * C'est l'écran le plus exigeant du parcours, parce qu'il demande à un
 * dirigeant de faire exécuter un script par quelqu'un d'autre. Il doit donc
 * répondre à trois questions avant tout le reste : pourquoi c'est nécessaire,
 * ce que le script fait, et ce qu'il ne fait pas.
 *
 * ⚠ LE RÉSULTAT NE SE RÉSUME PAS À « ÇA MARCHE / ÇA NE MARCHE PAS ». Quatre
 *   issues sont distinctes, et la suite à donner n'est pas la même :
 *   la restriction est active ; le script n'a pas été exécuté ; le périmètre
 *   est trop étroit ; il n'y a aucune boîte de contrôle. Les confondre
 *   enverrait le client corriger ce qui n'est pas cassé.
 */
import { useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconCopy, IconDownload, IconRefresh } from "@/components/icons";
import { Encadre, type Ton } from "./commun";

const NOM_FICHIER = "safentreprise-restriction.ps1";

type Script = {
  script: string;
  perimetre: string;
  boites: string[];
  adresses_ignorees: string[];
  temoin_existant: string | null;
  temoin_a_creer: string | null;
  annuaire_lu: boolean;
};

type Issue = { titre: string; explication: string; commande?: string };

type Resultat = {
  verifie: boolean;
  cause:
    | "restriction-active"
    | "acces-non-restreint"
    | "perimetre-trop-restrictif"
    | "aucun-temoin"
    | "indetermine";
  message: string;
  detail?: string;
  issues?: Issue[];
  temoin?: string;
  boites_activees?: number;
};

/** Le titre et le ton de chaque issue. Le message précis vient du serveur. */
const ISSUES: Record<Resultat["cause"], { titre: string; ton: Ton }> = {
  "restriction-active": {
    titre: "Restriction vérifiée — la surveillance peut démarrer",
    ton: "succes",
  },
  // ⚠ NE DIT PLUS « le script n'a pas été exécuté ». Sur un locataire réel,
  //   le script AVAIT été exécuté et Exchange confirmait le périmètre : la
  //   cause était l'autorisation Entra restée à l'échelle du locataire. Un
  //   titre qui affirme une cause non constatée envoie chercher ailleurs.
  "acces-non-restreint": {
    titre: "L'accès n'est pas restreint",
    ton: "danger",
  },
  "perimetre-trop-restrictif": {
    titre: "Le périmètre ne contient pas les bonnes adresses",
    ton: "danger",
  },
  "aucun-temoin": {
    titre: "Il manque une boîte de contrôle",
    ton: "attention",
  },
  indetermine: {
    titre: "La vérification n'a pas pu conclure",
    ton: "neutre",
  },
};

type Props = {
  tenantUid: string;
  /** Appelé quand la restriction est vérifiée : la page se recharge. */
  onVerifie: () => void;
  /** Sortie de secours : revenir modifier la sélection de boîtes. */
  onModifierSelection: () => void;
};

export function EcranRestriction({
  tenantUid,
  onVerifie,
  onModifierSelection,
}: Props) {
  const [script, setScript] = useState<Script | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurScript, setErreurScript] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [verification, setVerification] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  /** Incrémenté pour redemander le script. Le chargement n'est jamais armé
   *  depuis l'effet lui-même : c'est le geste du client qui l'arme. */
  const [cle, setCle] = useState(0);

  useEffect(() => {
    let annule = false;

    void (async () => {
      try {
        const reponse = await fetch(
          `/api/microsoft/restriction?tenant=${encodeURIComponent(tenantUid)}`,
          { cache: "no-store" },
        );
        const corps = await reponse.json();
        if (annule) return;

        if (!reponse.ok) {
          setErreurScript(corps.erreur ?? "Le script n'a pas pu être produit.");
          setScript(null);
          return;
        }
        setScript(corps as Script);
      } catch (e) {
        if (annule) return;
        setErreurScript(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    // Produire le script demande de relire l'annuaire du client, pour savoir
    // s'il reste une boîte hors périmètre : c'est plusieurs secondes, pendant
    // lesquelles il peut quitter la page.
    return () => {
      annule = true;
    };
  }, [tenantUid, cle]);

  function recharger() {
    setChargement(true);
    setErreurScript(null);
    setCle((k) => k + 1);
  }

  async function copier() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.script);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le script
      // reste sélectionnable à la main, et le téléchargement fonctionne.
      setCopie(false);
    }
  }

  function telecharger() {
    if (!script) return;
    // ⚠ Le BOM n'est pas une coquetterie : sans lui, Windows PowerShell 5.1 lit
    //   le fichier en ANSI et les commentaires accentués — ceux qui expliquent
    //   à l'administrateur ce que le script fait — deviennent illisibles.
    const blob = new Blob(["﻿" + script.script], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = NOM_FICHIER;
    lien.click();
    URL.revokeObjectURL(url);
  }

  async function verifier() {
    setVerification(true);
    setResultat(null);
    try {
      const reponse = await fetch(
        `/api/microsoft/restriction?tenant=${encodeURIComponent(tenantUid)}`,
        { method: "POST" },
      );
      const corps = (await reponse.json()) as Resultat;
      setResultat(corps);
      if (corps.verifie) {
        // La page serveur relira l'état : les boîtes viennent d'être activées.
        setTimeout(onVerifie, 1200);
      }
    } catch (e) {
      setResultat({
        verifie: false,
        cause: "indetermine",
        message:
          "La vérification n'a pas abouti — la requête elle-même a échoué. " +
          "Réessayez dans un instant.",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVerification(false);
    }
  }

  return (
    <div className="space-y-4">
      <Encadre ton="info" titre="Pourquoi ce script est indispensable">
        <p>
          Quand votre administrateur a autorisé Safentreprise, Microsoft nous a
          donné le droit de lire le courrier —{" "}
          <strong className="font-medium text-foreground">
            de toutes les boîtes de votre organisation
          </strong>
          . Microsoft ne propose pas de limiter cette autorisation au moment de
          l&apos;accord : la seule façon de la restreindre est de le faire chez
          vous, dans Exchange.
        </p>
        <p className="mt-2">
          C&apos;est ce que fait ce script. Il ne lit aucun message et ne
          modifie aucune boîte : il déclare à Exchange que Safentreprise ne peut
          atteindre que les adresses que vous avez choisies. Ensuite nous le
          vérifions, en essayant réellement de lire une boîte que vous
          n&apos;avez pas choisie — Microsoft doit nous la refuser.
        </p>
        <p className="mt-2">
          Tant que ce refus n&apos;a pas été constaté,{" "}
          <strong className="font-medium text-foreground">
            aucun message n&apos;est analysé
          </strong>
          .
        </p>
      </Encadre>

      <Prerequis />

      {chargement && (
        <p className="px-1 py-8 text-center text-[13px] text-muted">
          Préparation du script…
        </p>
      )}

      {erreurScript && (
        <Encadre ton="danger" titre="Le script n'a pas pu être produit">
          <p>{erreurScript}</p>
          <button
            type="button"
            onClick={recharger}
            className={`${buttonSecondary} mt-3`}
          >
            <IconRefresh />
            Réessayer
          </button>
        </Encadre>
      )}

      {script && (
        <>
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-foreground">
                  À transmettre à votre administrateur Microsoft 365
                </h3>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Il l&apos;exécute dans PowerShell, connecté à Exchange Online.
                  Une seule fois.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copier()}
                  className={buttonSecondary}
                >
                  <IconCopy />
                  {copie ? "Copié" : "Copier"}
                </button>
                <button
                  type="button"
                  onClick={telecharger}
                  className={buttonSecondary}
                >
                  <IconDownload />
                  Télécharger
                </button>
              </div>
            </div>

            <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-2">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-faint">
                  Boîtes que le script autorise
                </p>
                <ul className="mt-2 space-y-1">
                  {script.boites.map((a) => (
                    <li key={a} className="font-mono text-[12.5px] text-foreground">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-faint">
                  Boîte de contrôle
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  {script.temoin_existant ? (
                    <>
                      <span className="font-mono text-foreground">
                        {script.temoin_existant}
                      </span>{" "}
                      — elle existe déjà et restera hors surveillance. Le script
                      ne crée rien.
                    </>
                  ) : script.temoin_a_creer ? (
                    <>
                      Toutes vos boîtes sont surveillées : il n&apos;en reste
                      aucune pour vérifier la restriction. Le script créera une
                      boîte partagée vide,{" "}
                      <span className="font-mono text-foreground">
                        {script.temoin_a_creer}
                      </span>
                      , qui ne servira qu&apos;à ce contrôle.
                    </>
                  ) : (
                    <>
                      Votre annuaire n&apos;a pas pu être lu au moment de
                      produire le script : il ne crée aucune boîte. La
                      vérification vous dira quoi faire.
                    </>
                  )}
                </p>
              </div>
            </div>

            {script.adresses_ignorees.length > 0 && (
              <div className="border-b border-border px-5 py-3.5">
                <Encadre ton="attention" titre="Adresses écartées du script">
                  Ces adresses n&apos;ont pas une forme que nous savons insérer
                  sans risque dans le script, et{" "}
                  <strong className="font-medium text-foreground">
                    elles ne seront donc pas surveillées
                  </strong>
                  . Signalez-les au support.
                  <ul className="mt-2 space-y-1">
                    {script.adresses_ignorees.map((a) => (
                      <li key={a} className="font-mono text-[12.5px]">
                        {a}
                      </li>
                    ))}
                  </ul>
                </Encadre>
              </div>
            )}

            <pre className="max-h-[420px] overflow-auto bg-surface-2 px-5 py-4 font-mono text-[11.5px] leading-relaxed text-foreground">
              {script.script}
            </pre>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={verification}
              onClick={() => void verifier()}
              className={buttonPrimary}
            >
              {verification ? "Vérification…" : "Lancer la vérification"}
            </button>
            <span className="text-[12.5px] text-muted">
              À faire une fois le script exécuté. Exchange met parfois quelques
              minutes à prendre en compte la restriction.
            </span>
          </div>
        </>
      )}

      {resultat && (
        <ResultatVerification
          resultat={resultat}
          onRelancer={() => void verifier()}
          onModifierSelection={onModifierSelection}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Les prérequis
   ========================================================================== */

/**
 * Ce qu'il faut avoir AVANT de lancer le script.
 *
 * ⚠ ÉCRIT APRÈS UN ESSAI RÉEL, ET CHAQUE LIGNE Y CORRESPOND À UN ÉCHEC
 *   CONSTATÉ. Le compte était administrateur général du locataire, et
 *   Connect-ExchangeOnline répondait quand même « vous n'êtes pas autorisé à
 *   accéder à cette ressource » : le rôle Administrateur Exchange doit être
 *   attribué explicitement, et sa propagation prend jusqu'à une heure. Sans
 *   ces trois lignes, l'administrateur cherche le défaut dans le script.
 */
function Prerequis() {
  return (
    <section className="overflow-hidden rounded-xl border border-warning/30 bg-warning-soft">
      <div className="border-b border-warning/25 px-5 py-3.5">
        <h3 className="text-[14px] font-semibold text-foreground">
          À vérifier avant de transmettre le script
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Quatre points, tous constatés en installation réelle. Les ignorer fait
          échouer le script sur des messages difficiles à interpréter.
        </p>
      </div>

      <ol className="divide-y divide-warning/20">
        <li className="px-5 py-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            1. Le rôle « Administrateur Exchange », attribué explicitement
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            <strong className="font-medium text-foreground">
              Être administrateur général ne suffit pas.
            </strong>{" "}
            Sans ce rôle, la connexion à Exchange répond «&nbsp;vous n&apos;êtes
            pas autorisé à accéder à cette ressource&nbsp;», sans dire pourquoi.
            Il s&apos;attribue dans le centre d&apos;administration Microsoft
            365, sur le compte qui exécutera le script.
          </p>
        </li>

        <li className="px-5 py-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            2. L&apos;appartenance au groupe «&nbsp;Organization
            Management&nbsp;»
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Le rôle Administrateur Exchange permet d&apos;administrer les
            boîtes,{" "}
            <strong className="font-medium text-foreground">
              pas d&apos;attribuer un rôle à une application
            </strong>
            . Sans cette appartenance, le script s&apos;arrête sur «&nbsp;vous
            ne disposez pas de l&apos;accès permettant de créer, modifier ou
            supprimer l&apos;attribution de rôle de gestion&nbsp;».
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Centre d&apos;administration Exchange → Rôles → Rôles
            d&apos;administrateur → Organization Management → onglet Attribué,
            puis ajouter le compte.
          </p>
        </li>

        <li className="px-5 py-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            3. Le module ExchangeOnlineManagement
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Une seule commande, une seule fois. Le script s&apos;arrête de
            lui-même en l&apos;affichant si le module manque.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11.5px] text-foreground">
            Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force
          </pre>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            Rien d&apos;autre n&apos;est nécessaire : le script fonctionne en
            PowerShell 5.1, celui installé d&apos;origine sur Windows, et
            n&apos;utilise aucun module Microsoft Graph.
          </p>
        </li>

        <li className="px-5 py-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            4. Le délai de propagation
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Un rôle ou une appartenance qui viennent d&apos;être attribués
            peuvent mettre{" "}
            <strong className="font-medium text-foreground">
              jusqu&apos;à une heure
            </strong>{" "}
            à être pris en compte par Microsoft. Si la connexion est refusée
            juste après l&apos;attribution, ce n&apos;est pas une erreur de
            configuration : il faut attendre.
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Le même délai s&apos;applique <em>après</em> le script : une
            autorisation déjà accordée à Safentreprise reste valable environ une
            heure. Si la vérification lancée dans la foulée annonce un accès non
            restreint, attendez et relancez-la avant de chercher plus loin.
          </p>
        </li>
      </ol>
    </section>
  );
}

/* ==========================================================================
   Les issues
   ========================================================================== */

function ResultatVerification({
  resultat,
  onRelancer,
  onModifierSelection,
}: {
  resultat: Resultat;
  onRelancer: () => void;
  onModifierSelection: () => void;
}) {
  const { titre, ton } = ISSUES[resultat.cause] ?? ISSUES.indetermine;

  return (
    <Encadre ton={ton} titre={titre}>
      <p>{resultat.message}</p>

      {/* Ce que le client doit faire, selon l'issue. */}
      {resultat.cause === "restriction-active" && (
        <p className="mt-2">
          {typeof resultat.boites_activees === "number" && (
            <>
              {resultat.boites_activees} boîte
              {resultat.boites_activees > 1 ? "s" : ""} activée
              {resultat.boites_activees > 1 ? "s" : ""}.{" "}
            </>
          )}
          Dernière étape : démarrer la surveillance.
        </p>
      )}

      {resultat.cause === "perimetre-trop-restrictif" && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Faites réexécuter le script tel quel : il réécrit le périmètre avec
            les adresses exactes affichées plus haut.
          </li>
          <li>
            Si le problème persiste, une adresse principale a peut-être changé
            dans Exchange depuis votre sélection. Modifiez la sélection, puis
            recommencez.
          </li>
        </ul>
      )}

      {resultat.issues && resultat.issues.length > 0 && (
        <ol className="mt-3 space-y-3">
          {resultat.issues.map((issue, index) => (
            <li
              key={issue.titre}
              className="rounded-lg border border-border bg-surface px-3.5 py-3"
            >
              <p className="text-[13px] font-semibold text-foreground">
                {index + 1}. {issue.titre}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {issue.explication}
              </p>
              {issue.commande && <Commande texte={issue.commande} />}
              {resultat.cause === "aucun-temoin" && index === 1 && (
                <button
                  type="button"
                  onClick={onModifierSelection}
                  className={`${buttonSecondary} mt-3`}
                >
                  Modifier la sélection
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {resultat.cause === "indetermine" && (
        <p className="mt-2">
          Relancez la vérification. Si cela se répète, transmettez au support le
          détail ci-dessous : il contient la réponse exacte de Microsoft.
        </p>
      )}

      {resultat.detail && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-foreground">
            Voir la réponse de Microsoft
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11.5px] text-muted">
            {resultat.detail}
          </pre>
        </details>
      )}

      {!resultat.verifie && (
        <button
          type="button"
          onClick={onRelancer}
          className={`${buttonSecondary} mt-3`}
        >
          <IconRefresh />
          Relancer la vérification
        </button>
      )}
    </Encadre>
  );
}

/** Une commande PowerShell, copiable — le client ne doit pas la recomposer. */
function Commande({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);

  return (
    <div className="mt-2">
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11.5px] text-foreground">
        {texte}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            .writeText(texte)
            .then(() => {
              setCopie(true);
              setTimeout(() => setCopie(false), 2500);
            })
            .catch(() => setCopie(false));
        }}
        className={`${buttonSecondary} mt-2`}
      >
        <IconCopy />
        {copie ? "Copié" : "Copier la commande"}
      </button>
    </div>
  );
}
