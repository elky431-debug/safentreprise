import { Logo } from "@/components/Logo";

/** Page de félicitations après signalement (bon réflexe). */
export function SignalementBravo({ prenom }: { prenom: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Logo />
          <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-success">
            Bon réflexe
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success-soft text-[22px] text-success">
          ✓
        </div>
        <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
          Bravo{prenom ? `, ${prenom}` : ""}&nbsp;!
        </h1>
        <p className="mt-3 text-[16px] font-medium text-accent-text">
          Vous avez eu le bon réflexe.
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          Ce message était une simulation de fraude organisée par votre
          entreprise. En le signalant plutôt qu&apos;en cliquant sur le lien
          piégé, vous avez agi exactement comme il faut.
        </p>
        <div className="mt-8 w-full rounded-xl border border-border bg-surface px-5 py-5 text-left">
          <p className="text-[13px] font-medium text-foreground">
            À retenir
          </p>
          <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
            <li>• Urgence + confidentialité = signaux d&apos;alerte</li>
            <li>• Vérifiez toujours par un canal indépendant</li>
            <li>• Signalez tout message douteux à votre équipe IT / sécurité</li>
          </ul>
        </div>
        <p className="mt-10 text-[12px] text-faint">
          Safentreprise — sensibilisation interne consentie
        </p>
      </main>
    </div>
  );
}
