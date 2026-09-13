import Link from "next/link";
import { buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * Le bloc « Notre équipe ».
 *
 * Trois visages qui se chevauchent, un titre, l'action principale, et le lien
 * vers le diagnostic. L'intention est de mettre un visage humain en face d'un
 * produit qui parle de fraude — quelqu'un répond, ce n'est pas un automate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ LES PHOTOS SONT DÉCORATIVES, ET C'EST DÉLIBÉRÉ.
 *
 *   `aria-hidden` sur le groupe : un lecteur d'écran annoncerait sinon trois
 *   images sans information, juste avant le texte qui dit tout. Le sens est
 *   porté par « Notre équipe répond à toutes vos questions », qui est du
 *   texte.
 *
 * ⚠ LE CERCLE « + » N'EST PAS UN BOUTON.
 *   Chez Mailinblack il n'ouvre rien non plus. C'est une convention visuelle
 *   qui dit « et d'autres » — lui donner l'apparence d'un bouton sans action
 *   serait un piège à clic. D'où un `span`, pas un `button`.
 *
 * ⚠ EN ATTENDANT LES VRAIES PHOTOS, on affiche des pastilles à initiale, dans
 *   les teintes de la charte. Pas de silhouette générique ni d'avatar
 *   d'emprunt : un visage d'inconnu sur une page qui promet de la confiance
 *   coûterait plus qu'il ne rapporte. Voir `EQUIPE` ci-dessous pour brancher
 *   les fichiers.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Les membres présentés.
 *
 * ⚠ POUR BRANCHER LES VRAIES PHOTOS : déposer les fichiers dans
 *   `public/marque/equipe/` en 320×320, carrés, cadrage serré sur le visage,
 *   puis renseigner `photo` ici — par exemple `photo: "/marque/equipe/yacine.jpg"`.
 *   Le composant bascule seul : tant que `photo` est absent, la pastille à
 *   initiale reste.
 */
const EQUIPE: { initiale: string; nom: string; photo?: string; fond: string }[] = [
  { initiale: "Y", nom: "Yacine", fond: "var(--marine)" },
  { initiale: "L", nom: "Léa", fond: "#2f4f7f" },
  { initiale: "M", nom: "Marc", fond: "#4a6591" },
];

export function EquipeHero({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* ⚠ LE CHEVAUCHEMENT PASSE PAR UNE MARGE NÉGATIVE, PAS PAR `position`.
          Le groupe reste ainsi un flux normal : il se centre tout seul et sa
          largeur suit le nombre de membres, sans calcul. */}
      <div className="flex items-center" aria-hidden>
        {EQUIPE.map((membre, i) => (
          <span
            key={membre.nom}
            className={`inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[15px] font-semibold text-white sm:h-14 sm:w-14 sm:text-[17px] ${
              i > 0 ? "-ml-3 sm:-ml-4" : ""
            }`}
            style={membre.photo ? undefined : { background: membre.fond }}
          >
            {membre.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={membre.photo}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            ) : (
              membre.initiale
            )}
          </span>
        ))}

        <span className="-ml-3 inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-foreground text-[18px] leading-none text-background sm:-ml-4 sm:h-14 sm:w-14">
          +
        </span>
      </div>

      {/* ⚠ DEUX LIGNES, PAS UNE. « Notre équipe » porte le poids, la seconde
          ligne l'allège. Sur téléphone elles restent lisibles parce que
          chacune est courte — c'est ce découpage qui évite le repli. */}
      <p className="mt-5 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-[21px]">
        Notre équipe
      </p>
      <p className="mt-1 text-[16px] leading-snug text-muted sm:text-[17px]">
        répond à toutes vos questions.
      </p>

      <Link href="/demo" className={`${buttonPrimaryLg} mt-6`}>
        Demander une démo
        <IconArrowRight />
      </Link>

      <Link
        href="/diagnostic"
        className="mt-4 text-[13.5px] text-muted underline underline-offset-4 transition-colors hover:text-foreground"
      >
        Réaliser votre diagnostic gratuit
      </Link>
    </div>
  );
}
