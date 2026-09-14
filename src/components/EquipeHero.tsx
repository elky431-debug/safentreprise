import Link from "next/link";
import { buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * Le bloc « Notre équipe », en petite carte, sous les deux colonnes du hero.
 *
 * Trois visages qui se chevauchent, une phrase, un bouton. L'intention est de
 * mettre un visage humain en face d'un produit qui parle de fraude — quelqu'un
 * répond, ce n'est pas un automate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ IL DOIT RESTER PETIT. Il a d'abord été une carte pleine largeur de
 *   1200 × 438 px : elle prenait la place d'une section alors qu'elle n'en est
 *   pas une, et elle écrasait le hero qu'elle était censée fermer. Ramenée à
 *   400 px de large pour environ 160 de haut, elle se lit comme ce qu'elle est
 *   — une signature en bas de hero, pas un argument de plus.
 *
 *   Les choix qui la tiennent petite se tiennent ENSEMBLE : pastilles à 36 px
 *   et pas 64 ; une phrase sur UNE SEULE LIGNE et pas un titre suivi d'une
 *   ligne de contexte ; un rembourrage vertical de 20 px et pas de 56.
 *   Rajouter l'un rouvre la porte aux autres.
 *
 *   Seule exception, et elle est voulue : le BOUTON a grossi pendant que le
 *   reste rétrécissait. C'est la seule action de la carte — elle doit se voir.
 *
 * ⚠ IL FERME LE HERO, IL NE LE DÉSÉQUILIBRE PLUS. Il a vécu dans la colonne de
 *   gauche, qui devenait bien plus longue que la droite : la page penchait.
 *
 * ⚠ LA COULEUR DE L'ANNEAU DES PASTILLES EST UN STYLE EN LIGNE, ET AUCUNE
 *   UTILITAIRE TAILWIND NE PEUT LA POSER. `globals.css` porte une règle
 *   `border-color` sur `*` qui n'est dans AUCUNE couche : elle bat toutes les
 *   utilitaires de couleur de bordure, quelle que soit leur spécificité. C'est
 *   écrit à côté de cette règle, et la bande de motifs de la vitrine a dû faire
 *   le même détour.
 *
 *   Le symptôme est muet : la bordure prend la valeur de `--border`,
 *   rgba(16, 20, 26, 0.1). Sur le blanc de la page elle passe pour un liseré
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
 *   proposition : il a donc droit à un vrai bouton, dans la variante compacte
 *   pour ne pas rivaliser en taille avec l'action principale du hero.
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

/** Couleur de l'anneau : celle du fond de la carte. Voir l'en-tête. */
const ANNEAU = { borderColor: "var(--surface-2)" };

export function EquipeHero({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <section className="flex w-full max-w-[400px] flex-col items-center rounded-2xl border border-border bg-surface-2 px-5 py-5 text-center shadow-[0_10px_28px_-22px_rgba(16,20,26,0.3)]">
        {/* ⚠ LE CHEVAUCHEMENT PASSE PAR UNE MARGE NÉGATIVE, PAS PAR `position`.
            Le groupe reste ainsi un flux normal : il se centre tout seul et sa
            largeur suit le nombre de membres, sans calcul. */}
        <div className="flex items-center" aria-hidden>
          {EQUIPE.map((membre, i) => (
            <span
              key={membre.cle}
              className={`inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 ${
                i > 0 ? "-ml-2.5" : ""
              }`}
              style={{ background: membre.fond, ...ANNEAU }}
            >
              {/* ⚠ `<picture>` ET PAS `next/image` : les pastilles font 36 px et
                  les fichiers 180 px — il n'y a rien à redimensionner à la
                  volée. Une seule des trois déclinaisons part sur le réseau. */}
              <picture>
                <source srcSet={`${membre.fichier}.avif`} type="image/avif" />
                <source srcSet={`${membre.fichier}.webp`} type="image/webp" />
                <img
                  src={`${membre.fichier}.jpg`}
                  alt=""
                  width={36}
                  height={36}
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
            style={ANNEAU}
            className="-ml-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 bg-foreground text-[14px] leading-none text-background"
          >
            +
          </span>
        </div>

        {/* ⚠ UNE SEULE LIGNE, ET C'EST POUR ÇA QUE LE CORPS EST À 14,5 px DANS
            UNE CARTE DE 400. Les 42 caractères tiennent alors dans les 360 px
            utiles ; à 17 px ils passaient sur deux lignes et la carte gagnait
            20 px de haut pour rien. Allonger la phrase la fait replier. */}
        <p className="titre-page mt-3 text-[14.5px] leading-snug text-foreground">
          Notre équipe répond à toutes vos questions.
        </p>

        {/* ⚠ UN BOUTON PLEIN, PAS UN LIEN SOULIGNÉ. C'est la seule action de la
            carte et elle doit se voir ; le lien discret passait inaperçu. La
            variante COMPACTE du bouton principal, pas la grande : le hero porte
            déjà « Demander une démo » en grand, et deux boutons de même taille
            se disputeraient le regard. */}
        <Link href="/diagnostic" className={`${buttonPrimary} mt-4`}>
          Réaliser votre diagnostic gratuit
          <IconArrowRight />
        </Link>
      </section>
    </div>
  );
}
