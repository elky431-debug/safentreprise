/**
 * Génération d'une attestation PDF de sensibilisation (pdf-lib).
 * Document sobre destiné à la conformité / preuve d'action.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type DonneesAttestation = {
  nomSociete: string;
  nomCampagne: string;
  dateEmission: Date;
  tauxClic: number;
  tauxSignalement: number;
  tauxQuiz: number;
  nbCibles: number;
};

/**
 * Marque simplifiée (grille SVG 24) — bouclier et noyau en S.
 * Version tracée d'une seule couleur : elle reste lisible à l'impression
 * noir et blanc, ce qui est le cas d'usage de ce document.
 */
const LOGO_BOUCLIER =
  "M12 2.4 20.4 5.5V12.2C20.4 17 16.9 21 12 22.2 7.1 21 3.6 17 3.6 12.2V5.5Z";
const LOGO_S =
  "M14.24 11.04C14.24 9.54 13.15 8.8 12 8.8c-1.22 0-2.24.74-2.24 1.92 0 1.31 1.15 1.76 2.24 2.08 1.09.32 2.24.77 2.24 2.08 0 1.18-1.02 1.92-2.24 1.92-1.31 0-2.24-.74-2.24-2.24";

/** Formate une date en français (JJ/MM/AAAA). */
function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Construit un PDF A4 récapitulant la sensibilisation réalisée.
 * Retourne les octets du fichier.
 */
export async function genererPdfAttestation(
  data: DonneesAttestation,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const accent = rgb(0.055, 0.522, 0.576); // #0e8593
  const ink = rgb(0.12, 0.14, 0.16);
  const muted = rgb(0.4, 0.43, 0.46);
  const { width, height } = page.getSize();
  const marge = 56;

  let y = height - marge;

  // Bandeau supérieur
  page.drawRectangle({
    x: 0,
    y: height - 8,
    width,
    height: 8,
    color: accent,
  });

  // Marque : le tracé SVG est posé depuis son coin supérieur gauche,
  // l'axe y de drawSvgPath étant orienté vers le bas.
  const echelleLogo = 1.25; // 24 unités SVG → 30 pt
  for (const trace of [LOGO_BOUCLIER, LOGO_S]) {
    page.drawSvgPath(trace, {
      x: marge,
      y: y + 7,
      scale: echelleLogo,
      borderColor: accent,
      borderWidth: 1.4,
    });
  }

  page.drawText("SAFENTREPRISE", {
    x: marge + 42,
    y: y - 10,
    size: 11,
    font: fontBold,
    color: accent,
  });
  y -= 46;

  page.drawText("Attestation de sensibilisation", {
    x: marge,
    y,
    size: 22,
    font: fontBold,
    color: ink,
  });
  y -= 28;

  page.drawText(
    "Simulation de fraude (phishing / arnaque au president) — usage interne",
    {
      x: marge,
      y,
      size: 10,
      font,
      color: muted,
    },
  );
  y -= 40;

  // Ligne de séparation
  page.drawLine({
    start: { x: marge, y },
    end: { x: width - marge, y },
    thickness: 0.5,
    color: rgb(0.82, 0.84, 0.86),
  });
  y -= 32;

  // Helvetica (WinAnsi) : accents occidentaux OK, pas de caractères hors Latin-1
  const lignes: { label: string; value: string }[] = [
    { label: "Societe", value: data.nomSociete },
    { label: "Campagne", value: data.nomCampagne },
    { label: "Date d'emission", value: formatDateFr(data.dateEmission) },
    { label: "Collaborateurs cibles", value: String(data.nbCibles) },
    { label: "Taux de clic (pieges)", value: `${data.tauxClic} %` },
    {
      label: "Taux de signalement",
      value: `${data.tauxSignalement} %`,
    },
    {
      label: "Taux de completion du quiz",
      value: `${data.tauxQuiz} %`,
    },
  ];

  for (const ligne of lignes) {
    page.drawText(ligne.label, {
      x: marge,
      y,
      size: 10,
      font,
      color: muted,
    });
    page.drawText(ligne.value, {
      x: marge + 200,
      y,
      size: 11,
      font: fontBold,
      color: ink,
    });
    y -= 22;
  }

  y -= 24;
  page.drawLine({
    start: { x: marge, y },
    end: { x: width - marge, y },
    thickness: 0.5,
    color: rgb(0.82, 0.84, 0.86),
  });
  y -= 28;

  const mention =
    "Sensibilisation realisee. Cette attestation atteste qu'une simulation " +
    "consentie de fraude a ete menee aupres des collaborateurs cibles, " +
    "suivie d'un parcours pedagogique (explication des signaux d'alerte et quiz). " +
    "Document a usage de conformite interne ; ne constitue pas une certification " +
    "externe ni une garantie d'absence de risque.";

  // Découpe manuelle des lignes (Helvetica, ~90 car. / ligne)
  const mots = mention.split(" ");
  let ligneCourante = "";
  const blocs: string[] = [];
  for (const mot of mots) {
    const essai = ligneCourante ? `${ligneCourante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, 10) > width - marge * 2) {
      blocs.push(ligneCourante);
      ligneCourante = mot;
    } else {
      ligneCourante = essai;
    }
  }
  if (ligneCourante) blocs.push(ligneCourante);

  page.drawText("Mention", {
    x: marge,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 18;

  for (const bloc of blocs) {
    page.drawText(bloc, {
      x: marge,
      y,
      size: 10,
      font,
      color: muted,
    });
    y -= 14;
  }

  // Pied de page
  page.drawText("Document genere automatiquement par Safentreprise", {
    x: marge,
    y: 40,
    size: 8,
    font,
    color: muted,
  });

  return doc.save();
}
