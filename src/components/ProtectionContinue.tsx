import { IconAlertTriangle, IconEye, IconPuzzle } from "@/components/icons";
import { ComparateurBanniere } from "@/components/ComparateurBanniere";

/**
 * Troisième pilier de la vitrine : la protection continue.
 *
 * ⚠ CE N'EST PAS UNE EXTENSION DE NAVIGATEUR, ET AUCUN TEXTE D'ICI NE DOIT LE
 *   LAISSER CROIRE. L'avertissement est posé dans le message lui-même, par
 *   Microsoft 365 : rien n'est à installer chez l'utilisateur. Cette section
 *   décrivait l'inverse, et contredisait l'argument « Aucune extension à
 *   installer » affiché dans le hero de la même page.
 */
const ATOUTS = [
  {
    cle: "temps-reel",
    Icone: IconEye,
    titre: "Détection en temps réel, dans la boîte mail",
    texte:
      "Chaque message entrant est analysé à l'arrivée. Aucun tableau de bord à consulter, aucune alerte à aller chercher : la vérification se fait là où le collaborateur travaille.",
  },
  {
    cle: "avant-action",
    Icone: IconAlertTriangle,
    titre: "Une bannière prévient avant que l'employé agisse",
    texte:
      "L'avertissement s'affiche en haut du message, avant la lecture et bien avant le virement. C'est le moment où l'alerte change encore quelque chose.",
  },
  {
    cle: "sans-config",
    Icone: IconPuzzle,
    titre: "Fonctionne sans configuration",
    texte:
      "Pas de liste d'expéditeurs à tenir à jour ni de règles à écrire. Safentreprise repère seule l'usurpation d'identité, dès l'activation.",
  },
];

export function ProtectionContinue() {
  return (
    <section
      id="protection"
      className="sur-marine relative isolate overflow-hidden px-6 py-20 md:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
          {/* Colonne texte */}
          <div>
            <p>
              <span className="eyebrow">
                Troisième pilier · protection active
              </span>
            </p>

            <h2 className="mt-5 max-w-md text-[clamp(1.6rem,3vw,2.35rem)] font-semibold leading-tight text-foreground">
              La vigilance ne tient pas toute l&apos;année
            </h2>

            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted">
              Une équipe attentive reste une équipe humaine : un jour de rush, un
              message bien imité, et la vigilance cède. Safentreprise analyse les
              messages qui arrivent dans vos boîtes Microsoft 365 et pose un
              avertissement sur ceux qui portent les signes d&apos;une
              usurpation — au bon moment, à la bonne personne.
            </p>

            <ul className="mt-9 space-y-7">
              {ATOUTS.map((atout) => (
                <li key={atout.cle} className="flex gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                    <atout.Icone />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-foreground">
                      {atout.titre}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                      {atout.texte}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne visuelle : le même message, avec et sans avertissement */}
          <ComparateurBanniere />
        </div>
      </div>
    </section>
  );
}
