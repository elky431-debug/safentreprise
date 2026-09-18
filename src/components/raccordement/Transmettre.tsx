"use client";

/**
 * D1, D2, D3 — le seul travail du dirigeant : dire quoi surveiller, et à qui
 * transmettre.
 *
 * ⚠ TROIS ÉCRANS, PAS UN FORMULAIRE À DIX CHAMPS. Chacun pose une seule
 *   question, et la réponse de l'un n'oblige pas à revenir sur l'autre.
 *
 * ⚠ IL NE VOIT JAMAIS DE POWERSHELL, NI LE MOT « LOCATAIRE ». C'est la règle
 *   d'ouverture du document : deux acteurs, et celui-ci n'a aucun droit
 *   Microsoft.
 */
import { useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { Encadre } from "@/components/microsoft/commun";

type Etape = "qui" | "boites" | "destinataire";

export function Transmettre({
  onTransmis,
  onInstallerMoiMeme,
}: {
  onTransmis: () => void;
  /** Le dirigeant EST l'administrateur : on le renvoie au parcours en session. */
  onInstallerMoiMeme: () => void;
}) {
  const [etape, setEtape] = useState<Etape>("qui");
  const [brut, setBrut] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [mot, setMot] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{
    lien: string;
    mail_envoye: boolean;
    mail_erreur: string | null;
  } | null>(null);

  // ⚠ UNE ADRESSE PAR LIGNE, ET ON ACCEPTE LES VIRGULES ET LES POINTS-VIRGULES.
  //   Un dirigeant colle ce qu'il a sous la main — une ligne d'un tableur, une
  //   liste d'un mail. Lui refuser son format le renverrait le retaper.
  const adresses = brut
    .split(/[\n,;]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes("@"));

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/creer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, email, mot, adresses }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erreur ?? `HTTP ${r.status}`);
      setResultat(j);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setEnvoi(false);
    }
  }

  if (resultat) {
    return (
      <div className="space-y-4">
        <h2 className="titre-section text-foreground">
          {resultat.mail_envoye ? "C’est parti" : "Le lien est prêt"}
        </h2>

        {resultat.mail_envoye ? (
          <Encadre ton="succes" titre={`Envoyé à ${email}`}>
            <p>
              Vous n’avez plus rien à faire. Vous suivrez l’avancement depuis
              cette page, et vous serez prévenu quand la surveillance sera
              active.
            </p>
          </Encadre>
        ) : (
          /* ⚠ LE LIEN EXISTE MÊME QUAND LE MAIL ÉCHOUE, ET ON LE DONNE. Un
             échec en bloc laisserait le dirigeant sans lien ET sans message,
             devant une erreur qu'il ne peut pas corriger. */
          <Encadre ton="attention" titre="Le message n’est pas parti">
            <p>
              Le lien est bien créé — c’est l’envoi qui a échoué
              {resultat.mail_erreur ? ` (${resultat.mail_erreur})` : ""}.
              Copiez-le et transmettez-le par le canal de votre choix.
            </p>
            <p className="adresse mt-2 break-all text-foreground">
              {resultat.lien}
            </p>
          </Encadre>
        )}

        <button type="button" onClick={onTransmis} className={buttonPrimary}>
          Voir le suivi
          <IconArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (etape === "qui") {
    return (
      <div className="space-y-5">
        <header>
          <h2 className="titre-section text-foreground">
            Qui installe Safentreprise chez vous&nbsp;?
          </h2>
          <p className="texte-courant mt-2 text-muted">
            Le raccordement demande un compte <strong>administrateur
            Microsoft 365</strong> de votre entreprise. Si vous ne savez pas si
            vous en avez un, c’est que vous n’en avez pas : c’est votre
            informaticien qui l’a.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEtape("boites")}
            className={buttonPrimary}
          >
            Transmettre à mon informaticien
            <IconArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onInstallerMoiMeme}
            className={buttonSecondary}
          >
            Je suis l’administrateur
          </button>
        </div>
      </div>
    );
  }

  if (etape === "boites") {
    return (
      <div className="space-y-5">
        <header>
          <h2 className="titre-section text-foreground">
            Quelles boîtes faut-il surveiller&nbsp;?
          </h2>
          <p className="texte-courant mt-2 text-muted">
            Les personnes qui peuvent <strong>déclencher un virement</strong> :
            comptabilité, direction financière, assistance de direction, et
            vous-même. C’est là que la fraude arrive.
          </p>
        </header>

        <div>
          <label
            htmlFor="adresses"
            className="block text-[13px] font-medium text-foreground"
          >
            Une adresse par ligne
          </label>
          <textarea
            id="adresses"
            value={brut}
            onChange={(e) => setBrut(e.target.value)}
            rows={6}
            placeholder={"compta@votre-entreprise.fr\ndaf@votre-entreprise.fr"}
            className="adresse mt-1.5 w-full rounded-[12px] border border-border bg-surface px-3 py-2.5 text-foreground"
          />
          <p className="texte-second mt-1.5">
            {adresses.length === 0
              ? "Aucune adresse reconnue pour l’instant."
              : `${adresses.length} adresse${adresses.length > 1 ? "s" : ""} reconnue${adresses.length > 1 ? "s" : ""}.`}
          </p>
        </div>

        {/* ⚠ DIRE QUE C'EST LE PÉRIMÈTRE TECHNIQUE, PAS UNE PRÉFÉRENCE. Un
            dirigeant qui croit cocher une option ajoutera des boîtes « au cas
            où » ; celui qui comprend que c'est ce à quoi nous aurons accès en
            retire. C'est le sens du produit. */}
        <Encadre ton="info" titre="Ce que cette liste décide">
          <p>
            Safentreprise n’aura accès <strong>qu’à ces boîtes</strong>. Ce
            n’est pas une préférence d’affichage : c’est la limite technique que
            votre informaticien posera, et que nous vérifierons avant de
            démarrer.
          </p>
        </Encadre>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEtape("destinataire")}
            disabled={adresses.length === 0}
            className={buttonPrimary}
          >
            Continuer
            <IconArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEtape("qui")}
            className={buttonSecondary}
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="titre-section text-foreground">
          À qui l’envoyer&nbsp;?
        </h2>
        <p className="texte-courant mt-2 text-muted">
          Il recevra un lien avec tout ce qu’il faut. Aucun compte à créer de
          son côté.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Champ
          id="nom"
          libelle="Son nom (facultatif)"
          valeur={nom}
          onChange={setNom}
          placeholder="Paul Martin"
        />
        <Champ
          id="email"
          libelle="Son adresse email"
          valeur={email}
          onChange={setEmail}
          placeholder="paul@prestataire.fr"
          type="email"
        />
      </div>

      <div>
        <label htmlFor="mot" className="block text-[13px] font-medium text-foreground">
          Un mot pour lui (facultatif)
        </label>
        <textarea
          id="mot"
          value={mot}
          onChange={(e) => setMot(e.target.value)}
          rows={3}
          placeholder="Bonjour Paul, c’est l’outil dont je t’ai parlé…"
          className="mt-1.5 w-full rounded-[12px] border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground"
        />
      </div>

      {erreur && (
        <Encadre ton="attention" titre="L’envoi n’a pas abouti">
          <p>{erreur}</p>
        </Encadre>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={envoi || !email.includes("@")}
          className={buttonPrimary}
        >
          {envoi ? "Envoi…" : "Envoyer"}
        </button>
        <button
          type="button"
          onClick={() => setEtape("boites")}
          className={buttonSecondary}
        >
          Retour
        </button>
      </div>
    </div>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-foreground">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-[12px] border border-border bg-surface px-3 text-[13.5px] text-foreground"
      />
    </div>
  );
}
