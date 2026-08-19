import { ImageResponse } from "next/og";

/**
 * Image sociale (Open Graph / Twitter) générée à la volée.
 * L'emblème est injecté en data-URI : le moteur de rendu de `next/og` ne
 * gère pas les dégradés SVG déclarés en JSX, mais il affiche sans peine une
 * image SVG complète.
 */
export const alt =
  "Safentreprise — tester, former et protéger ses équipes face à la fraude";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const EMBLEME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="200" height="200">
<defs><linearGradient id="d" x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#7ee8ef"/><stop offset=".55" stop-color="#16a3b4"/><stop offset="1" stop-color="#1257a5"/>
</linearGradient></defs>
<path d="M32 3 57.5 12.2V32.5C57.5 45.6 47.3 55.9 32 61 16.7 55.9 6.5 45.6 6.5 32.5V12.2Z" fill="url(#d)"/>
<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
<path d="M14.78 25.97A19 19 0 0 1 49.22 25.97" stroke-width="3" opacity=".55"/>
<path d="M19.44 26.75A14.5 14.5 0 0 1 44.56 26.75" stroke-width="3" opacity=".8"/>
<path d="M39 30.5C39 25.8 35.6 23.5 32 23.5c-3.8 0-7 2.3-7 6 0 4.1 3.6 5.5 7 6.5 3.4 1 7 2.4 7 6.5 0 3.7-3.2 6-7 6-3.6 0-7-2.3-7-7" stroke-width="3.6"/>
</g></svg>`;

export default function OpengraphImage() {
  const embleme = `data:image/svg+xml;base64,${Buffer.from(EMBLEME).toString("base64")}`;

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
          background: "#080808",
          color: "#f5f5f4",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={embleme} width={128} height={128} alt="" />

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
            color: "#a1a1a1",
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
            color: "#5ecad4",
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
