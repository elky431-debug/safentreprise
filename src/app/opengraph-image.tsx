import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

/**
 * Image sociale (Open Graph / Twitter) — utilise le logo PNG officiel.
 */
export const alt =
  "Safentreprise — tester, former et protéger ses équipes face à la fraude";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const bytes = await readFile(
    join(process.cwd(), "public", "logo-safentreprise.png"),
  );
  const embleme = `data:image/png;base64,${bytes.toString("base64")}`;

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
        <img src={embleme} width={120} height={120} alt="" />

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
