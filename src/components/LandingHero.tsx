import Link from "next/link";
import { buttonPrimaryLg, buttonSecondaryLg } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";

type Props = {
  isLoggedIn: boolean;
};

/** Les trois réassurances sous les boutons. Chacune doit être vraie. */
const REASSURANCES = [
  "Sans engagement",
  "Mise en place accompagnée",
  "Données en France",
];

/**
 * Hero de la landing : l'annonce à gauche, le produit à droite.
 *
 * ⚠ LA MAQUETTE MONTRE LE VRAI PRODUIT. Les couleurs de la bannière — fond
 *   #fdf2f2, filet #c0392b, texte #7b241c — et son libellé sont ceux que
 *   `src/lib/microsoft/banniere.ts` pose réellement dans les messages. Un
 *   visuel qui montrerait autre chose promettrait autre chose.
 *
 *   Le client de messagerie, lui, est une évocation : ni copie de l'interface
 *   Microsoft, ni logo Microsoft. Rien n'y est une marque de tiers.
 */
export function LandingHero({ isLoggedIn }: Props) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="starfield" />
        <div className="top-glow absolute inset-x-0 top-0 h-[520px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-20 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pt-24">
        {/* ---------------------------------------------------------------
            Colonne texte
            --------------------------------------------------------------- */}
        <div className="min-w-0 max-w-xl">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[12.5px] text-muted backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
            Protection anti-fraude pour Microsoft 365
          </p>

          <h1 className="rise rise-1 mt-7 text-[clamp(2rem,3.9vw,3.05rem)] font-extrabold leading-[1.08] tracking-[-0.04em] text-foreground">
            La fraude par email
            <br />
            arrive dans votre boîte.
            <br />
            <span className="text-accent-text">L’alerte arrive avant.</span>
          </h1>

          <p className="rise rise-2 mt-6 max-w-lg text-[15.5px] leading-relaxed text-muted">
            Safentreprise analyse les messages qui arrivent dans vos boîtes
            Microsoft 365 et pose un avertissement sur ceux qui portent les
            signes d’une tentative de fraude.
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
            --------------------------------------------------------------- */}
        <MiseEnScene />
      </div>
    </section>
  );
}

/* ==========================================================================
   La mise en scène : un écran, et un téléphone posé devant
   ========================================================================== */

function MiseEnScene() {
  return (
    <div className="rise rise-2 relative mx-auto w-full min-w-0 max-w-[560px] lg:max-w-none">
      {/* Halo derrière les appareils : il détache la scène du fond noir sans
          ajouter de couleur au thème. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_60%_40%,rgba(14,133,147,0.18),transparent_70%)] blur-2xl"
      />

      {/* ⚠ LE RETRAIT LATÉRAL N'EST PAS DÉCORATIF. La base s'évase au-delà de
          sa boîte : la perspective grossit son bord avant d'environ un
          dixième, si bien que le clavier dépasse la largeur que la mise en
          page lui réserve. Sans ce retrait, il sort de la colonne et se fait
          couper. Réduire le retrait oblige à réduire l'évasement.

          À partir de « sm », l'ordinateur laisse en plus de la place à sa
          droite : c'est là que le téléphone se pose. */}
      <div className="px-[5%] sm:w-[79%] sm:pb-12 sm:pl-[6.5%] sm:pr-0">
        <Ordinateur />
      </div>

      {/* ⚠ LE TÉLÉPHONE NE MORD QUE LE CHÂSSIS. Son bord gauche tombe sur la
          tranche du capot et sur la marge intérieure du volet de lecture, pas
          sur le texte : la boîte de réception doit rester lisible en entier.
          Plus bas, il recouvre le clavier, qui s'évase vers l'avant. Élargir
          le téléphone ou le rapprocher le ferait empiéter sur la dalle.

          Sous « sm », il n'est pas affiché du tout : à cette largeur les deux
          appareils se recouvraient et plus rien n'était lisible. Mieux vaut un
          seul appareil qu'une scène illisible. */}
      <div className="absolute bottom-0 right-[2%] hidden w-[20%] sm:block">
        <Telephone />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Écran d'ordinateur
   -------------------------------------------------------------------------- */

function Ordinateur() {
  return (
    <div className="relative [perspective:1500px]">
      {/* Le trois-quarts de l'objet entier : écran, charnière et base tournent
          ensemble, sinon la base se décollerait de l'écran. */}
      <div className="[transform:rotateY(-7deg)_rotateX(2deg)] [transform-style:preserve-3d]">
        <EcranPortable />
        <Charniere />
        <BasePortable />
      </div>

      {/* L'ombre au sol : elle assied l'objet, elle ne le dessine pas. */}
      <div
        aria-hidden
        className="mx-auto mt-2 h-3 w-[72%] rounded-[50%] bg-black/70 blur-[10px]"
      />
    </div>
  );
}

/** Le capot : châssis, webcam, dalle. */
function EcranPortable() {
  return (
    <div className="relative rounded-t-[10px] border border-b-0 border-white/[0.13] bg-gradient-to-b from-[#252a31] to-[#191c21] px-[5px] pt-[8px] pb-[4px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] sm:rounded-t-[13px] sm:px-[7px] sm:pt-[11px] sm:pb-[6px]">
      <span
        aria-hidden
        className="absolute left-1/2 top-[3px] h-[2.5px] w-[2.5px] -translate-x-1/2 rounded-full bg-white/25 sm:top-[4.5px] sm:h-[3px] sm:w-[3px]"
      />

      <div className="overflow-hidden rounded-[3px] border border-black/50 bg-surface sm:rounded-[4px]">
        {/* Chrome de la fenêtre */}
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-2.5 py-2 sm:gap-2 sm:px-3.5 sm:py-2.5">
          <span aria-hidden className="flex gap-1 sm:gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/15 sm:h-2 sm:w-2" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/15 sm:h-2 sm:w-2" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/15 sm:h-2 sm:w-2" />
          </span>
          <span className="ml-1.5 flex-1 truncate rounded bg-surface-3 px-2 py-0.5 text-[8px] text-faint sm:ml-2 sm:rounded-md sm:px-2.5 sm:py-1 sm:text-[10px]">
            Boîte de réception — compta@votre-entreprise.fr
          </span>
        </div>

        {/* Le client de messagerie, sur fond clair comme un vrai courrier */}
        <div className="grid min-h-[152px] grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-stretch bg-[#f7f7f5] sm:min-h-[212px]">
          <ListeMessages />
          <MessageOuvert />
        </div>
      </div>
    </div>
  );
}

/** La charnière : le trait qui rattache le capot à la base. */
function Charniere() {
  return (
    <div
      aria-hidden
      className="mx-auto h-[5px] w-[96%] rounded-b-[3px] border-x border-b border-white/10 bg-gradient-to-b from-[#2c3138] to-[#0f1216]"
    />
  );
}

/**
 * La base, clavier compris.
 *
 * ⚠ LA HAUTEUR RÉSERVÉE N'EST PAS LA HAUTEUR VUE. Le plan est basculé de 70°,
 *   ce qui l'écrase à environ un tiers à l'écran, mais la mise en page continue
 *   de réserver sa hauteur pleine : la marge négative rend l'espace que le
 *   basculement libère. Toucher à l'angle ou à la hauteur oblige à reprendre la
 *   marge, sinon un vide s'ouvre sous l'ordinateur.
 */
function BasePortable() {
  const rangees = [13, 13, 12, 11, 8];

  return (
    <div
      aria-hidden
      className="relative mx-auto -mb-[80px] h-[114px] w-[103%] origin-top rounded-b-[7px] border border-white/[0.09] bg-gradient-to-b from-[#1e2229] to-[#343941] px-[8%] pt-[10px] [transform:rotateX(70deg)] sm:-mb-[105px] sm:h-[150px] sm:rounded-b-[9px] sm:pt-[13px]"
    >
      <div className="space-y-[4px] sm:space-y-[5px]">
        {rangees.map((touches, i) => (
          <div key={i} className="flex h-[11px] gap-[3px] sm:h-[15px] sm:gap-[4px]">
            {Array.from({ length: touches }, (_, j) => (
              <span
                key={j}
                className="flex-1 rounded-[2px] bg-black/45 shadow-[0_1px_0_rgba(255,255,255,0.07)]"
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-[10px] h-[24px] w-[34%] rounded-[4px] border border-white/10 bg-white/[0.045] sm:mt-[13px] sm:h-[32px] sm:rounded-[5px]" />
    </div>
  );
}

/** Trois messages, dont celui qui est signalé — sélectionné. */
function ListeMessages() {
  const messages = [
    { de: "Marie Leroy", objet: "Compte rendu réunion", alerte: false },
    { de: "Jean Dupont", objet: "Virement confidentiel", alerte: true },
    { de: "Fournitures Pro", objet: "Facture 2026-0412", alerte: false },
  ];

  return (
    <div className="border-r border-black/[0.07] bg-white/60 py-1.5">
      {messages.map((m) => (
        <div
          key={m.objet}
          className={`border-l-2 px-2 py-1.5 sm:px-3 sm:py-2 ${
            m.alerte
              ? "border-l-[#c0392b] bg-[#fdf2f2]"
              : "border-l-transparent"
          }`}
        >
          <p className="flex items-center gap-1 sm:gap-1.5">
            {m.alerte && (
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full bg-[#c0392b] sm:h-1.5 sm:w-1.5"
              />
            )}
            <span
              className={`truncate text-[8px] sm:text-[9.5px] ${
                m.alerte ? "font-semibold text-[#7b241c]" : "text-[#3f3f46]"
              }`}
            >
              {m.de}
            </span>
          </p>
          <p className="mt-0.5 truncate text-[7.5px] text-[#71717a] sm:text-[9px]">
            {m.objet}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Le message ouvert, avec la bannière telle que le produit la pose. */
function MessageOuvert() {
  return (
    <div className="px-2.5 py-2.5 sm:px-4 sm:py-3.5">
      <p className="truncate text-[9.5px] font-semibold text-[#18181b] sm:text-[11.5px]">
        Virement confidentiel — avant 17h
      </p>
      <p className="mt-0.5 truncate text-[7.5px] text-[#71717a] sm:text-[9px]">
        jean.dupont@direction-groupe.net
      </p>

      <Banniere />

      <div className="mt-2 space-y-1.5 sm:mt-2.5">
        <p className="text-[7.5px] leading-relaxed text-[#52525b] sm:text-[9px]">
          Sophie, j’ai besoin d’un virement de 47 800 €
          <br />
          aujourd’hui, sans passer par la validation.
        </p>
        <span aria-hidden className="block h-1 w-4/5 rounded bg-black/[0.07]" />
        <span aria-hidden className="block h-1 w-2/3 rounded bg-black/[0.07]" />
      </div>
    </div>
  );
}

/**
 * La bannière, aux couleurs exactes du produit.
 *
 * Voir APPARENCE.eleve dans src/lib/microsoft/banniere.ts : fond #fdf2f2,
 * filet gauche #c0392b, texte #7b241c.
 */
function Banniere({ compact = false }: { compact?: boolean }) {
  // Le format compact n'existe que sur le téléphone, qui n'est pas affiché
  // sous « sm » : il n'a donc pas de variante mobile.
  const t = compact
    ? {
        marge: "px-2 py-1.5",
        titre: "text-[8px]",
        liste: "text-[7px]",
        pied: "text-[7px]",
      }
    : {
        marge: "px-2 py-1.5 sm:px-2.5 sm:py-2",
        titre: "text-[8px] sm:text-[9.5px]",
        liste: "text-[7px] sm:text-[8.5px]",
        pied: "text-[6.5px] sm:text-[8px]",
      };

  return (
    <div className={`mt-2 border-l-[3px] border-[#c0392b] bg-[#fdf2f2] sm:mt-2.5 ${t.marge}`}>
      <p className={`font-semibold text-[#7b241c] ${t.titre}`}>
        {/* Espace insécable : sur le téléphone, le « ⚠ » restait seul sur sa
            ligne. */}
        ⚠&nbsp;Safentreprise — Risque élevé de fraude
      </p>
      <ul
        className={`mt-1 list-disc space-y-px pl-3 text-[#7b241c] ${t.liste}`}
      >
        <li>Domaine proche de celui de l’entreprise</li>
        <li>Virement urgent hors procédure</li>
        {!compact && <li>Expéditeur externe se disant dirigeant</li>}
      </ul>
      <p className={`mt-1 text-[#7b241c] ${t.pied}`}>
        Vérifiez par un autre moyen avant de donner suite.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Téléphone
   -------------------------------------------------------------------------- */

function Telephone() {
  return (
    <div className="relative">
      {/* Les tranches : boutons de volume à gauche, veille à droite. */}
      <span
        aria-hidden
        className="absolute -left-[2px] top-[19%] h-[7%] w-[2.5px] rounded-l-[2px] bg-[#3a4048]"
      />
      <span
        aria-hidden
        className="absolute -left-[2px] top-[29%] h-[7%] w-[2.5px] rounded-l-[2px] bg-[#3a4048]"
      />
      <span
        aria-hidden
        className="absolute -right-[2px] top-[24%] h-[9%] w-[2.5px] rounded-r-[2px] bg-[#3a4048]"
      />

      {/* Le corps : châssis plein, dalle encastrée. */}
      <div className="rounded-[22px] border border-white/[0.14] bg-gradient-to-b from-[#2a2f36] to-[#15181d] p-[5px] shadow-[0_30px_60px_-18px_rgba(0,0,0,0.95)]">
        <div className="relative overflow-hidden rounded-[17px] bg-[#f7f7f5]">
          {/* Encoche */}
          <div className="flex justify-center bg-white/70 pt-1.5">
            <span aria-hidden className="h-1 w-8 rounded-full bg-black/20" />
          </div>

          <div className="px-2 pb-3 pt-2">
            <p className="truncate text-[8px] font-semibold text-[#18181b]">
              Virement confidentiel
            </p>
            <p className="truncate text-[6.5px] text-[#71717a]">
              jean.dupont@direction-groupe.net
            </p>

            <Banniere compact />

            <div className="mt-2 space-y-1">
              <span aria-hidden className="block h-1 rounded bg-black/[0.07]" />
              <span
                aria-hidden
                className="block h-1 w-5/6 rounded bg-black/[0.07]"
              />
              <span
                aria-hidden
                className="block h-1 w-3/4 rounded bg-black/[0.07]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* L'ombre qui pose le téléphone sur la base de l'ordinateur. */}
      <div
        aria-hidden
        className="mx-auto mt-1.5 h-2 w-[68%] rounded-[50%] bg-black/70 blur-[7px]"
      />
    </div>
  );
}
