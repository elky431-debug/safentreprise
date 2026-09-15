import Link from "next/link";
import { NiveauBadge } from "@/components/menaces/MenacesTable";
import { IconShieldCheck } from "@/components/icons";
import { motifPrincipal } from "@/lib/signaux";
import type { AlerteGraph } from "@/lib/types";

/**
 * Les dernières tentatives, en pleine largeur, sur le tableau de bord.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ CE QU'ELLE REMPLACE, ET POURQUOI. La liste précédente montrait six lignes
 *   quasi identiques ne portant que deux adresses e-mail : ni objet, ni
 *   niveau lisible d'un coup d'œil, ni motif. C'était la section la plus
 *   importante de l'écran et la moins exploitable. Elle porte désormais les
 *   cinq colonnes qui permettent de décider : quand, à quel point, quoi, de
 *   qui, et pourquoi le moteur a alerté.
 *
 * ⚠ CE N'EST PAS UN `<table>`, ET C'EST DÉLIBÉRÉ. Chaque ligne doit être
 *   cliquable en entier ; un `<a>` ne peut pas envelopper un `<tr>` sans
 *   produire un balisage invalide. Une grille CSS donne le même alignement en
 *   colonnes avec un seul lien par ligne — donc une seule tabulation par
 *   tentative, au lieu d'une par cellule cliquable.
 *
 * ⚠ LE LIEN VA VERS LA LISTE, PAS VERS UNE PAGE DE DÉTAIL. Il n'existe pas de
 *   `/menaces/[id]` : le détail est le dépliant de `MenacesTable`. Écrire une
 *   page dédiée reviendrait à entretenir deux affichages du même détail, et
 *   ils divergeraient. `?alerte=<id>` ouvre la bonne ligne, déjà dépliée.
 *
 * ⚠ L'OBJET EST AFFICHÉ ICI PARCE QUE CETTE LISTE NE CONTIENT QUE DES ALERTES.
 *   La règle n'est pas « jamais d'objet en liste » mais « jamais sur une liste
 *   d'ANALYSES, oui sur une liste d'ALERTES ». Voir `@/lib/alertes`, qui filtre
 *   sur `alerte = true` et porte la version longue du raisonnement.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Grille commune à l'en-tête et aux lignes — une seule définition.
 *
 * ⚠ LA COLONNE EXPÉDITEUR EST LARGE, ET CE N'EST PAS DU CONFORT. À 200 px,
 *   `p.durand@cabinet-durand.fr.co` se coupait à `…fr.` — c'est-à-dire
 *   exactement sur le `.co` qui fait la fraude. Une troncature qui mange le
 *   signal vaut moins que pas de colonne du tout. 252 px laissent passer une
 *   adresse de 34 caractères en 11,5 px de corps ; au-delà l'attribut `title`
 *   et le détail prennent le relais.
 */
const COLONNES =
  "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 lg:grid-cols-[76px_112px_minmax(0,1fr)_252px_158px] lg:gap-y-0";

export function ListeMenaces({ menaces }: { menaces: AlerteGraph[] }) {
  if (menaces.length === 0) {
    return (
      <div className="bloc-app px-5 py-10">
        {/* ⚠ UN ÉCRAN VIDE EST UNE INVITATION À AGIR, PAS UN CONSTAT DE VIDE.
            Et il est aligné à gauche comme le reste : le centrage était un
            reste de la mise en page précédente. */}
        <p className="titre-bloc text-foreground">
          <IconShieldCheck className="mr-2 inline h-4 w-4 align-[-2px] text-success" />
          Aucune tentative détectée à ce jour
        </p>
        <p className="texte-courant mt-1.5 text-muted">
          Les messages qui arrivent dans vos boîtes surveillées sont analysés en
          continu. Les tentatives de fraude apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="bloc-app overflow-hidden">
      {/* En-tête de colonnes — masqué en mobile, où les lignes s'empilent et
          où des titres de colonnes ne correspondraient plus à rien. */}
      <div
        aria-hidden
        className={`hidden border-b border-border px-5 py-2.5 lg:grid ${COLONNES}`}
      >
        <Colonne>Date</Colonne>
        <Colonne>Niveau</Colonne>
        <Colonne>Objet du message</Colonne>
        <Colonne>Expéditeur</Colonne>
        <Colonne>Motif principal</Colonne>
      </div>

      <ul>
        {menaces.map((menace) => {
          const motif = motifPrincipal(menace.signaux);
          return (
            <li key={menace.id} className="ligne-tableau">
              <Link
                href={`/menaces?alerte=${encodeURIComponent(menace.id)}`}
                className={`group min-h-[44px] items-center px-5 py-2.5 ${COLONNES}`}
              >
                {/* Date */}
                <span className="chiffre order-1 text-[13px] font-normal text-muted lg:order-none">
                  {formaterDate(menace.detecte_at)}
                </span>

                {/* Niveau — la seule couleur de la ligne */}
                <span className="order-2 justify-self-end lg:order-none lg:justify-self-start">
                  <NiveauBadge
                    niveau={menace.niveau_risque}
                    score={menace.score}
                  />
                </span>

                {/* Objet */}
                <span
                  className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1"
                  title={menace.objet ?? undefined}
                >
                  <span className="block truncate text-[15px] text-foreground group-hover:underline">
                    {menace.objet || (
                      <span className="text-faint">sans objet</span>
                    )}
                  </span>
                </span>

                {/* Expéditeur — nom puis adresse */}
                <span className="order-4 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                  {menace.expediteur_nom && (
                    <span className="block truncate text-[13.5px] text-foreground">
                      {menace.expediteur_nom}
                    </span>
                  )}
                  <span
                    className="block truncate text-[13px] text-muted"
                    title={menace.expediteur_email ?? undefined}
                  >
                    {menace.expediteur_email || "adresse absente"}
                  </span>
                </span>

                {/* Motif principal — une ligne courte, jamais la phrase du
                    moteur, qui tient sur trois lignes de haut. */}
                <span className="order-5 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                  {motif === null ? (
                    <span className="texte-second">—</span>
                  ) : (
                    <span className="block truncate text-[13.5px] text-muted">
                      {motif.label}
                      {motif.autres > 0 && (
                        <span className="text-faint">
                          {" "}
                          +{motif.autres}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * ⚠ CASSE DE PHRASE, JAMAIS DE CAPITALES INTÉGRALES. Les en-têtes se
 *   distinguent par la graisse et la couleur — c'est la règle du document, et
 *   les petites capitales espacées étaient le marqueur générique le plus
 *   visible de l'écran.
 */
function Colonne({ children }: { children: React.ReactNode }) {
  return <span className="entete-tableau">{children}</span>;
}

/** « 12 sept. · 14:05 » — assez pour situer sans occuper deux lignes. */
function formaterDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} · ${d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Pied de liste : le renvoi vers la page complète. */
export function PiedListeMenaces({ total }: { total: number }) {
  return (
    <div className="flex items-center justify-between gap-4 pt-3">
      <p className="texte-second">
        {total > 5
          ? `5 dernières sur ${total} tentatives`
          : `${total} ${total === 1 ? "tentative" : "tentatives"} au total`}
      </p>
      {/* ⚠ PAS DE FLÈCHE ACCOLÉE AU LIEN. Elle figure dans la liste des
          suppressions : un lien souligné est déjà un lien. */}
      <Link
        href="/menaces"
        className="texte-second font-medium text-foreground underline underline-offset-4"
      >
        Toutes les tentatives
      </Link>
    </div>
  );
}
