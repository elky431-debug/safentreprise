"use client";

/**
 * D4 — ce que le dirigeant voit pendant l'attente.
 *
 * ⚠ C'EST L'ÉCRAN QU'IL REGARDERA LE PLUS SOUVENT, ET SURTOUT PENDANT QU'IL NE
 *   SE PASSE RIEN. Il répond à trois questions et pas une de plus : est-ce
 *   parti, est-ce lu, qu'est-ce qu'on attend. Tout ce qu'on ajouterait ici
 *   serait lu comme quelque chose à faire.
 *
 * ⚠ AUCUN JARGON. Ni « consentement », ni « locataire », ni « RBAC ». Le
 *   dirigeant n'a pas de compte Microsoft : ces mots ne l'aident pas à décider,
 *   ils l'inquiètent.
 */
import { useState } from "react";
import { buttonPrimary, buttonSecondary, buttonGhost } from "@/components/ui";
import { IconRefresh } from "@/components/icons";
import { Encadre, Etiquette, dateLisible } from "@/components/microsoft/commun";
import { ceQuOnAttend, phaseDe, type Suivi } from "@/lib/raccordement/suivi";

const LIBELLE_ETAPE: Record<string, string> = {
  envoye: "Lien transmis",
  ouvert: "Lien ouvert",
  accord: "Accord Microsoft donné",
  restriction: "Restriction en cours de propagation",
  actif: "Surveillance active",
  bloque: "Blocage signalé",
};

const MOTIF_LISIBLE: Record<string, string> = {
  "role-manquant": "il lui manque un rôle Microsoft",
  "script-echoue": "le script d’installation échoue",
  "verification-echoue": "la vérification ne passe pas",
  autre: "un point qu’il a décrit",
};

export function SuiviRaccordement({
  suivi,
  onChanger,
  onRafraichir,
}: {
  suivi: Suivi;
  /** « Changer d'informaticien » : révoque et rouvre le formulaire. */
  onChanger: () => void;
  onRafraichir: () => void;
}) {
  const [lienVisible, setLienVisible] = useState(false);
  const [copie, setCopie] = useState(false);
  const phase = phaseDe(suivi);
  const lien =
    typeof window !== "undefined"
      ? `${window.location.origin}/raccordement/${suivi.jeton}`
      : `/raccordement/${suivi.jeton}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="titre-section text-foreground">
          Raccordement en cours
        </h2>
        <Etiquette
          ton={
            phase === "actif" ? "succes" : phase === "bloque" ? "attention" : "info"
          }
        >
          {LIBELLE_ETAPE[phase]}
        </Etiquette>
      </div>

      {/* ---- Les quatre lignes ------------------------------------------- */}
      <dl className="overflow-hidden rounded-[16px] border border-border bg-surface">
        <Ligne
          terme="Envoyé"
          valeur={
            suivi.destinataire_email
              ? `à ${suivi.destinataire_email}${
                  suivi.envoye_at ? `, le ${dateLisible(suivi.envoye_at)}` : ""
                }`
              : "—"
          }
        />
        <Ligne
          terme="Ouvert"
          valeur={
            suivi.ouvert_at
              ? `le ${dateLisible(suivi.ouvert_at)}`
              : "pas encore ouvert"
          }
          /* ⚠ « PAS ENCORE OUVERT » EST UNE INFORMATION, PAS UN VIDE. C'est le
             cas le plus fréquent d'un raccordement qui n'avance pas, et la
             seule chose que le dirigeant puisse corriger lui-même : relancer,
             ou passer le lien autrement. */
          discret={!suivi.ouvert_at}
        />
        <Ligne terme="Où on en est" valeur={LIBELLE_ETAPE[phase]} />
        <Ligne terme="Ce qui manque" valeur={ceQuOnAttend(suivi)} dernier />
      </dl>

      {/* ---- La propagation ---------------------------------------------- */}
      {phase === "restriction" && (
        <Encadre ton="info" titre="Microsoft propage la restriction">
          {/* ⚠ PAS DE COMPTE À REBOURS. Voir `minutesDePropagation` : le seul
              horodatage disponible est l'ouverture du LIEN, qui peut précéder
              l'exécution du script de plusieurs jours. Un « 4 320 minutes
              écoulées » ferait conclure à une panne là où tout va bien. */}
          <p>
            Environ une heure. <strong>Rien à faire</strong>, ni pour vous ni pour votre
            informaticien. C’est le moment où l’absence de nouvelle fait croire
            à une panne : ce n’en est pas une.
          </p>
        </Encadre>
      )}

      {/* ---- Le blocage --------------------------------------------------- */}
      {phase === "bloque" && (
        <Encadre ton="attention" titre="Votre informaticien a signalé un blocage">
          <p>
            Il indique que {MOTIF_LISIBLE[suivi.dernier_blocage_motif ?? "autre"]}
            {suivi.dernier_blocage_at
              ? `, le ${dateLisible(suivi.dernier_blocage_at)}`
              : ""}
            . <strong>Nous sommes prévenus</strong> et nous le recontactons.
            Vous n’avez rien à faire.
          </p>
        </Encadre>
      )}

      {/* ---- Les trois actions -------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRafraichir} className={buttonSecondary}>
          <IconRefresh className="h-4 w-4" />
          Actualiser
        </button>

        {phase !== "actif" && (
          <>
            <button
              type="button"
              onClick={() => setLienVisible((v) => !v)}
              className={buttonGhost}
            >
              {lienVisible ? "Masquer le lien" : "Voir le lien"}
            </button>
            <button type="button" onClick={onChanger} className={buttonGhost}>
              Changer d’informaticien
            </button>
          </>
        )}
      </div>

      {lienVisible && (
        <div className="rounded-[16px] border border-border bg-surface px-5 py-4">
          <p className="titre-bloc text-foreground">
            Le lien, à repasser autrement
          </p>
          <p className="texte-second mt-1.5">
            Si votre informaticien dit ne l’avoir jamais reçu — c’est le cas le
            plus fréquent — copiez-le et envoyez-le par le canal de votre choix.
          </p>
          <p className="adresse mt-2.5 break-all text-foreground">{lien}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(lien).then(() => {
                setCopie(true);
                setTimeout(() => setCopie(false), 2000);
              });
            }}
            className={`${buttonSecondary} mt-3`}
          >
            {copie ? "Copié" : "Copier le lien"}
          </button>
          <p className="texte-second mt-2.5">
            Valable jusqu’au {dateLisible(suivi.expire_at)}. « Changer
            d’informaticien » l’annule immédiatement.
          </p>
        </div>
      )}
    </div>
  );
}

function Ligne({
  terme,
  valeur,
  discret,
  dernier,
}: {
  terme: string;
  valeur: string;
  discret?: boolean;
  dernier?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap gap-x-4 gap-y-0.5 px-5 py-3 ${
        dernier ? "" : "border-b border-border"
      }`}
    >
      <dt className="w-[130px] shrink-0 text-[13px] text-muted">{terme}</dt>
      <dd
        className={`min-w-0 flex-1 text-[13.5px] ${
          discret ? "text-faint" : "text-foreground"
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}
