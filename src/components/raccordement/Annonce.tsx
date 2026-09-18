"use client";

/**
 * I0 — ce qu'on dit AVANT de commencer.
 *
 * ⚠ PRINCIPE 1 DU DOCUMENT : DIRE CE QU'IL FAUT AVANT DE COMMENCER. Le nombre
 *   d'étapes, le temps à prévoir, les deux rôles Microsoft, et le délai de
 *   propagation d'une heure. Quelqu'un qui découvre après coup qu'il lui
 *   manque un rôle a déjà perdu son temps et le nôtre.
 *
 * ⚠ ET CE N'EST PAS UN MUR DE TEXTE, PAR CONSTRUCTION. Trois blocs courts et
 *   une ligne par rôle. Tout ce qui n'est pas nécessaire à la DÉCISION de
 *   commencer est reporté à l'étape où ça sert. Ne pas y ajouter d'explication
 *   sur le fonctionnement du produit : ce n'est pas la page qui vend.
 */
import { useState } from "react";
import { buttonPrimary, buttonGhost } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { Encadre } from "@/components/microsoft/commun";
import { RolesManquants } from "./RolesManquants";

export function Annonce({
  societe,
  dirigeant,
  adresses,
  mot,
  jeton,
  onCommencer,
}: {
  societe: string;
  dirigeant: string;
  adresses: string[];
  mot: string | null;
  jeton: string;
  onCommencer: () => void;
}) {
  const [sansRoles, setSansRoles] = useState(false);

  if (sansRoles) {
    return (
      <RolesManquants
        jeton={jeton}
        dirigeant={dirigeant}
        onRetour={() => setSansRoles(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="texte-second">
          {dirigeant}, de {societe}, vous a transmis ceci.
        </p>
        <h1 className="titre-page-da text-foreground">
          Raccorder Microsoft 365 à Safentreprise
        </h1>
      </header>

      {mot && (
        <Encadre ton="info" titre={`Mot de ${dirigeant}`}>
          <p className="whitespace-pre-line">{mot}</p>
        </Encadre>
      )}

      {/* ---- Ce que c'est ------------------------------------------------ */}
      <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="titre-bloc text-foreground">Ce qui vous attend</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <Chiffre valeur="3" libelle="étapes" />
          <Chiffre valeur="~15 min" libelle="de manipulation" />
          {/* ⚠ LE DÉLAI DE PROPAGATION EST ANNONCÉ ICI, PAS DANS UN ENCADRÉ
              QU'ON LIT TROP TARD. C'est le motif de la moitié des « ça ne
              marche pas » : la restriction est posée mais Microsoft ne l'a pas
              encore propagée, et rien ne le disait. */}
          <Chiffre valeur="+ 1 h" libelle="d’attente Microsoft" />
        </dl>
        <p className="texte-second mt-3">
          Les quinze minutes sont les vôtres. L’heure qui suit est celle de
          Microsoft, qui propage la restriction — il n’y a rien à faire pendant
          ce temps, et vous pouvez fermer cette page.
        </p>
      </section>

      {/* ---- Les deux rôles ---------------------------------------------- */}
      <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="titre-bloc text-foreground">
          Les deux rôles Microsoft nécessaires
        </p>
        <ul className="mt-3 space-y-3">
          <Role
            nom="Administrateur général"
            quand="étape 1"
            pourquoi="pour accorder l’autorisation à l’échelle du locataire. C’est le seul rôle qui peut la donner."
          />
          <Role
            nom="Administrateur Exchange"
            quand="étape 3"
            pourquoi="pour exécuter le script qui restreint notre accès aux seules boîtes choisies."
          />
        </ul>
        <p className="texte-second mt-3">
          Les deux peuvent être portés par la même personne, ou par deux
          personnes différentes — le lien se repasse.
        </p>
      </section>

      {/* ---- Le périmètre demandé ---------------------------------------- */}
      {adresses.length > 0 && (
        <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
          <p className="titre-bloc text-foreground">
            Les boîtes que {dirigeant} veut faire surveiller
          </p>
          <ul className="mt-2.5 space-y-1">
            {adresses.map((a) => (
              <li key={a} className="adresse text-foreground">
                {a}
              </li>
            ))}
          </ul>
          <p className="texte-second mt-2.5">
            Vous pourrez les corriger à l’étape 2 : ce sont des adresses
            saisies à la main, pas encore vérifiées contre votre annuaire.
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onCommencer} className={buttonPrimary}>
          Commencer
          <IconArrowRight className="h-4 w-4" />
        </button>

        {/* ⚠ CE BOUTON EST LE DÉTAIL QUI COMPTE LE PLUS DE TOUT LE PARCOURS.
            C'est là que l'ancien parcours se perdait : quelqu'un découvrait le
            rôle manquant APRÈS avoir copié le script, sur une erreur illisible,
            et abandonnait sans rien dire à personne. Ne pas le déplacer en bas
            de page ni le transformer en lien discret. */}
        <button
          type="button"
          onClick={() => setSansRoles(true)}
          className={buttonGhost}
        >
          Je n’ai pas ces rôles
        </button>
      </div>
    </div>
  );
}

function Chiffre({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div>
      {/* `tabular-nums` vient de `.chiffre` : un chiffre ne doit pas danser. */}
      <dt className="chiffre text-[22px] text-foreground">{valeur}</dt>
      <dd className="texte-second mt-0.5">{libelle}</dd>
    </div>
  );
}

function Role({
  nom,
  quand,
  pourquoi,
}: {
  nom: string;
  quand: string;
  pourquoi: string;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text"
      />
      <p className="texte-courant text-muted">
        <span className="font-semibold text-foreground">{nom}</span>
        <span className="text-faint"> — {quand}</span>
        <br />
        {pourquoi}
      </p>
    </li>
  );
}
