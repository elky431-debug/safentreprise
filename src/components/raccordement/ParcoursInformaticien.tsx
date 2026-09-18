"use client";

/**
 * Le parcours de l'informaticien : I0 à I3.
 *
 * Référence : docs/PARCOURS-RACCORDEMENT.md
 *
 * ⚠ L'ÉTAPE VIENT DE LA BASE, PAS D'UN COMPTEUR LOCAL. Le seul état local est
 *   `commence` — le passage de l'annonce au parcours — et il ne survit pas au
 *   rechargement, volontairement : quelqu'un qui revient après une nuit doit
 *   relire ce qu'il doit faire, pas retomber au milieu.
 */
import { useCallback, useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconArrowRight, IconRefresh } from "@/components/icons";
import { Encadre } from "@/components/microsoft/commun";
import { Annonce } from "./Annonce";
import { EcranAccord } from "./EcranAccord";
import { EcranPerimetre } from "./EcranPerimetre";
import { FilEtapes } from "./FilEtapes";
import { BoutonBloque } from "./BoutonBloque";

export type EtatJeton = {
  accord_donne: boolean;
  tenant_id: string | null;
  statut: string | null;
  restriction_verifiee_at: string | null;
  boites_choisies: number;
  boites_actives: number;
  temoin_upn: string | null;
};

type Props = {
  jeton: string;
  societe: string;
  dirigeant: string;
  adresses: string[];
  mot: string | null;
  expireAt: string | null;
};

export function ParcoursInformaticien(props: Props) {
  const { jeton, societe, dirigeant, adresses, mot } = props;

  const [commence, setCommence] = useState(false);
  const [etat, setEtat] = useState<EtatJeton | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/raccordement/etat?jeton=${encodeURIComponent(jeton)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEtat((await r.json()) as EtatJeton);
    } catch (e) {
      // ⚠ ON NE FAIT PAS DISPARAÎTRE L'ÉCRAN SUR UNE ERREUR RÉSEAU. L'état
      //   précédent reste affiché et l'erreur se dit au-dessus : sinon un wifi
      //   qui saute donne l'impression que le raccordement a été perdu.
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setChargement(false);
    }
  }, [jeton]);

  useEffect(() => {
    void relire();
  }, [relire]);

  // ⚠ ON REVIENT DE CHEZ MICROSOFT AVEC `?accord=…` DANS L'URL. Sans ce
  //   passage, l'informaticien retomberait sur l'annonce et croirait que son
  //   accord n'a pas été pris en compte — c'est exactement le cul-de-sac que
  //   le principe 2 interdit.
  const [retourMicrosoft, setRetourMicrosoft] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get("accord");
    if (!a) return;
    setRetourMicrosoft(a);
    setCommence(true);
    // On nettoie l'URL : un rechargement ne doit pas rejouer le message.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  if (!commence) {
    return (
      <Annonce
        societe={societe}
        dirigeant={dirigeant}
        adresses={adresses}
        mot={mot}
        jeton={jeton}
        onCommencer={() => setCommence(true)}
      />
    );
  }

  const etape: 1 | 2 | 3 = !etat?.accord_donne
    ? 1
    : etat.boites_choisies > 0
      ? 3
      : 2;

  return (
    <div className="space-y-5">
      <FilEtapes courante={etape} />

      {erreur && (
        <Encadre ton="attention" titre="Nous n’avons pas pu relire l’état">
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
      )}

      {retourMicrosoft && (
        <RetourMicrosoft code={retourMicrosoft} onReprendre={() => void relire()} />
      )}

      {chargement && !etat ? (
        <p className="texte-second">Lecture de l’état…</p>
      ) : !etat?.accord_donne ? (
        <EcranAccord jeton={jeton} societe={societe} />
      ) : (
        <EcranPerimetre
          jeton={jeton}
          adresses={adresses}
          etat={etat}
          onEnregistre={() => void relire()}
        />
      )}

      <BoutonBloque jeton={jeton} etape={`I${etape}`} />
    </div>
  );
}

/**
 * Le retour depuis Microsoft — I2.
 *
 * ⚠ C'EST L'ÉCRAN QUI REMPLACE LE PIRE CUL-DE-SAC DU PARCOURS. L'ancienne page
 *   disait « si vous n'êtes pas la personne qui a lancé ce raccordement,
 *   prévenez-la » et s'arrêtait là. Elle enchaîne désormais, y compris quand
 *   Microsoft a refusé.
 */
function RetourMicrosoft({
  code,
  onReprendre,
}: {
  code: string;
  onReprendre: () => void;
}) {
  if (code === "ok") {
    return (
      <Encadre ton="succes" titre="Accord enregistré">
        <p>
          Microsoft a bien transmis l’autorisation. Il reste deux étapes : fixer
          le périmètre des boîtes, puis exécuter le script qui restreint notre
          accès à ces seules boîtes.
        </p>
      </Encadre>
    );
  }

  // ⚠ LES DEUX REFUS LES PLUS FRÉQUENTS SONT NOMMÉS, ET ILS N'APPELLENT PAS LE
  //   MÊME GESTE. Un refus volontaire se reprend tout seul ; un rôle manquant
  //   demande d'aller chercher quelqu'un d'autre. Les confondre sous
  //   « l'autorisation a échoué » renvoie la moitié des gens au mauvais
  //   endroit.
  const CAS: Record<string, { titre: string; corps: string }> = {
    refuse: {
      titre: "Vous avez refusé l’autorisation",
      corps:
        "Rien n’a été modifié chez vous. Vous pouvez relancer l’étape quand " +
        "vous voulez : le lien reste valable.",
    },
    "role-insuffisant": {
      titre: "Votre compte n’a pas le rôle nécessaire",
      corps:
        "Microsoft demande le rôle Administrateur général pour accorder cette " +
        "autorisation à l’échelle du locataire. Un administrateur Exchange " +
        "seul ne peut pas la donner — il servira à l’étape suivante.",
    },
  };
  const cas = CAS[code] ?? {
    titre: "Microsoft n’a pas accepté l’autorisation",
    corps:
      "Le code renvoyé est « " +
      code +
      " ». Vous pouvez relancer l’étape ; si l’erreur revient, signalez-le " +
      "avec le bouton en bas de page, le message exact nous sera transmis.",
  };

  return (
    <Encadre ton="attention" titre={cas.titre}>
      <p>{cas.corps}</p>
      <button
        type="button"
        onClick={onReprendre}
        className={`${buttonPrimary} mt-2.5`}
      >
        Reprendre
        <IconArrowRight className="h-4 w-4" />
      </button>
    </Encadre>
  );
}
