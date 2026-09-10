import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LandingHero } from "@/components/LandingHero";
import { BandeMotifs } from "@/components/BandeMotifs";
import { BlocContact, CoordonneesContact } from "@/components/Contact";
import { Triptyque } from "@/components/Triptyque";
import { TroisFraudes } from "@/components/TroisFraudes";
import { ProtectionContinue } from "@/components/ProtectionContinue";
import { FraudEmailExample } from "@/components/FraudEmailExample";
import { SecteursOnglets } from "@/components/SecteursOnglets";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { buttonPrimary, buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

const STEPS = [
  { n: "01", title: "Importez vos collaborateurs" },
  { n: "02", title: "Déclenchez une simulation" },
  { n: "03", title: "Formez ceux qui ont cliqué" },
];


const METRICS = [
  "Taux de clic",
  "Taux de signalement",
  "Formation suivie",
  "Progression",
];

/** Page d'accueil publique. */
export default async function HomePage() {
  // Ne pas faire planter la landing si Supabase n'est pas configuré (Netlify).
  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  } catch {
    user = null;
  }

  return (
    // `theme-clair` est resté sur la vitrine par cohérence de lecture, mais
    // il ne bascule plus rien : depuis l'alignement sur la charte, `:root`
    // porte déjà le blanc. Il ne sert plus qu'aux îlots clairs des bandes
    // marine, et à distinguer la police de la vitrine de celle de l'app.
    <div className="theme-clair flex min-h-screen flex-col bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6 lg:px-8">
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
              <a
                href="#protection"
                className="text-[13.5px] text-muted transition-colors hover:text-foreground"
              >
                Protection
              </a>
              <Link
                href="/comparatif"
                className="text-[13.5px] text-muted transition-colors hover:text-foreground"
              >
                Comparatif
              </Link>
              <Link
                href="/tarifs"
                className="text-[13.5px] text-muted transition-colors hover:text-foreground"
              >
                Tarifs
              </Link>
            </nav>
          </div>

          {/* « Accéder à mon espace » a quitté le hero : il ne vit plus qu'ici,
              en lien discret à gauche de l'action principale. */}
          <div className="flex items-center gap-3">
            <Link
              href={user ? "/dashboard" : "/login"}
              // ⚠ `lg` ET NON `sm` : à 768 px, la navigation complète, ce lien
              //   et le bouton dépassaient ensemble de la barre et faisaient
              //   défiler la page horizontalement.
              className="hidden h-9 items-center text-[13.5px] text-muted transition-colors hover:text-foreground lg:inline-flex"
            >
              Accéder à mon espace
            </Link>
            <Link
              href={user ? "/dashboard" : "/demo"}
              className={buttonPrimary}
            >
              {user ? "Tableau de bord" : "Demander une démo"}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <LandingHero />

        {/* ⚠ SEULE EXCEPTION À L'ALTERNANCE, ET ELLE EST VOULUE. La bande est
            marine et « Trois fraudes » l'est aussi : les deux se touchent donc,
            au lieu d'alterner. Elles se lisent comme un seul bloc marine dont
            la bande est l'en-tête — ce qui est l'effet recherché. Un filet
            très pâle marque la jointure pour que ce ne soit pas un aplat. */}
        <BandeMotifs />

        {/* ⚠ L'ALTERNANCE EST PORTÉE PAR LES SECTIONS, DANS CET ORDRE. Blanc,
            marine, blanc, marine, jusqu'en bas. Insérer ou retirer une section
            sans reprendre `sur-marine` sur ses voisines casse le rythme et
            colle deux bandes marine l'une contre l'autre. */}
        <TroisFraudes />

        {/* Positionnement : tester → former → protéger */}
        <Triptyque />

        {/* Méthode */}
        <section
          id="methode"
          className="sur-marine px-6 py-20 md:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-[1400px]">
            <p className="text-center">
              <span className="eyebrow">Premier temps · la simulation</span>
            </p>

            <h2 className="mx-auto mt-5 max-w-lg text-center text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold leading-tight text-foreground">
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

        {/* Scénarios par secteur. La section porte encore l'ancre #scenarios :
            elle est visée par la navigation et par des liens déjà diffusés. */}
        <SecteursOnglets />

        {/* ⚠ CONSERVÉ SOUS LES ONGLETS, ET C'EST UNE DÉCISION À CONFIRMER.
            L'aperçu de message frauduleux vivait dans la section remplacée. Le
            supprimer au passage aurait retiré un contenu qui n'était pas visé
            par la refonte ; il reste donc, en dessous. */}
        <section className="border-t border-border px-6 py-16 md:py-20 lg:px-8">
          <div className="mx-auto max-w-[1180px]">
            <FraudEmailExample />
          </div>
        </section>

        {/* Protection active : l'avertissement posé dans le message */}
        <ProtectionContinue />

        {/* Indicateurs */}
        <section className="border-t border-border px-6 py-20 md:py-24 lg:px-8">
          <div className="mx-auto max-w-[1400px]">
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
        <section className="sur-marine px-6 py-24 md:py-28 lg:px-8">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-[clamp(1.7rem,3.2vw,2.5rem)] font-extrabold leading-tight text-foreground">
              Testez, formez, protégez vos équipes
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-muted">
              Trente minutes suffisent pour voir le dispositif complet sur votre
              organisation. Nous vous accompagnons ensuite à la mise en place.
            </p>

            <div className="mt-9 flex flex-col items-center gap-4">
              <Link href="/demo" className={buttonPrimaryLg}>
                Demander une démo
                <IconArrowRight />
              </Link>

              {/* Accès self-service conservé, volontairement discret */}
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="text-[13px] text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {user ? "Ouvrir mon tableau de bord" : "Créer un compte"}
              </Link>
            </div>
          </div>
        </section>

        {/* Dernière section de la page : blanche, l'appel à l'action qui la
            précède étant marine. L'alternance tient jusqu'au pied de page. */}
        <BlocContact />
      </main>

      <footer className="border-t border-border px-6 py-10 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
            <Logo />
            <CoordonneesContact />
          </div>

          <div className="mt-9 border-t border-border pt-6">
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}
