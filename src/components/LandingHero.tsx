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
 *   Microsoft, ni logo Microsoft. Les deux appareils sont dessinés, sans
 *   marque ni libellé de constructeur. Rien ici n'est une marque de tiers.
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
   La mise en scène : deux appareils vus de face, posés au sol
   ========================================================================== */

/**
 * L'ordinateur au centre de la colonne, le téléphone posé à sa droite.
 *
 * ⚠ LES DEUX APPAREILS PARTAGENT LA LIGNE DE SOL. Le bas de l'ordinateur est
 *   le bas de son socle, et le téléphone est calé sur `bottom-0` du même
 *   conteneur : c'est ce qui aligne leurs deux bases. Les ombres au sol sont
 *   donc positionnées en absolu, hors flux — une ombre en flux rallongerait
 *   l'ordinateur et décrocherait le téléphone de plusieurs pixels.
 */
function MiseEnScene() {
  return (
    <div className="rise rise-2 relative mx-auto w-full min-w-0 max-w-[560px] lg:max-w-none">
      {/* Halo derrière les appareils : il détache la scène du fond noir sans
          ajouter de couleur au thème. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_60%_40%,rgba(14,133,147,0.18),transparent_70%)] blur-2xl"
      />

      {/* ⚠ LE RETRAIT MOBILE N'EST PAS DÉCORATIF. Le socle est plus large que
          le capot de 5 % de chaque côté — c'est ce débord qui donne l'assise.
          Sans ce retrait, il sort de la colonne et se fait couper. Élargir le
          socle oblige à élargir le retrait.

          À partir de « sm », l'ordinateur n'occupe que les deux tiers de la
          colonne : le reste est la place du téléphone. */}
      <div className="mx-auto px-[6%] sm:w-[64%] sm:px-0">
        <Ordinateur />
      </div>

      {/* ⚠ LE TÉLÉPHONE NE MORD QUE LE CHÂSSIS. Son bord gauche tombe sur la
          tranche du capot et sur le socle, jamais sur la dalle : la boîte de
          réception doit rester lisible en entier. L'élargir ou le rapprocher
          le ferait empiéter sur l'affichage — la marge est de quelques pixels,
          et elle est la plus étroite vers 1024 px, là où la colonne de droite
          est au plus court.

          Sous « sm », il n'est pas affiché du tout : côte à côte à cette
          largeur, les deux appareils deviennent illisibles. Mieux vaut un seul
          appareil qu'une scène illisible. */}
      <div className="absolute bottom-0 right-[1.5%] hidden w-[17%] sm:block">
        <Telephone />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   L'ordinateur portable, vu de face
   -------------------------------------------------------------------------- */

function Ordinateur() {
  return (
    <div className="relative">
      {/* L'ombre au sol : hors flux, pour que la ligne de sol reste le bas du
          socle. C'est sur elle que le téléphone s'aligne. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[6%] -bottom-[5px] -z-10 h-[15px] rounded-[50%] bg-black/75 blur-[10px]"
      />

      <Capot />
      <Socle />
    </div>
  );
}

/** Le capot : châssis autour de la dalle, menton plus épais en bas. */
function Capot() {
  return (
    <div className="relative rounded-[9px] border border-white/[0.10] bg-[#16181c] px-[8px] pt-[8px] pb-[14px] shadow-[0_26px_50px_-22px_rgba(0,0,0,0.95)]">
      <span
        aria-hidden
        className="absolute left-1/2 top-[3.5px] h-[2.5px] w-[2.5px] -translate-x-1/2 rounded-full bg-white/20"
      />

      <div className="overflow-hidden rounded-[3px] bg-surface">
        {/* Chrome de la fenêtre */}
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-2.5 py-2">
          <span aria-hidden className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          </span>
          <span className="ml-1.5 flex-1 truncate rounded bg-surface-3 px-2 py-0.5 text-[8px] text-faint">
            Boîte de réception — compta@votre-entreprise.fr
          </span>
        </div>

        {/* Le client de messagerie, sur fond clair comme un vrai courrier */}
        <div className="grid min-h-[152px] grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-stretch bg-[#f7f7f5]">
          <ListeMessages />
          <MessageOuvert />
        </div>
      </div>
    </div>
  );
}

/**
 * Le socle, vu de face : la base ouverte sous l'écran.
 *
 * ⚠ IL DÉBORDE DU CAPOT DE 5 % DE CHAQUE CÔTÉ, et c'est voulu : vu de face, le
 *   bord avant est le plus proche, donc le plus large. Le trapèze vient du
 *   `clip-path`, pas d'une rotation — arrondir les coins n'aurait aucun effet,
 *   le découpage passe après.
 *
 * ⚠ IL EST CENTRÉ PAR MARGE NÉGATIVE, PAS PAR `mx-auto`. Une marge automatique
 *   ne devient jamais négative : sur un bloc plus large que son parent elle
 *   vaut zéro, et le socle ne débordait alors que du côté droit.
 */
function Socle() {
  return (
    <div aria-hidden className="relative -ml-[5%] w-[110%]">
      {/* ⚠ CLAIR, ET C'EST CE QUI LE REND VISIBLE. Un premier socle repris du
          gris du capot se confondait avec le fond noir : l'ordinateur avait
          l'air d'un écran flottant. Le contraste tient le sol. */}
      <div className="h-[12px] w-full bg-gradient-to-b from-[#9aa1ab] via-[#6a717b] to-[#3c414a] [clip-path:polygon(1.8%_0,98.2%_0,100%_100%,0_100%)]" />
      {/* L'encoche d'ouverture, au milieu du bord avant. */}
      <div className="absolute left-1/2 top-0 h-[4.5px] w-[13%] -translate-x-1/2 rounded-b-[4px] bg-[#2b3037]" />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Le contenu des écrans
   -------------------------------------------------------------------------- */

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
          className={`border-l-2 px-2 py-1.5 ${
            m.alerte
              ? "border-l-[#c0392b] bg-[#fdf2f2]"
              : "border-l-transparent"
          }`}
        >
          <p className="flex items-center gap-1">
            {m.alerte && (
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full bg-[#c0392b]"
              />
            )}
            <span
              className={`truncate text-[8px] ${
                m.alerte ? "font-semibold text-[#7b241c]" : "text-[#3f3f46]"
              }`}
            >
              {m.de}
            </span>
          </p>
          <p className="mt-0.5 truncate text-[7.5px] text-[#71717a]">
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
    <div className="px-2.5 py-2.5">
      <p className="truncate text-[9.5px] font-semibold text-[#18181b]">
        Virement confidentiel — avant 17h
      </p>
      <p className="mt-0.5 truncate text-[7.5px] text-[#71717a]">
        jean.dupont@direction-groupe.net
      </p>

      <Banniere />

      <div className="mt-2 space-y-1.5">
        <p className="text-[7.5px] leading-relaxed text-[#52525b]">
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
  // Le format compact n'existe que sur le téléphone, qui n'est affiché qu'à
  // partir de « sm » et à une largeur quasi constante : il n'a donc pas de
  // variante par palier.
  const t = compact
    ? {
        marge: "px-1.5 py-1",
        titre: "text-[6px]",
        liste: "text-[5.5px]",
        pied: "text-[5.5px]",
      }
    : {
        marge: "px-2 py-1.5",
        titre: "text-[8px]",
        liste: "text-[7px]",
        pied: "text-[6.5px]",
      };

  return (
    <div
      className={`mt-2 border-l-[3px] border-[#c0392b] bg-[#fdf2f2] ${t.marge}`}
    >
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
   Le téléphone, vu de face
   -------------------------------------------------------------------------- */

function Telephone() {
  return (
    <div className="relative">
      {/* L'ombre au sol, hors flux comme celle de l'ordinateur : les deux
          appareils reposent sur la même ligne. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[8%] -bottom-[4px] -z-10 h-[10px] rounded-[50%] bg-black/75 blur-[7px]"
      />

      {/* Les tranches : volume à gauche, veille à droite. */}
      <span
        aria-hidden
        className="absolute -left-[1.5px] top-[20%] h-[6%] w-[1.5px] rounded-l-[2px] bg-[#3a4048]"
      />
      <span
        aria-hidden
        className="absolute -left-[1.5px] top-[29%] h-[6%] w-[1.5px] rounded-l-[2px] bg-[#3a4048]"
      />
      <span
        aria-hidden
        className="absolute -right-[1.5px] top-[24%] h-[8%] w-[1.5px] rounded-r-[2px] bg-[#3a4048]"
      />

      {/* Le corps : châssis plein, dalle encastrée. */}
      <div className="rounded-[14px] border border-white/[0.14] bg-gradient-to-b from-[#2b3038] to-[#14171b] p-[3px] shadow-[0_20px_38px_-16px_rgba(0,0,0,0.95)]">
        <div className="relative overflow-hidden rounded-[11px] bg-[#f7f7f5]">
          {/* L'îlot du haut */}
          <div className="flex justify-center bg-white/70 pt-[3px]">
            <span
              aria-hidden
              className="h-[3px] w-[24%] rounded-full bg-black/75"
            />
          </div>

          <div className="px-1.5 pb-2 pt-1.5">
            <p className="truncate text-[6.5px] font-semibold text-[#18181b]">
              Virement confidentiel
            </p>
            <p className="truncate text-[5.5px] text-[#71717a]">
              jean.dupont@direction-groupe.net
            </p>

            <Banniere compact />

            <div className="mt-1.5 space-y-[3px]">
              <span
                aria-hidden
                className="block h-[3px] rounded bg-black/[0.07]"
              />
              <span
                aria-hidden
                className="block h-[3px] w-5/6 rounded bg-black/[0.07]"
              />
              <span
                aria-hidden
                className="block h-[3px] w-3/4 rounded bg-black/[0.07]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
