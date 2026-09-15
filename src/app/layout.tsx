import type { Metadata } from "next";
import {
  Archivo,
  Bricolage_Grotesque,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
  Sacramento,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Vitrine publique : une grotesque neutre pour le texte, un serif discret
// pour les titres. L'espace connecté garde Jakarta.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Titre du hero, et lui seul. Voir `h1.titre-hero` dans `globals.css`.
//
// ⚠ PAS DE `weight`, ET C'EST VOULU. Sans cette clé, `next/font` sert le
//   fichier VARIABLE : un seul téléchargement couvre 200 à 800, et le 600 que
//   demande le titre est un vrai dessin de la fonte, pas un gras synthétique.
//   Fixer `weight: "600"` servirait un statique et interdirait tout autre
//   poids sans un second fichier.
//
// ⚠ LES AXES `opsz` ET `wdth` NE SONT PAS DEMANDÉS. Cette fonte en porte
//   trois ; `next/font` n'embarque que `wght` par défaut et fige les autres à
//   leur valeur par défaut. Les réclamer alourdirait le fichier pour des axes
//   que rien ne pilote ici.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

/**
 * La police de l'espace connecté, et la seule.
 *
 * ⚠ UNE SEULE FAMILLE, AUCUNE SERIF, AUCUNE MONOSPACE. C'est la règle
 *   d'ouverture de `docs/DIRECTION-ARTISTIQUE.md`. L'application portait
 *   auparavant Jakarta pour le texte, Source Serif pour les titres et
 *   JetBrains Mono pour les adresses : trois familles pour un outil de
 *   travail, et la signature du design générique que ce document nomme.
 *
 * ⚠ PAS DE `weight` : le fichier VARIABLE couvre 100 à 900 d'un seul
 *   téléchargement. L'échelle en demande cinq (400, 600, 700, 800), et le 800
 *   du chiffre d'accroche doit être un vrai dessin, pas un gras synthétique.
 *
 * ⚠ L'AXE `wdth` N'EST PAS DEMANDÉ. Archivo en porte un (62–125) ; `next/font`
 *   n'embarque que `wght` par défaut et fige l'autre à 100. Le réclamer
 *   alourdirait le fichier pour un axe que rien ne pilote ici.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-stack",
  subsets: ["latin"],
  display: "swap",
});

// Cursive employée uniquement sur une ligne de titre de la landing
const sacramento = Sacramento({
  variable: "--font-sacramento",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const DESCRIPTION =
  "Testez vos équipes comptables et financières face à l'arnaque au président et au faux fournisseur, puis formez celles qui se font piéger.";

export const metadata: Metadata = {
  // Base des URL absolues (image sociale, canoniques). Renseignée depuis
  // l'environnement pour rester juste en préproduction comme en production.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://safentreprise.com",
  ),
  title: "Safentreprise — Sensibilisation à la fraude ciblée",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Safentreprise",
    title: "Safentreprise — Sensibilisation à la fraude ciblée",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Safentreprise — Sensibilisation à la fraude ciblée",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${jakarta.variable} ${inter.variable} ${sourceSerif.variable} ${instrumentSerif.variable} ${bricolage.variable} ${archivo.variable} ${jetbrainsMono.variable} ${sacramento.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
