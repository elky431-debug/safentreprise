import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LandingHero } from "@/components/LandingHero";
import { FraudEmailExample } from "@/components/FraudEmailExample";
import { Logo } from "@/components/Logo";
import { buttonPrimary, buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

const STEPS = [
  { n: "01", title: "Importez vos collaborateurs" },
  { n: "02", title: "Déclenchez une simulation" },
  { n: "03", title: "Formez ceux qui ont cliqué" },
];

const SCENARIOS = [
  {
    title: "Arnaque au président",
    text: "Un virement urgent et confidentiel, demandé au nom de la direction.",
  },
  {
    title: "Faux fournisseur",
    text: "Un changement de coordonnées bancaires sur un compte connu.",
  },
];

const METRICS = [
  "Taux de clic",
  "Taux de signalement",
  "Formation suivie",
  "Progression",
];

/** Page d'accueil publique. */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="Safentreprise — accueil">
              <Logo />
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <a
                href="#methode"
                className="text-[13.5px] text-muted transition-colors hover:text-foreground"
              >
                Fonctionnement
              </a>
              <a
                href="#scenarios"
                className="text-[13.5px] text-muted transition-colors hover:text-foreground"
              >
                Scénarios
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            {user ? (
              <Link href="/dashboard" className={buttonPrimary}>
                Tableau de bord
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden h-9 items-center px-3 text-[13.5px] text-muted transition-colors hover:text-foreground sm:inline-flex"
                >
                  Connexion
                </Link>
                <Link href="/signup" className={buttonPrimary}>
                  Commencer
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <LandingHero isLoggedIn={Boolean(user)} />

        {/* Méthode */}
        <section
          id="methode"
          className="border-t border-border px-6 py-20 md:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="mx-auto max-w-lg text-center text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
              Trois étapes, en boucle
            </h2>

            <ol className="mt-14 grid gap-px overflow-hidden rounded-[10px] border border-border bg-border md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="bg-surface px-6 py-7">
                  <span className="font-mono text-[12px] text-accent-text">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-[15.5px] font-bold text-foreground">
                    {step.title}
                  </h3>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Scénarios */}
        <section
          id="scenarios"
          className="border-t border-border px-6 py-20 md:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="mx-auto max-w-lg text-center text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
              Les deux fraudes qui coûtent le plus
            </h2>

            <div className="mt-14 grid gap-6 md:grid-cols-2">
              {SCENARIOS.map((scenario) => (
                <article
                  key={scenario.title}
                  className="rounded-[10px] border border-border bg-surface px-6 py-7"
                >
                  <h3 className="text-[16.5px] font-bold text-foreground">
                    {scenario.title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
                    {scenario.text}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-6">
              <FraudEmailExample />
            </div>
          </div>
        </section>

        {/* Indicateurs */}
        <section className="border-t border-border px-6 py-20 md:py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="mx-auto max-w-lg text-center text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
              Ce que vous mesurez
            </h2>

            <ul className="mt-14 grid gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {METRICS.map((metric) => (
                <li
                  key={metric}
                  className="bg-surface px-5 py-6 text-[14px] font-semibold text-foreground"
                >
                  {metric}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Appel à l'action */}
        <section className="border-t border-border px-6 py-24 md:py-28 lg:px-8">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-[clamp(1.7rem,3.2vw,2.5rem)] font-extrabold leading-tight text-foreground">
              Lancez votre première simulation
            </h2>
            <Link
              href={user ? "/dashboard" : "/signup"}
              className={`${buttonPrimaryLg} mt-8`}
            >
              {user ? "Ouvrir mon tableau de bord" : "Créer mon compte"}
              <IconArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Logo />
          <p className="text-[12.5px] text-faint">Sensibilisation à la fraude</p>
        </div>
      </footer>
    </div>
  );
}
