import Link from "next/link";
import { buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";

/**
 * Les trois réassurances sous les boutons. Chacune doit être vraie.
 *
 * ⚠ « Aucune extension à installer » N'EST VRAIE QUE PARCE QUE LA SECTION
 *   « Protection » DIT LA MÊME CHOSE. Elle a longtemps décrit une extension de
 *   navigateur et parlé d'installation, en contradiction directe avec cette
 *   ligne. Toute réécriture de cette section doit repasser ici.
 */
const REASSURANCES = [
  "Aucune extension à installer",
  "Accès limité aux boîtes que vous choisissez",
  "Données hébergées en France",
];

/**
 * Hero de la vitrine : une seule colonne, centrée, sans image.
 *
 * ⚠ IL NE DOIT PAS REMPLIR L'ÉCRAN. Le début de la bande marine doit dépasser
 *   sous la ligne de flottaison — c'est elle qui donne envie de faire défiler.
 *   D'où un rembourrage bas mesuré plutôt qu'une hauteur d'écran.
 */
export function LandingHero() {
  return (
    <section className="px-6 pt-16 pb-14 text-center md:pt-24 md:pb-20 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
          Protection anti-fraude pour Microsoft 365
        </p>

        {/* ⚠ LA COUPE EST AVANT « se joue », ET C'EST MESURÉ. Les deux autres
            découpages possibles déséquilibrent : couper avant « dans sa boîte
            mail » donne 35 caractères contre 20. Ici, 28 contre 27 — les deux
            lignes font la même longueur à l'œil.

            ⚠ SUR MOBILE, CHAQUE LIGNE SE REPLIE EN DEUX. C'est inévitable à
            30 px dans 342 px utiles. L'espace insécable entre « boîte » et
            « mail. » n'est donc pas cosmétique : sans lui, `text-balance` ne
            suffit pas et le repli laisse « mail. » seule sur une quatrième
            ligne, sous une ligne trois fois plus longue. */}
        <h1 className="rise rise-1 mt-7 text-[clamp(1.9rem,4vw,3.35rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-balance text-foreground">
          La sécurité d’une entreprise
          <br />
          <span className="text-accent-text">
            se joue dans sa boîte&nbsp;mail.
          </span>
        </h1>

        <p className="rise rise-2 mx-auto mt-6 max-w-[62ch] text-[16.5px] leading-relaxed text-muted">
          Safentreprise repère les tentatives de fraude au président, au
          fournisseur et à la facture dans les messageries Microsoft 365, et
          prévient vos équipes avant qu’elles n’agissent.
        </p>

        <div className="rise rise-3 mt-9 flex justify-center">
          <Link href="/demo" className={buttonPrimaryLg}>
            Demander une démo
            <IconArrowRight />
          </Link>
        </div>

        {/* Une seule ligne sur écran large. `flex-wrap` reste : les trois
            arguments font près de 800 px, ils ne tiennent pas sur un
            téléphone et mieux vaut qu'ils y passent à la ligne que qu'ils
            débordent. */}
        <ul className="rise rise-3 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
          {REASSURANCES.map((texte) => (
            <li
              key={texte}
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted"
            >
              <IconCheck className="h-3 w-3 shrink-0 text-accent-text" />
              {texte}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
