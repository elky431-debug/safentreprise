import Link from "next/link";
import { buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { EquipeHero } from "@/components/EquipeHero";

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
 * Les étiquettes posées sur la photo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ TOUT SE RÈGLE ICI, EN POURCENTAGE DE LA PHOTO. Trois coordonnées par
 *   étiquette :
 *
 *     `boite`   — où se pose l'étiquette (coins CSS, valeurs négatives pour
 *                 déborder légèrement du cadre, comme chez Mailinblack) ;
 *     `depart`  — d'où part le trait pointillé, au bord de l'étiquette ;
 *     `point`   — où se pose le rond, sur un poste de travail.
 *
 *   `depart` est donné à la main plutôt que mesuré : mesurer la boîte au
 *   rendu demanderait un effet de disposition et ferait sauter le trait à
 *   chaque changement de police. Trois nombres écrits valent mieux qu'une
 *   mesure qui bouge.
 *
 * ⚠ LES POINTS SONT CALÉS SUR LA PHOTO FINALE, PAS SUR LA SOURCE. Changer de
 *   photo, ou changer `RATIO` / `DECALAGE_X` dans `outils/photo-hero.mjs`,
 *   décroche les ronds de leur poste de travail. Les deux se relisent ensemble.
 *
 * ⚠ L'ORDRE DE LECTURE EST UN Z : haut-gauche, haut-droite, bas-droite,
 *   bas-gauche. Il suit l'ordre réel du produit — on repère, on avertit dans
 *   le message, on prévient le dirigeant, et le message reste où il était.
 *
 * ⚠ LES ÉTIQUETTES NE DOIVENT PAS REDIRE LES TROIS ARGUMENTS. Les arguments
 *   sous le bouton répondent à des OBJECTIONS (« il faut installer quelque
 *   chose ? », « vous lisez tout ? », « c'est hébergé où ? ») ; les étiquettes
 *   montrent ce que le PRODUIT FAIT. La quatrième a d'abord porté « Aucune
 *   extension à installer », qui figurait déjà à gauche : les deux se voyaient
 *   d'un seul coup d'œil à 1440 px.
 *
 *   « Le message reste dans la boîte » dit autre chose, et dit vrai : le
 *   message est déplacé puis ramené dans sa boîte de réception — jamais mis en
 *   quarantaine, jamais supprimé. C'est la différence avec un filtre, et c'est
 *   exactement ce que garantit le mécanisme de déplacement.
 * ─────────────────────────────────────────────────────────────────────────
 */
const ETIQUETTES = [
  {
    texte: "La tentative de fraude est repérée",
    boite: { left: "-4%", top: "5%" },
    depart: { x: 25, y: 19 },
    point: { x: 25, y: 53 },
  },
  {
    texte: "La bannière apparaît dans le mail",
    boite: { right: "-4%", top: "23%" },
    depart: { x: 62, y: 37 },
    point: { x: 44, y: 54 },
  },
  {
    texte: "Le dirigeant est prévenu",
    boite: { right: "-2%", bottom: "6%" },
    depart: { x: 72, y: 81 },
    point: { x: 64, y: 60 },
  },
  {
    texte: "Le message reste dans la boîte",
    boite: { left: "-4%", bottom: "25%" },
    depart: { x: 34, y: 67 },
    point: { x: 34, y: 81 },
  },
];

/**
 * Hero de la vitrine : deux colonnes sur grand écran, une seule sous 1024 px.
 *
 * ⚠ IL NE DOIT PAS REMPLIR L'ÉCRAN. Le début de la bande marine doit dépasser
 *   sous la ligne de flottaison — c'est elle qui donne envie de faire défiler.
 *   D'où un rembourrage bas mesuré plutôt qu'une hauteur d'écran.
 *
 * ⚠ LE POINT DE BASCULE EST `lg` (1024 px), PAS `md`. À 768 px, deux colonnes
 *   laisseraient au texte 340 px utiles : le titre y passerait sur cinq lignes
 *   et la photo deviendrait une vignette. Une colonne jusqu'à 1024, deux
 *   au-delà.
 */
export function LandingHero() {
  return (
    <section className="px-6 pt-14 pb-14 md:pt-20 md:pb-20 lg:px-8">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2 lg:gap-14">
        {/* ================= Colonne gauche ================= */}
        <div className="text-left">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
            Protection anti-fraude pour Microsoft 365
          </p>

          {/* ⚠ PLUS DE COUPE FORCÉE. Le `<br>` d'avant était calé sur une
              colonne pleine largeur ; dans une demi-colonne il produisait une
              ligne courte suivie d'une ligne longue. `text-balance` répartit
              mieux, et l'espace insécable garde « boîte mail. » ensemble. */}
          <h1 className="rise rise-1 mt-7 text-[clamp(1.9rem,3.4vw,3.1rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-balance text-foreground">
            La sécurité d’une entreprise se joue dans sa{" "}
            <span className="text-accent-text">boîte&nbsp;mail.</span>
          </h1>

          {/* ⚠ LA LARGEUR EST BORNÉE EN `ch`, PAS EN PIXELS. 54 caractères, soit
              une ligne qu'on lit sans perdre le début en revenant à la ligne.

              MESURÉ AU NAVIGATEUR sur ce texte-ci, pas estimé :
                1280–1440 px → 2 lignes (le bloc plafonne à 562 px)
                1024–1100 px → 3 lignes (la colonne se resserre avant `lg`)
                 768–900 px → 2 lignes (une seule colonne, 562 px à nouveau)
                 360–430 px → 4 lignes
                     320 px → 5 lignes

              QUATRE LIGNES SUR TÉLÉPHONE EST LE PLANCHER pour une phrase de
              cette longueur : à 342 px utiles et 16,5 px de corps, on tient
              environ 42 caractères par ligne. Descendre à trois demanderait de
              réduire le corps, ce qui coûterait plus en lisibilité que la
              ligne gagnée. Rallonger la phrase, en revanche, ajoute une ligne
              partout — revérifier si elle change. */}
          <p className="rise rise-2 mt-6 max-w-[54ch] text-[16.5px] leading-relaxed text-muted">
            Safentreprise sécurise la messagerie de votre entreprise, là où
            passent les tentatives de fraude, et avertit vos équipes avant
            qu’elles n’agissent.
          </p>

          <div className="rise rise-3 mt-9">
            <Link href="/demo" className={buttonPrimaryLg}>
              Demander une démo
              <IconArrowRight />
            </Link>
          </div>

          {/* ⚠ EN COLONNE, PAS EN LIGNE. Sur une demi-largeur, les trois
              arguments alignés horizontalement se replieraient n'importe
              comment ; empilés, ils se lisent et forment un bloc calme sous le
              bouton. */}
          <ul className="rise rise-3 mt-8 flex flex-col gap-2.5">
            {REASSURANCES.map((texte) => (
              <li
                key={texte}
                className="inline-flex items-center gap-2 text-[13px] text-muted"
              >
                <IconCheck className="h-3 w-3 shrink-0 text-accent-text" />
                {texte}
              </li>
            ))}
          </ul>

          {/* ⚠ LE BLOC ÉQUIPE RESTE DANS LA COLONNE DE GAUCHE, sous les
              arguments. Sous le hero, il flotterait entre deux sections sans
              appartenir à aucune ; ici il termine la colonne et équilibre la
              hauteur de la photo, qui est plus haute que le texte. */}
          <EquipeHero aligne="gauche" className="rise rise-3 mt-11" />
        </div>

        {/* ================= Colonne droite ================= */}
        <PhotoBureau />
      </div>
    </section>
  );
}

/* ==========================================================================
   La photo et ses étiquettes
   ========================================================================== */

const SOURCE = "/marque/hero/bureau";

/**
 * ⚠ CETTE IMAGE EST L'ÉLÉMENT LCP DE LA PAGE. Elle est donc chargée
 *   `eager` avec `fetchPriority="high"` : la laisser en différé retarderait la
 *   mesure de rendu du contenu principal de plusieurs centaines de
 *   millisecondes, sur la seule image que le visiteur voit en arrivant.
 *
 * ⚠ `<picture>` PLUTÔT QUE `next/image`. Deux largeurs et trois formats
 *   suffisent ; le redimensionnement à la volée n'apporterait rien et
 *   l'optimiseur ajoute une dépendance à l'hébergeur pour une image figée.
 *   Une seule des six déclinaisons part sur le réseau.
 */
function PhotoBureau() {
  return (
    /* `relative` sans `overflow-hidden` : les étiquettes doivent pouvoir
       déborder du cadre. L'arrondi et le rognage vivent sur l'enfant. */
    <div className="rise rise-2 relative">
      <div className="overflow-hidden rounded-3xl shadow-[0_24px_60px_-28px_rgba(16,20,26,0.35)]">
        <picture>
          <source
            type="image/avif"
            srcSet={`${SOURCE}-640.avif 640w, ${SOURCE}-1280.avif 1280w`}
            sizes="(min-width: 1024px) 46vw, 100vw"
          />
          <source
            type="image/webp"
            srcSet={`${SOURCE}-640.webp 640w, ${SOURCE}-1280.webp 1280w`}
            sizes="(min-width: 1024px) 46vw, 100vw"
          />
          <img
            src={`${SOURCE}-640.jpg`}
            srcSet={`${SOURCE}-640.jpg 640w, ${SOURCE}-1280.jpg 1280w`}
            sizes="(min-width: 1024px) 46vw, 100vw"
            width={640}
            height={480}
            /* Décorative : ce qu'elle montre est déjà écrit dans le titre et
               dans les étiquettes, qui sont du texte. */
            alt=""
            aria-hidden
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="block h-auto w-full"
          />
        </picture>
      </div>

      <Etiquettes />
      <ListeEtiquettes />
    </div>
  );
}

/**
 * Les étiquettes en surimpression — grands écrans seulement.
 *
 * ⚠ ELLES DISPARAISSENT SOUS 1024 px, ET C'EST LA BONNE RÉPONSE. Quatre
 *   étiquettes de 200 px sur une photo de 360 px se chevauchent quoi qu'on
 *   fasse ; les rétrécir les rendrait illisibles. Sous ce seuil, c'est la
 *   liste qui prend le relais — même information, disposition honnête.
 *
 * ⚠ LE GROUPE EST `aria-hidden`, ET C'EST LA LISTE QUI PARLE — À TOUTES LES
 *   TAILLES. Les deux portent le même texte : sans `aria-hidden` ici, un
 *   lecteur d'écran lirait les quatre phrases deux fois.
 *
 *   D'où `lg:sr-only` sur la liste, et surtout PAS `lg:hidden` : au-dessus de
 *   1024 px, `hidden` la retirait aussi de l'arbre d'accessibilité, et les
 *   quatre phrases n'existaient alors plus du tout pour qui n'a pas l'image.
 *   `sr-only` la sort du rendu visuel en la laissant lisible.
 */
function Etiquettes() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      {/* ⚠ LE SVG NE PORTE QUE LES TRAITS, JAMAIS LES RONDS.
          `preserveAspectRatio="none"` est indispensable pour que le repère
          0–100 colle aux pourcentages des étiquettes — mais il ÉTIRE tout ce
          qu'on y dessine. Un `<circle r="4">` y devient une ellipse de 30 px
          sur 23, qui mange un visage. Les traits, eux, sont des segments entre
          deux points en pourcentage : l'étirement ne fait que leur donner le
          bon angle. `vector-effect` leur garde une épaisseur constante. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {ETIQUETTES.map((e) => (
          <line
            key={e.texte}
            x1={e.depart.x}
            y1={e.depart.y}
            x2={e.point.x}
            y2={e.point.y}
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.9"
          />
        ))}
      </svg>

      {/* Les ronds, en HTML : ils restent ronds quelle que soit la forme du
          cadre. `-translate-*` les centre sur leur point. */}
      {ETIQUETTES.map((e) => (
        <span
          key={`point-${e.texte}`}
          style={{ left: `${e.point.x}%`, top: `${e.point.y}%` }}
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-[3px] ring-[var(--marine)]/35"
        />
      ))}

      {ETIQUETTES.map((e) => (
        <span
          key={e.texte}
          style={e.boite}
          className="absolute max-w-[16rem] rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-medium leading-snug text-[var(--marine)] shadow-[0_8px_24px_-10px_rgba(16,20,26,0.45)]"
        >
          {e.texte}
        </span>
      ))}
    </div>
  );
}

/**
 * Le relais visuel sous 1024 px — et le porteur du texte à toutes les tailles.
 * Voir la note sur `lg:sr-only` dans `Etiquettes`.
 */
function ListeEtiquettes() {
  return (
    <ul className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:sr-only">
      {ETIQUETTES.map((e) => (
        <li
          key={e.texte}
          className="inline-flex items-start gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-snug text-[var(--marine)]"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" />
          {e.texte}
        </li>
      ))}
    </ul>
  );
}
