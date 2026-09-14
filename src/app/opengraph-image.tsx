import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

/**
 * Image sociale (Open Graph / Twitter).
 *
 * ⚠ ON UTILISE LE LOGO HORIZONTAL, PAS LE BOUCLIER SEUL. Cette image est vue
 *   hors de tout contexte — dans un fil LinkedIn, une prévisualisation de
 *   message — où rien d'autre ne dit qui parle. Le nom doit donc y être, et
 *   il l'est déjà dans le dessin.
 *
 * ⚠ LE FICHIER EST LU DEPUIS LE DISQUE ET INLINÉ EN base64. `next/og` rend
 *   l'image côté serveur, sans réseau : une URL distante ne serait pas
 *   chargée. C'est aussi pourquoi on prend le PNG et non l'AVIF — le moteur
 *   de rendu ne le décode pas.
 */
export const alt =
  "Safentreprise — tester, former et protéger ses équipes face à la fraude";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const bytes = await readFile(
    join(process.cwd(), "public", "marque", "logo-480.png"),
  );
  const logo = `data:image/png;base64,${bytes.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#ffffff",
          color: "#101828",
        }}
      >
        <img src={logo} width={420} height={107} alt="" />

        <div
          style={{
            marginTop: 44,
            fontSize: 68,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Tester, former, protéger
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 30,
            color: "#4a5567",
            maxWidth: 820,
            lineHeight: 1.4,
          }}
        >
          Sensibilisation à l’arnaque au président et au faux fournisseur, pour
          les équipes qui déclenchent les virements.
        </div>

        <div
          style={{
            marginTop: 56,
            fontSize: 26,
            color: "#17356b",
            letterSpacing: "0.02em",
          }}
        >
          safentreprise.com
        </div>
      </div>
    ),
    size,
  );
}
