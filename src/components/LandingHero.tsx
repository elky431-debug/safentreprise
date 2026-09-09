import Image from "next/image";
import Link from "next/link";
import { buttonPrimaryLg, buttonSecondaryLg } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";

type Props = {
  isLoggedIn: boolean;
};

/**
 * Les trois réassurances sous les boutons. Chacune doit être vraie.
 *
 * ⚠ « Aucune extension à installer » CONTREDIT LA SECTION « PROTECTION » DE LA
 *   MÊME PAGE, qui décrit une extension de navigateur et parle d'installation
 *   (`src/components/ProtectionExtension.tsx`). La phrase est juste pour le
 *   raccordement Microsoft 365, qui passe par Graph côté serveur ; elle ne
 *   l'est pas pour la protection décrite plus bas. L'une des deux doit
 *   changer.
 */
const REASSURANCES = [
  "Aucune extension à installer",
  "Accès limité aux boîtes que vous choisissez",
  "Données hébergées en France",
];

/**
 * Hero de la landing : l'annonce à gauche, le produit à droite.
 *
 * ⚠ LA MAQUETTE EST UNE IMAGE, PLUS DU CODE. Ce qu'elle montre — le libellé de
 *   la bannière, ses couleurs, le texte du message — n'est plus relié à
 *   `src/lib/microsoft/banniere.ts` : rien ne signalera qu'ils ont divergé. À
 *   chaque changement de la bannière posée par le produit, il faut refaire
 *   l'image, sans quoi la vitrine promet ce que le produit ne fait plus.
 *
 *   L'image ne porte ni marque ni logo de tiers ; l'inscription du châssis a
 *   été retirée avant intégration.
 */
export function LandingHero({ isLoggedIn }: Props) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-20 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pt-24">
        {/* ---------------------------------------------------------------
            Colonne texte
            --------------------------------------------------------------- */}
        <div className="min-w-0 max-w-xl">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[12.5px] text-muted backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
            Protection anti-fraude pour Microsoft 365
          </p>

          {/* Les coupures sont posées à la main : laissé libre, le titre
              renvoyait « cliquer. » seul sur une quatrième ligne. Chacune de
              ces quatre lignes tient à toutes les largeurs, de 360 px à
              1920 px. */}
          <h1 className="rise rise-1 mt-7 text-[clamp(1.85rem,3.5vw,2.85rem)] font-extrabold leading-[1.1] tracking-[-0.035em] text-foreground">
            La fraude par mail
            <br />
            vise vos équipes.
            <br />
            <span className="text-accent-text">
              Elles le sauront
              <br />
              avant de cliquer.
            </span>
          </h1>

          <p className="rise rise-2 mt-6 max-w-lg text-[15.5px] leading-relaxed text-muted">
            Safentreprise repère les tentatives de fraude au président, au
            fournisseur et à la facture dans les messageries Microsoft 365, et
            prévient vos équipes avant qu’elles n’agissent.
          </p>

          <div className="rise rise-3 mt-9 flex flex-wrap items-center gap-3">
            <Link href="/demo" className={buttonPrimaryLg}>
              Demander une démo
              <IconArrowRight />
            </Link>
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className={buttonSecondaryLg}
            >
              Accéder à mon espace
            </Link>
          </div>

          <ul className="rise rise-3 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {REASSURANCES.map((texte) => (
              <li
                key={texte}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted"
              >
                <IconCheck className="h-3 w-3 shrink-0 text-accent-text" />
                {texte}
              </li>
            ))}
          </ul>
        </div>

        {/* ---------------------------------------------------------------
            Mise en scène produit

            ⚠ SUR PETIT ÉCRAN, LE CONTENU DE L'ÉCRAN N'EST PLUS LISIBLE. La
              maquette CSS qu'elle remplace se remettait à l'échelle ; une
              image, non : à 342 px de large, le texte du message tombe sous
              4 px. Elle n'y vaut plus que comme signal — un écran, une
              bannière rouge.
            --------------------------------------------------------------- */}
        <Image
          src="/maquette-ordinateur.webp"
          alt="Une boîte de réception affichant un message frauduleux, surmonté de la bannière d’alerte rouge de Safentreprise."
          width={1119}
          height={682}
          sizes="(min-width: 1024px) 46vw, (min-width: 640px) 90vw, 100vw"
          priority
          className="rise rise-2 h-auto w-full min-w-0"
        />
      </div>
    </section>
  );
}
