/**
 * Reproduction sobre d'un message de fraude tel que reçu par un collaborateur,
 * avec les signaux d'alerte que Safentreprise mesure.
 */
const SIGNALS = [
  { label: "Urgence artificielle", tone: "danger" },
  { label: "Procédure contournée", tone: "danger" },
  { label: "Domaine falsifié", tone: "danger" },
  { label: "Signalement", tone: "success" },
] as const;

export function FraudEmailExample() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-2/60 px-4 py-2.5">
        <span className="eyebrow">Exemple de simulation</span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Non authentifié
        </span>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.7fr_1fr]">
        <div className="px-5 py-6 md:px-7">
          <dl className="space-y-2.5 border-b border-border pb-5 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-faint">De</dt>
              <dd className="font-mono text-[12px] text-muted">
                jean.dupont@direction-groupe.net
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-faint">Objet</dt>
              <dd className="font-medium text-foreground">
                Virement confidentiel — avant 17h
              </dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3.5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Sophie, j&apos;ai besoin d&apos;un virement de{" "}
              <span className="text-foreground">47 800 €</span> aujourd&apos;hui,
              sans passer par la validation habituelle. Dossier confidentiel.
            </p>
            <p className="text-foreground">Jean</p>
          </div>
        </div>

        <div className="border-t border-border bg-surface-2/40 px-5 py-6 md:border-l md:border-t-0 md:px-6">
          <p className="eyebrow">Signaux mesurés</p>
          <ul className="mt-4 space-y-3 text-[13px]">
            {SIGNALS.map((signal) => (
              <li key={signal.label} className="flex items-center gap-2.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    signal.tone === "danger" ? "bg-danger" : "bg-success"
                  }`}
                />
                <span className="text-muted">{signal.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
