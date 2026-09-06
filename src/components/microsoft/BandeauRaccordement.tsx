/**
 * Le bandeau du tableau de bord.
 *
 * ⚠ IL EXISTE POUR UN SEUL CAS : celui du raccordement resté à mi-chemin. Un
 *   client qui a donné l'accord Microsoft, choisi ses boîtes, et jamais fait
 *   exécuter le script n'est PAS protégé — alors que tout, dans son espace, a
 *   l'air en place. C'est l'état le plus dangereux du produit, et il ne doit
 *   pas pouvoir passer inaperçu.
 *
 *   Une fois la surveillance en marche, le bandeau s'efface et laisse une
 *   ligne discrète : il n'a plus rien à dire.
 */
import Link from "next/link";
import { buttonPrimary } from "@/components/ui";
import { IconArrowRight, IconEye, IconShieldCheck } from "@/components/icons";
import { resumeRaccordement } from "@/lib/microsoft/etat";
import { lireRaccordement } from "@/lib/microsoft/parcours";

export async function BandeauRaccordement() {
  const etat = await lireRaccordement();
  const resume = resumeRaccordement(etat);
  const enPanne = etat.statut === "revoque" || etat.statut === "erreur";

  /* Tout va bien : une ligne, rien de plus. */
  if (etat.etape === "actif" && !enPanne) {
    return (
      <Link
        href="/microsoft"
        className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-2.5 transition-colors hover:bg-surface-2/60"
      >
        <IconShieldCheck className="h-4 w-4 shrink-0 text-success" />
        <span className="text-[13px] text-foreground">
          Microsoft 365 — {resume}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-muted">
          Voir le détail
          <IconArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    );
  }

  const jamaisCommence = etat.tenant_uid === null;

  return (
    <section
      className={`rounded-xl border px-5 py-4 ${
        enPanne
          ? "border-danger/25 bg-danger-soft"
          : "border-warning/30 bg-warning-soft"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <IconEye
              className={`h-4 w-4 shrink-0 ${enPanne ? "text-danger" : "text-warning"}`}
            />
            {enPanne
              ? "La surveillance Microsoft 365 est interrompue"
              : jamaisCommence
                ? "Vos boîtes Microsoft 365 ne sont pas encore surveillées"
                : "Raccordement Microsoft 365 à terminer"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            {resume}
          </p>
        </div>

        <Link href="/microsoft" className={`${buttonPrimary} shrink-0`}>
          {jamaisCommence
            ? "Raccorder Microsoft 365"
            : enPanne
              ? "Voir ce qui bloque"
              : "Reprendre le raccordement"}
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
