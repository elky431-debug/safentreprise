import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Sora — la police de l'espace connecté depuis le document v2.
 *
 * ⚠ RELEVÉE DANS LE DÉPÔT ETSMART, PAS DEVINÉE. Le document l'interdisait
 *   expressément, et il avait raison de le faire : `src/app/globals.css`
 *   d'EtSmart déclare `body { font-family: 'Inter', … }`, ce qui aurait donné
 *   une réponse fausse à la lecture. C'est le style EN LIGNE de `layout.tsx`
 *   — `style={{ fontFamily: 'var(--font-sora), …' }}` — qui l'emporte sur la
 *   feuille de style, et Inter n'est importée nulle part : la ligne du CSS est
 *   doublement morte.
 *
 * ⚠ VARIABLE, SANS `weight`. EtSmart la charge en cinq graisses figées
 *   (300–700) ; l'axe variable couvre la même plage en un seul fichier et
 *   évite que le 700 du titre de page soit un gras synthétique.
 *
 * ⚠ SEPT POLICES ONT ÉTÉ RETIRÉES ICI LE 17 SEPTEMBRE 2026, ET LE CHIFFRE EST
 *   LA RAISON. Ce fichier en déclarait neuf — Jakarta, Inter, Source Serif,
 *   Instrument Serif, Bricolage, Archivo, Sora, JetBrains Mono, Sacramento.
 *   Mesuré sur la construction de production : les NEUF fichiers partaient sur
 *   chaque page, 308 Ko, et `/diagnostic` les PRÉCHARGEAIT toutes en priorité
 *   haute alors qu'elle n'en dessine que deux.
 *
 *   Trois d'entre elles ne rendaient nulle part : Archivo (zéro référence),
 *   Instrument Serif (`.font-display`, zéro occurrence dans `src/`) et
 *   Sacramento (`font-script`, zéro occurrence). Les quatre autres servaient
 *   la vitrine, qui suit maintenant la direction artistique.
 *
 * ⚠ NE PAS EN RAJOUTER UNE SANS ROUVRIR LA RÈGLE D'ABORD. « Une seule
 *   famille, aucune serif, aucune monospace » ouvre le document, et vaut
 *   désormais des deux côtés de la connexion. JetBrains Mono ne subsiste que
 *   pour les deux exceptions nommées : l'adresse de l'expéditeur, et le `<pre>`
 *   d'un script que l'administrateur copie dans sa console.
 */
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-stack",
  subsets: ["latin"],
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
      className={`${sora.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
