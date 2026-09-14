import Link from "next/link";
import { buttonSecondaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * Le bloc « Notre équipe », en carte, sous les deux colonnes du hero.
 *
 * Trois visages qui se chevauchent, une phrase, une porte de sortie douce.
 * L'intention est de mettre un visage humain en face d'un produit qui parle de
 * fraude — quelqu'un répond, ce n'est pas un automate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ IL FERME LE HERO, IL NE LE DÉSÉQUILIBRE PLUS. Il a vécu dans la colonne de
 *   gauche, qui devenait bien plus longue que la droite : la page penchait. En
 *   pleine largeur sous les deux colonnes, il sert de point final — et l'ancien
 *   mode d'alignement à gauche a disparu avec cet usage plutôt que de rester en
 *   code mort.
 *
 * ⚠ LE CONTENU EST BORNÉ À 560 px DANS UNE CARTE DE 1200. Laisser le texte
 *   s'étaler sur toute la largeur donnerait une ligne de 140 caractères,
 *   illisible, et un bloc qui paraît vide parce qu'il est plat. Une colonne
 *   étroite au centre d'une carte large, c'est ce qui fait respirer.
 *
 * ⚠ L'ANNEAU DES PASTILLES SUIT LE FOND DE LA CARTE, PAS LA PAGE. Il était en
 *   `border-background` (blanc), calé sur le fond de la vitrine ; sur la carte
 *   teintée il dessinerait un liseré blanc autour de chaque visage. Changer le
 *   fond de la carte oblige à repasser ici.
 *
 * ⚠ LA COULEUR DE L'ANNEAU EST UN STYLE EN LIGNE, ET AUCUNE UTILITAIRE
 *   TAILWIND NE PEUT LA POSER. `globals.css` porte une règle `border-color`
 *   sur `*` qui n'est dans AUCUNE couche : elle bat toutes les utilitaires de
 *   couleur de bordure, quelle que soit leur spécificité. C'est écrit à côté de
 *   cette règle, et la bande de motifs de la vitrine a dû faire le même détour.
 *
 *   Le symptôme est muet : la bordure prend la valeur de `--border`,
 *   rgba(16, 20, 26, 0.1). Sur le blanc de la page elle passait pour un liseré
 *   clair ; sur la carte teintée elle devient un cerne sombre autour de chaque
 *   visage. Rien dans la console ne le signale.
 *
 * ⚠ ET NE PAS ÉCRIRE DE CLASSE D'EXEMPLE DANS CE COMMENTAIRE. Tailwind scanne
 *   le FICHIER, commentaires compris : une pseudo-classe illustrative avec des
 *   points de suspension entre crochets lui a fait produire une déclaration
 *   invalide, et la feuille de style entière a cessé de compiler. Les exemples
 *   se décrivent en mots, ils ne s'écrivent pas.
 *
 * ⚠ CE BLOC NE PORTE PAS DE « DEMANDER UNE DÉMO ». Le hero en affiche déjà un,
 *   et la barre du haut un troisième. Le diagnostic, lui, est une AUTRE
 *   proposition — d'où un bouton secondaire, qui termine la carte sans répéter
 *   l'action principale.
 *
 * ⚠ LES PHOTOS SONT DÉCORATIVES. `aria-hidden` sur le groupe : un lecteur
 *   d'écran annoncerait sinon trois images sans information, juste avant le
 *   texte qui dit tout. Aucun nom n'est affiché — donc aucun nom n'est inventé
 *   nulle part dans ce fichier.
 *
 * ⚠ LE CERCLE « + » N'EST PAS UN BOUTON. C'est une convention visuelle qui dit
 *   « et d'autres » ; lui donner l'apparence d'un bouton sans action serait un
 *   piège à clic. D'où un `span`.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Les portraits, découpés par `outils/equipe.mjs`.
 *
 * ⚠ `fond` SERT ENCORE, même avec les photos en place : c'est la couleur du
 *   cercle tant que l'image n'est pas arrivée, et celle qui reste si elle
 *   n'arrive jamais. Sans elle, un blanc sur blanc ferait disparaître le
 *   groupe le temps du chargement.
 */
const EQUIPE: { cle: string; fichier: string; fond: string }[] = [
  { cle: "membre-1", fichier: "/marque/equipe/membre-1", fond: "var(--marine)" },
  { cle: "membre-2", fichier: "/marque/equipe/membre-2", fond: "#2f4f7f" },
  { cle: "membre-3", fichier: "/marque/equipe/membre-3", fond: "#4a6591" },
];

export function EquipeHero({ className = "" }: { className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-border bg-surface-2 px-6 py-11 shadow-[0_18px_44px_-30px_rgba(16,20,26,0.28)] sm:py-14 ${className}`}
    >
      {/* ⚠ UN VOILE, PAS UNE COULEUR. Un dégradé très pâle du marine vers rien,
          posé derrière les visages : il donne un centre à une carte large sans
          introduire de teinte vive. À 6 % d'opacité, il se devine et ne se voit
          pas — c'est exactement ce qu'on veut d'un fond. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(15,36,68,0.06),transparent_70%)]"
      />

      <div className="relative mx-auto flex max-w-[560px] flex-col items-center text-center">
        {/* ⚠ LE CHEVAUCHEMENT PASSE PAR UNE MARGE NÉGATIVE, PAS PAR `position`.
            Le groupe reste ainsi un flux normal : il se centre tout seul et sa
            largeur suit le nombre de membres, sans calcul. */}
        <div className="flex items-center" aria-hidden>
          {EQUIPE.map((membre, i) => (
            <span
              key={membre.cle}
              className={`inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-[3px] shadow-[0_4px_12px_-6px_rgba(16,20,26,0.35)] sm:h-16 sm:w-16 ${
                i > 0 ? "-ml-4 sm:-ml-5" : ""
              }`}
              style={{ background: membre.fond, borderColor: "var(--surface-2)" }}
            >
              {/* ⚠ `<picture>` ET PAS `next/image` : les pastilles font 64 px et
                  les fichiers 180 px — il n'y a rien à redimensionner à la
                  volée. Une seule des trois déclinaisons part sur le réseau. */}
              <picture>
                <source srcSet={`${membre.fichier}.avif`} type="image/avif" />
                <source srcSet={`${membre.fichier}.webp`} type="image/webp" />
                <img
                  src={`${membre.fichier}.jpg`}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  /* ⚠ LE `scale-[1.04]` N'EST PAS DÉCORATIF. Le cercle est
                     découpé par `overflow-hidden` : son bord est lissé, et
                     l'image lissée au même endroit laissait passer un liseré
                     d'un pixel de la couleur de repli — un anneau bleu bien
                     visible autour de chaque visage. Déborder de 4 % met le bord
                     de l'image hors du bord du cercle, et l'anneau disparaît. */
                  className="h-full w-full scale-[1.04] object-cover"
                />
              </picture>
            </span>
          ))}

          <span
            style={{ borderColor: "var(--surface-2)" }}
            className="-ml-4 inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] bg-foreground text-[19px] leading-none text-background shadow-[0_4px_12px_-6px_rgba(16,20,26,0.35)] sm:-ml-5 sm:h-16 sm:w-16"
          >
            +
          </span>
        </div>

        <p className="eyebrow mt-7">Notre équipe</p>

        {/* La serif de la charte, réservée aux titres. Elle donne à la carte le
            poids d'une section plutôt que d'un encart. */}
        <h2 className="titre-page mt-3 text-[clamp(1.25rem,2.2vw,1.65rem)] leading-snug text-balance text-foreground">
          Une question sur votre exposition&nbsp;? Nous y répondons.
        </h2>

        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          Vous pouvez aussi commencer seul&nbsp;: huit questions, un résultat
          immédiat, sans inscription.
        </p>

        <Link href="/diagnostic" className={`${buttonSecondaryLg} mt-7`}>
          Réaliser votre diagnostic gratuit
          <IconArrowRight />
        </Link>
      </div>
    </section>
  );
}
