import {
  IconAlertTriangle,
  IconEye,
  IconPuzzle,
} from "@/components/icons";

/**
 * Troisième pilier de la landing : l'extension de détection.
 * Présente la protection active (après le test et la formation)
 * et montre un aperçu stylisé de la bannière d'alerte.
 */
const ATOUTS = [
  {
    cle: "temps-reel",
    Icone: IconEye,
    titre: "Détection en temps réel, dans la boîte mail",
    texte:
      "Chaque message entrant est analysé à l'ouverture. Aucun tableau de bord à consulter, aucune alerte à aller chercher : la vérification se fait là où le collaborateur travaille.",
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
      "Pas de liste d'expéditeurs à tenir à jour ni de règles à écrire. L'extension repère seule l'usurpation d'identité, dès l'installation.",
  },
];

/** Signaux affichés dans l'aperçu de la bannière. */
const SIGNAUX = [
  "Domaine grand public",
  "Demande de virement",
  "Urgence inhabituelle",
];

export function ProtectionExtension() {
  return (
    <section
      id="protection"
      className="relative isolate overflow-hidden border-t border-border px-6 py-20 md:py-24 lg:px-8"
    >
      {/* Halo discret : cette section est le point culminant du récit */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="top-glow absolute inset-x-0 top-0 h-[420px]" />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="grid gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
          {/* Colonne texte */}
          <div>
            <p>
              <span className="eyebrow">
                Troisième pilier · protection active
              </span>
            </p>

            <h2 className="mt-5 max-w-md text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
              La protection ne s&apos;arrête pas après la formation
            </h2>

            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted">
              Une équipe formée reste une équipe humaine : un jour de rush, un
              message bien imité, et la vigilance cède. L&apos;extension
              Safentreprise prend le relais et analyse les emails en continu.
              Quand un expéditeur usurpe l&apos;identité d&apos;un dirigeant,
              elle le dit — au bon moment, à la bonne personne.
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

          {/* Colonne visuelle : aperçu de la bannière */}
          <ApercuBanniere />
        </div>
      </div>
    </section>
  );
}

/**
 * Reproduction stylisée d'un message frauduleux tel que l'employé le voit,
 * coiffé de la bannière d'alerte injectée par l'extension.
 * Les commandes affichées sont décoratives (aucune interaction réelle).
 */
function ApercuBanniere() {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[12px] border border-border-strong bg-surface shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
        {/* Barre du client de messagerie */}
        <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-2/70 px-4 py-2.5">
          <span className="eyebrow">Boîte de réception</span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-accent-text">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
            Extension active
          </span>
        </div>

        {/* Bannière d'alerte */}
        <div className="border-b border-danger/25 bg-danger-soft px-4 py-4 md:px-5">
          <div className="flex gap-3">
            <IconAlertTriangle className="mt-0.5 shrink-0 text-danger" />

            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-danger">
                Expéditeur potentiellement usurpé · Risque élevé
              </p>

              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                Le nom affiché{" "}
                <span className="text-foreground">« Jean Dupont »</span> est
                celui de votre dirigeant, mais ce message provient d&apos;une
                adresse personnelle extérieure à l&apos;entreprise.
              </p>

              <ul className="mt-3.5 flex flex-wrap gap-2">
                {SIGNAUX.map((signal) => (
                  <li
                    key={signal}
                    className="rounded-[5px] border border-danger/25 px-2 py-1 text-[11px] text-danger"
                  >
                    {signal}
                  </li>
                ))}
              </ul>

              {/* Commandes décoratives — volontairement non cliquables */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 items-center rounded-lg bg-danger/90 px-3 text-[12.5px] font-medium text-white">
                  Signaler ce message
                </span>
                <span className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[12.5px] text-muted">
                  Ignorer
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Message frauduleux */}
        <div className="px-5 py-6 md:px-6">
          <dl className="space-y-2.5 border-b border-border pb-5 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-faint">De</dt>
              <dd className="min-w-0">
                <span className="text-foreground">Jean Dupont</span>{" "}
                <span className="font-mono text-[12px] text-danger">
                  &lt;j.dupont2024@gmail.com&gt;
                </span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-faint">Objet</dt>
              <dd className="font-medium text-foreground">
                Virement urgent — confidentiel
              </dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3.5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Sophie, je suis en déplacement et je ne peux pas être joint.
              Merci de régler ce virement de{" "}
              <span className="text-foreground">47 800 €</span> aujourd&apos;hui,
              sans passer par la validation habituelle.
            </p>
            <p className="text-foreground">Jean</p>
          </div>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-[12.5px] text-faint">
        Aperçu de la bannière affichée par l&apos;extension, au-dessus du
        message suspect.
      </figcaption>
    </figure>
  );
}
