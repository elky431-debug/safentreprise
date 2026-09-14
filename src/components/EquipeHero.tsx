import Link from "next/link";

/**
 * Le bloc « Notre équipe ».
 *
 * Trois visages qui se chevauchent, un titre, et le lien vers le diagnostic.
 * L'intention est de mettre un visage humain en face d'un produit qui parle de
 * fraude — quelqu'un répond, ce n'est pas un automate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ CE BLOC NE PORTE PAS DE BOUTON « DEMANDER UNE DÉMO », ET C'EST VOULU.
 *
 *   Le hero en affiche déjà un 150 px plus haut, et la barre du haut un
 *   troisième. Trois fois la même action dans un seul écran ne convertit pas
 *   mieux : elle dit au visiteur qu'on insiste. Le bloc garde son rôle —
 *   rassurer sur le fait qu'un humain répond — et laisse l'action au bouton
 *   qui la porte déjà. Le lien vers le diagnostic reste : c'est une AUTRE
 *   proposition, pas la même répétée.
 *
 * ⚠ LES PHOTOS SONT DÉCORATIVES, ET C'EST DÉLIBÉRÉ.
 *
 *   `aria-hidden` sur le groupe : un lecteur d'écran annoncerait sinon trois
 *   images sans information, juste avant le texte qui dit tout. Le sens est
 *   porté par « Notre équipe répond à toutes vos questions », qui est du
 *   texte. Aucun nom n'est affiché — donc aucun nom n'est inventé nulle part
 *   dans ce fichier.
 *
 * ⚠ LE CERCLE « + » N'EST PAS UN BOUTON.
 *   Chez Mailinblack il n'ouvre rien non plus. C'est une convention visuelle
 *   qui dit « et d'autres » — lui donner l'apparence d'un bouton sans action
 *   serait un piège à clic. D'où un `span`, pas un `button`.
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

/**
 * ⚠ DEUX ALIGNEMENTS, UNE SEULE MISE EN PAGE. Le bloc vivait centré sous un
 *   hero pleine largeur ; il vit maintenant dans la colonne de gauche d'un hero
 *   en deux colonnes, où tout le reste est aligné à gauche. Un bloc centré au
 *   milieu d'une colonne alignée à gauche se voit immédiatement.
 */
export function EquipeHero({
  className = "",
  aligne = "centre",
}: {
  className?: string;
  aligne?: "centre" | "gauche";
}) {
  const gauche = aligne === "gauche";

  return (
    <div
      className={`flex flex-col ${gauche ? "items-start text-left" : "items-center"} ${className}`}
    >
      {/* ⚠ LE CHEVAUCHEMENT PASSE PAR UNE MARGE NÉGATIVE, PAS PAR `position`.
          Le groupe reste ainsi un flux normal : il se centre tout seul et sa
          largeur suit le nombre de membres, sans calcul. */}
      <div className="flex items-center" aria-hidden>
        {EQUIPE.map((membre, i) => (
          <span
            key={membre.cle}
            className={`inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-background sm:h-14 sm:w-14 ${
              i > 0 ? "-ml-3 sm:-ml-4" : ""
            }`}
            style={{ background: membre.fond }}
          >
            {/* ⚠ `<picture>` ET PAS `next/image` : les pastilles font 56 px et
                les fichiers 180 px — il n'y a rien à redimensionner à la
                volée. Le navigateur prend l'AVIF s'il sait le lire (3,3 Ko),
                le WebP sinon (3,1 Ko), le JPEG en dernier (4,7 Ko). Une seule
                des trois part sur le réseau. */}
            <picture>
              <source srcSet={`${membre.fichier}.avif`} type="image/avif" />
              <source srcSet={`${membre.fichier}.webp`} type="image/webp" />
              <img
                src={`${membre.fichier}.jpg`}
                alt=""
                width={56}
                height={56}
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

        <span className="-ml-3 inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-foreground text-[18px] leading-none text-background sm:-ml-4 sm:h-14 sm:w-14">
          +
        </span>
      </div>

      {/* ⚠ DEUX LIGNES QUAND LE BLOC EST CENTRÉ, UNE SEULE QUAND IL EST À
          GAUCHE. Centré, la coupure équilibre les deux lignes ; aligné à
          gauche dans une colonne étroite, elle produit un ressaut inutile. */}
      {gauche ? (
        <p className="mt-4 text-[17px] leading-snug text-foreground">
          <span className="font-semibold">Notre équipe</span> répond à toutes vos
          questions.
        </p>
      ) : (
        <>
          <p className="mt-5 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-[21px]">
            Notre équipe
          </p>
          <p className="mt-1 text-[16px] leading-snug text-muted sm:text-[17px]">
            répond à toutes vos questions.
          </p>
        </>
      )}

      <Link
        href="/diagnostic"
        className={`${gauche ? "mt-3" : "mt-5"} text-[13.5px] text-muted underline underline-offset-4 transition-colors hover:text-foreground`}
      >
        Réaliser votre diagnostic gratuit
      </Link>
    </div>
  );
}
