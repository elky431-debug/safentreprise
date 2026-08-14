import { IconTarget, IconFormation, IconShieldCheck } from "@/components/icons";

/**
 * Triptyque de positionnement : Safentreprise ne se limite pas au test,
 * il couvre les trois temps de la protection contre la fraude ciblée.
 * Le troisième pilier (l'extension) est mis en avant : c'est le point culminant.
 */
const PILIERS = [
  {
    cle: "tester",
    titre: "Tester",
    Icone: IconTarget,
    texte:
      "Une simulation réaliste, envoyée à vos équipes. Vous découvrez qui clique, qui signale et qui ne réagit pas.",
  },
  {
    cle: "former",
    titre: "Former",
    Icone: IconFormation,
    texte:
      "Chaque collaborateur piégé reçoit une formation courte au moment exact où la leçon porte le plus.",
  },
  {
    cle: "proteger",
    titre: "Protéger",
    Icone: IconShieldCheck,
    accent: true,
    texte:
      "L'extension veille en continu dans la boîte mail et prévient avant le virement, même des mois après la formation.",
  },
];

export function Triptyque() {
  return (
    <section className="border-t border-border px-6 py-20 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-center">
          <span className="eyebrow">La méthode Safentreprise</span>
        </p>

        <h2 className="mx-auto mt-5 max-w-2xl text-center text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
          Tester, former,{" "}
          <span className="text-accent-text">protéger&nbsp;durablement</span>
        </h2>

        <p className="mx-auto mt-5 max-w-lg text-center text-[14px] leading-relaxed text-muted">
          Une campagne de test seule ne protège de rien : trois mois plus tard,
          la vigilance retombe. Les trois temps se complètent.
        </p>

        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {PILIERS.map((pilier, index) => (
            <li
              key={pilier.cle}
              className={`relative rounded-[10px] border bg-surface px-6 py-7 ${
                pilier.accent
                  ? "border-accent-line bg-accent-soft/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    pilier.accent
                      ? "bg-accent-soft text-accent-text"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  <pilier.Icone />
                </span>
                <span className="font-mono text-[12px] text-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <h3
                className={`mt-4 text-[16.5px] font-bold ${
                  pilier.accent ? "text-accent-text" : "text-foreground"
                }`}
              >
                {pilier.titre}
              </h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
                {pilier.texte}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
