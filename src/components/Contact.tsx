import Link from "next/link";
import { buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight, IconMail, IconPhone } from "@/components/icons";

/**
 * Coordonnées de contact, en un seul endroit.
 *
 * ⚠ LE NUMÉRO EXISTE SOUS DEUX FORMES, ET ELLES NE SONT PAS INTERCHANGEABLES.
 *   Celle qui s'affiche est groupée par paires, à la française ; celle du lien
 *   `tel:` est au format international, sans espace ni zéro initial. Un lien
 *   `tel:` contenant des espaces n'est pas composé par tous les téléphones, et
 *   un numéro en 06 n'est pas joignable depuis l'étranger.
 *
 * ⚠ UNE SEULE SOURCE POUR LES DEUX EMPLACEMENTS. Le pied de page et le bloc
 *   avant pied de page lisent ces constantes : un changement de numéro se fait
 *   ici, et nulle part ailleurs.
 */
export const TELEPHONE_AFFICHE = "06 37 11 40 68";
export const TELEPHONE_LIEN = "+33637114068";
export const EMAIL_CONTACT = "contact@safentreprise.com";

/**
 * Colonne « Nous contacter » du pied de page.
 *
 * ⚠ `min-h-9` SUR LES LIENS N'EST PAS DÉCORATIF. Un lien de 13 px sur une
 *   seule ligne fait une cible de 18 px de haut ; au doigt, on le manque. La
 *   hauteur minimale porte la zone cliquable à 36 px sans changer le rendu.
 */
export function CoordonneesContact() {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
        Nous contacter
      </p>

      <ul className="mt-3 space-y-1">
        <li>
          <a
            href={`tel:${TELEPHONE_LIEN}`}
            className="inline-flex min-h-9 items-center gap-2.5 text-[13.5px] text-muted transition-colors hover:text-foreground"
          >
            <IconPhone className="h-4 w-4 shrink-0 text-faint" />
            {TELEPHONE_AFFICHE}
          </a>
        </li>
        <li>
          <a
            href={`mailto:${EMAIL_CONTACT}`}
            className="inline-flex min-h-9 items-center gap-2.5 text-[13.5px] text-muted transition-colors hover:text-foreground"
          >
            <IconMail className="h-4 w-4 shrink-0 text-faint" />
            {EMAIL_CONTACT}
          </a>
        </li>
      </ul>
    </div>
  );
}

/**
 * Encadré de contact, juste avant le pied de page.
 *
 * ⚠ SECTION BLANCHE, ENCADRÉ GRIS. La section précédente — l'appel à l'action
 *   — est marine : la page alterne, celle-ci est donc claire. C'est l'encadré
 *   qui porte le gris, pas la section.
 */
export function BlocContact() {
  return (
    <section className="px-6 pt-4 pb-20 md:pb-24 lg:px-8">
      <div className="mx-auto max-w-[680px] rounded-2xl border border-border bg-surface-2 px-6 py-10 text-center md:px-10">
        <h2 className="text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-tight text-foreground">
          Une question avant de vous décider ?
        </h2>
        {/* Assez large pour que la phrase tienne sur une ligne au-dessus de
            520 px : coupée, « pas à un service / commercial » perd son effet. */}
        <p className="mx-auto mt-3 max-w-[34rem] text-[14px] leading-relaxed text-muted">
          Vous parlez directement au fondateur, pas à un service commercial.
        </p>

        {/* ⚠ `flex-col` PUIS `sm:flex-row` : sur un téléphone, les deux
            coordonnées côte à côte se serrent au point de rendre le numéro
            difficile à viser. Elles passent l'une sous l'autre, chacune sur
            toute la largeur. */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-10">
          <a
            href={`tel:${TELEPHONE_LIEN}`}
            className="inline-flex min-h-11 items-center gap-2.5 text-[18px] font-semibold tracking-[-0.01em] text-foreground transition-colors hover:text-accent-text"
          >
            <IconPhone className="h-[18px] w-[18px] shrink-0 text-accent-text" />
            {TELEPHONE_AFFICHE}
          </a>

          <a
            href={`mailto:${EMAIL_CONTACT}`}
            className="inline-flex min-h-11 items-center gap-2.5 text-[15px] text-muted transition-colors hover:text-foreground"
          >
            <IconMail className="h-[18px] w-[18px] shrink-0 text-accent-text" />
            {EMAIL_CONTACT}
          </a>
        </div>

        <div className="mt-8">
          <Link href="/demo" className={buttonPrimaryLg}>
            Demander une démo
            <IconArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
