/**
 * Le logo, et rien d'autre.
 *
 * Tous les emplacements du produit — en-tête de la vitrine, pied de page,
 * barre du tableau de bord, écrans d'authentification, pages légales — passent
 * par ce fichier. Dix-neuf points d'appel : changer la marque se fait ici, une
 * fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ IL EXISTE DEUX VARIANTES, ET LE NAVIGATEUR N'EN TÉLÉCHARGE QU'UNE.
 *
 *   Le bouclier a un côté bleu et un côté NOIR. Mesuré sur le dessin, ce côté
 *   sombre vaut #141922, soit 1,14 : 1 de contraste sur le marine des bandes
 *   (#0f2444) — en dessous de 1,5 : 1, l'œil ne distingue plus rien. Comme
 *   cette masse fait 43 % du bouclier, près de la moitié du logo disparaît sur
 *   une bande marine. D'où une variante monochrome blanche.
 *
 *   La bascule est pilotée par le CSS seul (voir `.logo-marque` dans
 *   globals.css) : pas de JavaScript, donc juste dès le rendu serveur, et
 *   aucun clignotement.
 *
 * ⚠ EN FOND CSS, PAS EN `<img>`, ET C'EST LA RAISON D'ÊTRE DE CE CHOIX.
 *
 *   Rendre les deux variantes en `<img>` et en cacher une avec `display:none`
 *   marche, mais le navigateur TÉLÉCHARGE QUAND MÊME les deux : mesuré à
 *   3 234 octets par page, contre 1 080 pour l'ancien logo unique. On aurait
 *   alourdi la page en croyant l'alléger.
 *
 *   Une image de fond sur un élément non affiché n'est jamais demandée. Une
 *   seule variante part donc sur le réseau — celle qui sera visible.
 *
 * ⚠ LE NOM ACCESSIBLE NE VIENT PLUS DE `alt` MAIS DE `role` + `aria-label`.
 *   Un fond CSS n'a pas de texte alternatif. Sans ces deux attributs, le logo
 *   serait muet pour un lecteur d'écran.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Props = {
  compact?: boolean;
  className?: string;
};

/**
 * Le bouclier.
 *
 * ⚠ DEUX JEUX DE FICHIERS SELON LA TAILLE, parce qu'un fond CSS ne sait pas
 *   choisir sa source comme le fait `srcset`. Sous 48 px on sert le 64 — soit
 *   2,3× la taille d'affichage, net jusqu'aux écrans à densité double. Au-delà
 *   on sert le 256. Servir le 256 partout coûterait 6 Ko là où 1,7 suffit.
 */
function Bouclier({
  size,
  nom,
  className = "",
}: {
  size: number;
  /** Nom accessible. Vide = décoratif, le texte voisin porte déjà le nom. */
  nom: string;
  className?: string;
}) {
  const echelle = size <= 48 ? "petit" : "grand";

  return (
    <span
      className={`logo-marque logo-marque--${echelle} shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role={nom ? "img" : undefined}
      aria-label={nom || undefined}
      aria-hidden={nom ? undefined : true}
    />
  );
}

/**
 * Emblème seul, en grand — pages d'authentification, écrans vides.
 */
export function LogoEmblem({
  size = 96,
  className = "",
}: {
  size?: number;
  className?: string;
  /** Conservé pour compatibilité d'appel (anciens SVG multi-instances). */
  id?: string;
}) {
  return <Bouclier size={size} nom="Safentreprise" className={className} />;
}

/**
 * Petite marque, accolée à un texte qui porte déjà le nom.
 */
export function LogoMark({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return <Bouclier size={size} nom="" className={className} />;
}

/**
 * Logo courant de l'application : bouclier + nom, sauf en mode compact.
 *
 * Le nom reste du TEXTE, pas une image. Il hérite ainsi de la couleur du
 * contexte — donc il est déjà correct sur marine sans rien faire — il reste
 * sélectionnable, lisible par un lecteur d'écran, et net à toute densité.
 */
export function Logo({ compact = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center">
        <LogoMark size={28} />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          Safentreprise
        </span>
      )}
    </span>
  );
}
