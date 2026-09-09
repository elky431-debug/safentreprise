import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { buttonPrimaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "Comparatif des approches — Safentreprise",
  description:
    "Filtre natif, passerelle de filtrage, avertissement dans la boîte : ce que chaque approche fait du courrier suspect.",
};

/**
 * ⚠ ON OPPOSE DES APPROCHES, PAS DES MARQUES. Aucune colonne ne nomme un
 *   concurrent, et aucune ne doit le faire : citer un éditeur pour lui prêter
 *   un défaut engage la responsabilité de l'entreprise, pas seulement son
 *   image.
 *
 * ⚠ CONTENU À RELIRE. Les cellules sont un premier jet destiné à être révisé.
 *   Chaque ligne de la colonne Safentreprise doit décrire ce que le code fait
 *   aujourd'hui — pas ce qu'il est prévu qu'il fasse.
 */
const COLONNES = [
  "Filtre natif Microsoft 365",
  "Passerelle de filtrage classique",
  "Safentreprise",
];

const LIGNES = [
  {
    critere: "Emails bloqués ou mis en quarantaine",
    cellules: [
      "Oui, selon des règles que vous ne voyez pas.",
      "Oui, c'est le principe : le flux passe par la passerelle avant vous.",
      "Aucun. Le message arrive, avec un avertissement au-dessus.",
    ],
  },
  {
    critere: "Risque de perdre un message légitime",
    cellules: [
      "Réel : une facture attendue peut finir en indésirables.",
      "Réel, et d'autant plus fort que le filtrage est strict.",
      "Nul : rien n'est retenu ni déplacé.",
    ],
  },
  {
    critere: "Action demandée à vos correspondants",
    cellules: [
      "Aucune.",
      "Parfois : liste d'expéditeurs autorisés, changement d'enregistrements DNS.",
      "Aucune.",
    ],
  },
  {
    critere: "Visible sur mobile sans installation",
    cellules: [
      "Sans objet : rien ne s'affiche, le message est écarté.",
      "Sans objet, pour la même raison.",
      "Oui. L'avertissement est dans le message, il suit la boîte partout.",
    ],
  },
  {
    critere: "Fonctionne sans extension ni add-in",
    cellules: [
      "Oui.",
      "Oui.",
      "Oui pour l'analyse des boîtes Microsoft 365, qui passe par le serveur.",
    ],
  },
  {
    critere: "Accès aux boîtes vérifiable par le client",
    cellules: [
      "Sans objet : le service est celui de votre fournisseur de messagerie.",
      "Rarement : l'étendue de l'accès est décrite, pas démontrable.",
      "Oui. Le périmètre est posé par votre administrateur et se vérifie.",
    ],
  },
  {
    critere: "Spécialisé sur la fraude financière",
    cellules: [
      "Non : le filtre vise l'indésirable et le logiciel malveillant.",
      "Non : large couverture, peu de lecture du contexte de paiement.",
      "Oui. Virement, changement de coordonnées bancaires, facture.",
    ],
  },
];

export default function ComparatifPage() {
  return (
    <div className="theme-clair flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6 lg:px-8">
          <Link href="/" aria-label="Safentreprise — accueil">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-[13.5px] text-muted transition-colors hover:text-foreground"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 pt-16 pb-14 text-center md:pt-20 lg:px-8">
          <div className="mx-auto max-w-[820px]">
            <h1 className="text-[clamp(1.8rem,3.6vw,2.85rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
              Trois façons de traiter un courrier suspect
            </h1>
            <p className="mx-auto mt-6 text-[16px] leading-relaxed text-muted">
              Un filtre décide à votre place et retient. Une passerelle
              s’interpose avant votre messagerie. Safentreprise ne retient rien :
              le message arrive, et l’avertissement arrive avec lui. Ce tableau
              compare des approches, pas des produits.
            </p>
          </div>
        </section>

        <section className="px-6 pb-20 md:pb-24 lg:px-8">
          <div className="mx-auto max-w-[1400px]">
            {/* Le tableau déborde sur mobile : il défile dans son propre
                conteneur plutôt que de faire glisser la page entière. */}
            <div className="overflow-x-auto rounded-[10px] border border-border">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="sur-marine">
                    <th
                      scope="col"
                      className="w-[26%] px-6 py-5 text-[13px] font-semibold text-foreground"
                    >
                      Critère
                    </th>
                    {COLONNES.map((colonne) => (
                      <th
                        key={colonne}
                        scope="col"
                        className="border-l border-border px-6 py-5 text-[13px] font-semibold text-foreground"
                      >
                        {colonne}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LIGNES.map((ligne) => (
                    <tr key={ligne.critere} className="border-t border-border">
                      <th
                        scope="row"
                        className="px-6 py-5 align-top text-[13.5px] font-semibold text-foreground"
                      >
                        {ligne.critere}
                      </th>
                      {ligne.cellules.map((cellule, index) => (
                        <td
                          key={COLONNES[index]}
                          className={`border-l border-border px-6 py-5 align-top text-[13.5px] leading-relaxed ${
                            index === COLONNES.length - 1
                              ? "bg-accent-soft text-foreground"
                              : "text-muted"
                          }`}
                        >
                          {cellule}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="sur-marine px-6 py-20 md:py-24 lg:px-8">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-[clamp(1.5rem,2.8vw,2.1rem)] font-semibold leading-tight text-foreground">
              Voyez-le sur vos propres messages
            </h2>
            <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
              Trente minutes suffisent pour voir le dispositif complet sur votre
              organisation.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/demo" className={buttonPrimaryLg}>
                Demander une démo
                <IconArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <Logo />
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
