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
            Un faux virement
            <br />
            se joue en dix minutes.
            <br />
            <span className="text-accent-text">L’alerte arrive avant.</span>
          </h1>

          <p className="rise rise-2 mt-6 max-w-lg text-[15.5px] leading-relaxed text-muted">
            Safentreprise analyse les messages qui arrivent dans vos boîtes
            Microsoft 365 et pose un avertissement sur ceux qui portent les
            signes d’une fraude au président ou au fournisseur.
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

      {/* ⚠ LE TÉLÉPHONE SE POSE AU COIN, PAS SUR LE CONTENU. Une première
          version le plaçait plus haut : il recouvrait la bannière et le corps
          du message ouvert, c'est-à-dire précisément ce que la scène doit
          montrer. Il déborde donc vers l'extérieur, et ne mord que l'angle. */}
      <div className="pb-12 pr-10 sm:pb-14 sm:pr-20">
        <Ordinateur />
      </div>

      <div className="absolute bottom-0 -right-1 w-[118px] sm:w-[142px]">
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
    <div className="relative">
      <div className="overflow-hidden rounded-[14px] border border-border-strong bg-surface shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
        {/* Chrome de la fenêtre */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3.5 py-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
          </span>
          <span className="ml-2 flex-1 truncate rounded-md bg-surface-3 px-2.5 py-1 text-[10px] text-faint">
            Boîte de réception — compta@votre-entreprise.fr
          </span>
        </div>

        {/* Le client de messagerie, sur fond clair comme un vrai courrier */}
        <div className="grid min-h-[188px] grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-stretch bg-[#f7f7f5] sm:min-h-[212px]">
          <ListeMessages />
          <MessageOuvert />
        </div>
      </div>

      {/* Pied d'écran, discret : un socle plutôt qu'un ordinateur entier */}
      <div aria-hidden className="mx-auto mt-1 h-1.5 w-24 rounded-b-[4px] bg-white/10" />
      <div aria-hidden className="mx-auto h-1 w-40 rounded-full bg-black/60 blur-[2px]" />
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
          className={`border-l-2 px-3 py-2 ${
            m.alerte
              ? "border-l-[#c0392b] bg-[#fdf2f2]"
              : "border-l-transparent"
          }`}
        >
          <p className="flex items-center gap-1.5">
            {m.alerte && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c0392b]"
              />
            )}
            <span
              className={`truncate text-[9.5px] ${
                m.alerte ? "font-semibold text-[#7b241c]" : "text-[#3f3f46]"
              }`}
            >
              {m.de}
            </span>
          </p>
          <p className="mt-0.5 truncate text-[9px] text-[#71717a]">{m.objet}</p>
        </div>
      ))}
    </div>
  );
}

/** Le message ouvert, avec la bannière telle que le produit la pose. */
function MessageOuvert() {
  return (
    <div className="px-4 py-3.5">
      <p className="truncate text-[11.5px] font-semibold text-[#18181b]">
        Virement confidentiel — avant 17h
      </p>
      <p className="mt-0.5 truncate text-[9px] text-[#71717a]">
        jean.dupont@direction-groupe.net
      </p>

      <Banniere />

      <div className="mt-2.5 space-y-1.5">
        <p className="text-[9px] leading-relaxed text-[#52525b]">
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
  return (
    <div
      className={`mt-2.5 border-l-[3px] border-[#c0392b] bg-[#fdf2f2] ${
        compact ? "px-2 py-1.5" : "px-2.5 py-2"
      }`}
    >
      <p
        className={`font-semibold text-[#7b241c] ${
          compact ? "text-[8px]" : "text-[9.5px]"
        }`}
      >
        ⚠ Safentreprise — Risque élevé de fraude
      </p>
      <ul
        className={`mt-1 list-disc space-y-px pl-3 text-[#7b241c] ${
          compact ? "text-[7px]" : "text-[8.5px]"
        }`}
      >
        <li>Domaine proche de celui de l’entreprise</li>
        <li>Virement urgent hors procédure</li>
        {!compact && <li>Expéditeur externe se disant dirigeant</li>}
      </ul>
      <p
        className={`mt-1 text-[#7b241c] ${compact ? "text-[7px]" : "text-[8px]"}`}
      >
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
    <div className="rounded-[20px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.95)]">
      <div className="relative overflow-hidden rounded-[15px] bg-[#f7f7f5]">
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
            <span aria-hidden className="block h-1 w-5/6 rounded bg-black/[0.07]" />
            <span aria-hidden className="block h-1 w-3/4 rounded bg-black/[0.07]" />
          </div>
        </div>
      </div>
    </div>
  );
}
