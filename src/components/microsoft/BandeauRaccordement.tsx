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
 *
 * ⚠ PLUS AUCUNE FLÈCHE ACCOLÉE À UN LIEN. La direction artistique les nomme
 *   explicitement — « la flèche → accolée à Voir le détail » — et ce fichier
 *   en portait trois. Un bouton et un lien souligné disent déjà qu'ils mènent
 *   quelque part.
 *
 * ⚠ ET PLUS DE TIRET CADRATIN NI DE POINT MÉDIAN COMME SÉPARATEURS. Ils font
 *   partie du même vocabulaire générique que les capitales espacées : une
 *   phrase se ponctue, elle ne s'assemble pas avec des signes.
 */
import Link from "next/link";
import { buttonPrimary } from "@/components/ui";
import { IconEye, IconShieldCheck } from "@/components/icons";
import { annuaireCoupe, resumeRaccordement } from "@/lib/microsoft/etat";
import { lireRaccordement } from "@/lib/microsoft/parcours";

export async function BandeauRaccordement() {
  const etat = await lireRaccordement();
  const resume = resumeRaccordement(etat);
  const enPanne = etat.statut === "revoque" || etat.statut === "erreur";
  const annuaireKo = annuaireCoupe(etat);

  /* ⚠ L'ANNUAIRE COUPÉ A SON PROPRE BANDEAU, AMBRE, ET IL NE DIT PAS
     « interrompue ». Les messages sont toujours analysés ; c'est la
     reconnaissance des dirigeants qui tombe. Le ranger avec les pannes rouges
     ferait croire à un arrêt, le laisser dans la ligne verte le rendrait
     invisible. */
  if (etat.etape === "actif" && !enPanne && annuaireKo) {
    return (
      <section className="rounded border border-warning/40 bg-warning-soft px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="titre-bloc flex items-center gap-2 text-foreground">
              <IconEye className="h-4 w-4 shrink-0 text-warning" />
              Votre protection Microsoft 365 est amoindrie
            </h2>
            <p className="texte-courant mt-1.5 text-muted">
              {resume}
            </p>
          </div>
          <Link href="/microsoft" className={`${buttonPrimary} shrink-0`}>
            Voir ce qu&apos;il faut faire
          </Link>
        </div>
      </section>
    );
  }

  /* Tout va bien : une ligne, rien de plus. */
  if (etat.etape === "actif" && !enPanne) {
    return (
      <Link
        href="/microsoft"
        className="bloc-app flex min-h-[44px] flex-wrap items-center gap-2.5 px-5 py-2.5"
      >
        <IconShieldCheck className="h-4 w-4 shrink-0 text-success" />
        <span className="text-[15px] text-foreground">
          Microsoft 365 : {resume}
        </span>
        <span className="texte-second ml-auto font-medium text-foreground underline underline-offset-4">
          Voir le détail
        </span>
      </Link>
    );
  }

  const jamaisCommence = etat.tenant_uid === null;

  return (
    <section
      className={`rounded border px-5 py-4 ${
        enPanne
          ? "border-danger/40 bg-danger-soft"
          : "border-warning/40 bg-warning-soft"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="titre-bloc flex items-center gap-2 text-foreground">
            <IconEye
              className={`h-4 w-4 shrink-0 ${enPanne ? "text-danger" : "text-warning"}`}
            />
            {enPanne
              ? "La surveillance Microsoft 365 est interrompue"
              : jamaisCommence
                ? "Vos boîtes Microsoft 365 ne sont pas encore surveillées"
                : "Raccordement Microsoft 365 à terminer"}
          </h2>
          <p className="texte-courant mt-1.5 text-muted">
            {resume}
          </p>
        </div>

        <Link href="/microsoft" className={`${buttonPrimary} shrink-0`}>
          {jamaisCommence
            ? "Raccorder Microsoft 365"
            : enPanne
              ? "Voir ce qui bloque"
              : "Reprendre le raccordement"}
        </Link>
      </div>
    </section>
  );
}
