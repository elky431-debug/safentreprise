/**
 * Le fil des trois étapes de l'informaticien.
 *
 * ⚠ TROIS ÉTAPES, PAS CINQ. `Progression` de `microsoft/commun.tsx` affiche le
 *   parcours du DIRIGEANT, qui compte l'activation et l'état actif — deux
 *   choses qui ne le concernent pas et qu'il ne peut pas faire avancer. Lui
 *   montrer cinq cases dont deux ne lui appartiennent pas donne l'impression
 *   d'un travail plus long qu'il n'est.
 */
const ETAPES = [
  { n: 1, titre: "Autoriser" },
  { n: 2, titre: "Périmètre" },
  { n: 3, titre: "Restreindre" },
] as const;

export function FilEtapes({ courante }: { courante: 1 | 2 | 3 }) {
  return (
    <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-border bg-border">
      {ETAPES.map((e) => {
        const faite = courante > e.n;
        const ici = courante === e.n;
        return (
          <li
            key={e.n}
            aria-current={ici ? "step" : undefined}
            className={`flex items-center gap-2.5 px-4 py-3 ${ici ? "bg-accent-soft" : "bg-surface"}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                faite
                  ? "bg-success-soft text-success"
                  : ici
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-faint"
              }`}
            >
              {faite ? "✓" : e.n}
            </span>
            <span
              className={`text-[12.5px] font-medium ${faite || ici ? "text-foreground" : "text-faint"}`}
            >
              {e.titre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
