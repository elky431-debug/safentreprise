"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * « Ce qui arrive dans les entreprises comme la vôtre » — un scénario par
 * secteur, en onglets.
 *
 * ⚠ AUCUN CHIFFRE INVENTÉ. Un seul chiffre figure dans toute la section, celui
 *   de BRM Mobilier, et il est daté et attribué. Ne rien ajouter ici qui
 *   ressemble à une statistique sans source : les récits valent par leur
 *   justesse, pas par des ordres de grandeur invérifiables.
 *
 * ⚠ LES MOTIFS ÉNONCÉS DOIVENT RESTER CEUX QUE LE MOTEUR SAIT REPÉRER. Chaque
 *   ligne de `signaux` correspond à une règle réelle de detection-rules.js —
 *   changement de coordonnées bancaires, usurpation d'annuaire, domaine
 *   ressemblant, demande sensible, pression à l'urgence. Y écrire une
 *   détection que le produit ne fait pas serait une promesse fausse.
 */

type Secteur = {
  cle: string;
  onglet: string;
  titre: string;
  scenario: string;
  /** Fait daté, affiché en petit sous le scénario. */
  complement?: string;
  pourquoi: string;
  signaux: string[];
};

const SECTEURS: Secteur[] = [
  {
    cle: "comptable",
    onglet: "Cabinet comptable",
    titre: "Le changement de RIB d’un client",
    scenario:
      "Un message arrive au nom d’un de vos clients. Il annonce un changement de domiciliation bancaire et demande que le prochain règlement parte sur le nouveau compte. Le nom du dirigeant est le bon, la signature aussi. L’adresse d’envoi, elle, n’est pas celle du client — mais personne ne la relit, parce que vous en traitez quarante par jour.",
    pourquoi:
      "Vous détenez les coordonnées bancaires de dizaines d’entreprises et vous exécutez leurs paiements. Un seul message crédible suffit à détourner un flux qui n’est même pas le vôtre.",
    signaux: [
      "Changement de coordonnées bancaires annoncé par message",
      "Nom connu, adresse d’envoi extérieure",
      "Domaine ressemblant à celui du client",
    ],
  },
  {
    cle: "avocats",
    onglet: "Cabinet d’avocats",
    titre: "Le virement sur le compte de tiers",
    scenario:
      "Un message au nom de l’associé demande de débloquer des fonds depuis le compte CARPA, pour une opération qui se conclut le jour même. Le ton est pressé, la demande confidentielle. L’associé est en audience et injoignable — ce que le message précise lui-même.",
    pourquoi:
      "Vous manipulez des fonds qui ne vous appartiennent pas, sur des montants élevés, dans des délais courts. Et l’indisponibilité d’un associé est publique : elle se lit dans un rôle d’audience.",
    signaux: [
      "Nom présent à l’annuaire, adresse d’envoi extérieure",
      "Demande de virement avec mention de confidentialité",
      "Indisponibilité annoncée de l’expéditeur",
    ],
  },
  {
    cle: "industrie",
    onglet: "PME industrielle",
    titre: "La facture fournisseur rectifiée",
    scenario:
      "Votre fournisseur habituel vous écrit qu’une erreur s’est glissée dans la facture du mois. Il en joint une nouvelle, avec un IBAN différent. Le montant est celui que vous attendiez, la référence de commande est exacte. Vous payez.",
    complement:
      "En 2016, BRM Mobilier, 44 salariés dans les Deux-Sèvres, a réglé un faux ordre de virement de 1,6 million d’euros. L’entreprise n’a pas survécu à la perte et a été placée en liquidation judiciaire.",
    pourquoi:
      "Vos fournisseurs sont réguliers, vos montants élevés, et vos règlements suivent un calendrier connu. Le fraudeur n’a qu’à se placer au bon moment.",
    signaux: [
      "Nouvelles coordonnées bancaires communiquées par message",
      "Domaine proche de celui du fournisseur habituel",
      "Demande de règlement associée à un changement de compte",
    ],
  },
  {
    cle: "etudes",
    onglet: "Bureau d’études",
    titre: "L’acompte du nouveau client",
    scenario:
      "Un message au nom de votre dirigeant demande de régler rapidement un prestataire pour débloquer un chantier. C’est un nom que vous ne connaissez pas, mais l’entreprise en fait travailler beaucoup. La demande arrive un vendredi en fin de journée.",
    pourquoi:
      "Vous travaillez en projet, avec des intervenants qui changent d’un dossier à l’autre. Un prestataire inconnu n’a rien d’anormal chez vous.",
    signaux: [
      "Nom de la direction depuis une adresse extérieure",
      "Demande de virement à un bénéficiaire inhabituel",
      "Pression à l’urgence en fin de semaine",
    ],
  },
];

export function SecteursOnglets() {
  const [actif, setActif] = useState(0);
  const onglets = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * ⚠ NAVIGATION AU CLAVIER : LES FLÈCHES DÉPLACENT ET SÉLECTIONNENT. C'est le
   *   comportement attendu d'un jeu d'onglets — le contenu suit la flèche, sans
   *   qu'il faille valider. Il faut donc aussi déplacer le focus à la main :
   *   sans `focus()`, la touche suivante repartirait de l'onglet précédent.
   */
  function auClavier(e: React.KeyboardEvent, index: number) {
    const dernier = SECTEURS.length - 1;
    let cible: number | null = null;

    if (e.key === "ArrowRight") cible = index === dernier ? 0 : index + 1;
    else if (e.key === "ArrowLeft") cible = index === 0 ? dernier : index - 1;
    else if (e.key === "Home") cible = 0;
    else if (e.key === "End") cible = dernier;

    if (cible === null) return;
    e.preventDefault();
    setActif(cible);
    onglets.current[cible]?.focus();
  }

  const secteur = SECTEURS[actif];

  return (
    <section
      id="scenarios"
      className="border-t border-border px-6 py-20 md:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-[1180px]">
        <h2 className="mx-auto max-w-2xl text-center text-[clamp(1.6rem,3vw,2.35rem)] font-semibold leading-tight text-foreground">
          Ce qui arrive dans les entreprises comme la vôtre
        </h2>

        {/* ⚠ LE DÉFILEMENT HORIZONTAL EST PORTÉ PAR L'ENVELOPPE, PAS PAR LA
            PASTILLE. Sur un téléphone, les quatre onglets dépassent la
            largeur ; `w-fit max-w-full` garde la pastille centrée tant qu'elle
            tient, et la laisse défiler dès qu'elle déborde. */}
        <div className="mt-9 flex justify-center">
          <div
            role="tablist"
            aria-label="Secteur d’activité"
            className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1"
          >
            {SECTEURS.map((s, i) => {
              const courant = i === actif;
              return (
                <button
                  key={s.cle}
                  ref={(el) => {
                    onglets.current[i] = el;
                  }}
                  role="tab"
                  id={`onglet-${s.cle}`}
                  aria-selected={courant}
                  aria-controls={`panneau-${s.cle}`}
                  // Un seul onglet dans l'ordre de tabulation : on entre dans
                  // le groupe puis on circule aux flèches.
                  tabIndex={courant ? 0 : -1}
                  onClick={() => setActif(i)}
                  onKeyDown={(e) => auClavier(e, i)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                    courant
                      ? "bg-surface text-foreground shadow-[0_1px_3px_rgba(16,20,26,0.12)]"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {s.onglet}
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          id={`panneau-${secteur.cle}`}
          aria-labelledby={`onglet-${secteur.cle}`}
          className="mt-8 grid overflow-hidden rounded-2xl border border-border md:grid-cols-[45fr_55fr]"
        >
          {/* Panneau gauche — le récit, sur marine. `sur-marine` bascule les
              tokens : le texte y devient clair sans rien coder ici. */}
          <div className="sur-marine px-7 py-8 md:px-9 md:py-10">
            <h3 className="serif-vitrine text-[clamp(1.25rem,2.2vw,1.6rem)] font-semibold leading-snug text-foreground">
              {secteur.titre}
            </h3>

            <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
              {secteur.scenario}
            </p>

            {secteur.complement && (
              /* ⚠ LE SEUL CHIFFRE DE LA SECTION, ET IL EST DATÉ ET ATTRIBUÉ.
                 Présenté en retrait, comme un fait rapporté et non comme un
                 argument de vente. */
              <p className="mt-6 border-l-2 border-border pl-4 text-[12.5px] leading-relaxed text-faint">
                {secteur.complement}
              </p>
            )}
          </div>

          {/* Panneau droit — l'analyse, sur gris très clair. */}
          <div className="flex flex-col gap-7 bg-surface-2 px-7 py-8 md:px-9 md:py-10">
            {/* ⚠ `text-muted` ET NON `text-faint` POUR CES DEUX INTITULÉS.
                Le gris pâle passe le seuil AA sur blanc (4,6:1) mais pas sur
                le gris du panneau (4,3:1) — et ce sont des capitales de 11 px,
                celles qui pardonnent le moins. */}
            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Pourquoi ce métier est visé
              </h4>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                {secteur.pourquoi}
              </p>
            </div>

            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Ce que Safentreprise aurait signalé
              </h4>
              <ul className="mt-3 space-y-2.5">
                {secteur.signaux.map((signal) => (
                  <li
                    key={signal}
                    className="flex items-start gap-2.5 text-[14px] leading-snug text-foreground"
                  >
                    {/* ⚠ COULEUR EN LIGNE. La règle `* { border-color }` de
                        globals.css n'est dans aucune couche et bat les
                        utilitaires de couleur ; pour un fond, `bg-danger`
                        suffirait, mais on reste explicite pour que le rouge
                        d'alerte soit repérable d'un coup d'œil dans le code. */}
                    <span
                      aria-hidden
                      className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full"
                      style={{ background: "var(--danger)" }}
                    />
                    {signal}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto pt-1">
              <Link href="/demo" className={buttonPrimary}>
                Demander une démo
                <IconArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
