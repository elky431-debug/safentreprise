import type { Metadata } from "next";
import {
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
      className={`${jakarta.variable} ${inter.variable} ${sourceSerif.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${sacramento.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
