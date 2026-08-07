import Link from "next/link";
import { buttonPrimaryLg } from "@/components/ui";
import { AppPreview } from "@/components/AppPreview";
import { IconArrowRight } from "@/components/icons";

type Props = {
  isLoggedIn: boolean;
};

/** Hero de la landing : ciel étoilé, annonce centrée, aperçu de l'application. */
export function LandingHero({ isLoggedIn }: Props) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="starfield" />
        <div className="top-glow absolute inset-x-0 top-0 h-[520px]" />
      </div>

      <div className="mx-auto max-w-5xl px-6 pt-16 text-center md:pt-24">
        <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[12.5px] text-muted backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
          Arnaque au président · faux fournisseur
        </p>

        <h1 className="rise rise-1 mx-auto mt-8 max-w-3xl">
          <span className="block text-[clamp(2.1rem,5vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground">
            Testez vos équipes face à
          </span>
          <span className="font-script mt-1 block text-[clamp(2.8rem,6.8vw,5rem)] leading-[1.1] text-accent-text">
            l&apos;arnaque au président.
          </span>
        </h1>

        <p className="rise rise-2 mx-auto mt-7 max-w-md text-[15px] leading-relaxed text-muted">
          Un faux message de fraude, envoyé à vos collaborateurs. Vous voyez qui
          clique, qui signale, qui ne réagit pas. Puis vous les formez.
        </p>

        <div className="rise rise-3 mt-9 flex justify-center">
          <Link
            href={isLoggedIn ? "/dashboard" : "/signup"}
            className={buttonPrimaryLg}
          >
            {isLoggedIn ? "Ouvrir mon tableau de bord" : "Créer un compte"}
            <IconArrowRight />
          </Link>
        </div>

        <p className="rise rise-3 mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12.5px] text-faint">
          <span>Sans engagement</span>
          <span aria-hidden>·</span>
          <span className="rounded-[5px] border border-border bg-surface px-2 py-1 font-mono text-[11.5px] text-muted">
            import prenom, email, telephone
          </span>
          <span aria-hidden>·</span>
          <span>Résultats nominatifs ou anonymisés</span>
        </p>
      </div>

      <div className="rise rise-3 mx-auto mt-16 max-w-6xl px-6 md:mt-20 lg:px-8">
        <AppPreview />
      </div>
    </section>
  );
}
