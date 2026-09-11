/**
 * Lecture d'un CSV ou d'un Excel, SANS RIEN INTERPRÉTER.
 *
 * ⚠ LA DIFFÉRENCE AVEC `parse-employees` EST VOLONTAIRE. Celui-là cherche des
 *   colonnes qu'il connaît (« prenom », « email ») et jette ce qu'il ne
 *   reconnaît pas. Ici on ne sait pas ce que le fichier contient : le client
 *   exporte ses fournisseurs depuis son logiciel de comptabilité, dont les
 *   en-têtes sont imprévisibles. Ce module rend donc les en-têtes ET les
 *   lignes telles quelles ; c'est le client qui dira, à l'écran suivant,
 *   quelle colonne porte quoi.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Tableur = {
  entetes: string[];
  lignes: Record<string, string>[];
};

/** Au-delà, l'aperçu devient illisible et le navigateur peine. */
export const LIGNES_MAX = 5000;

function nettoyer(lignes: Record<string, unknown>[]): Tableur {
  const entetes: string[] = [];
  const propres: Record<string, string>[] = [];

  for (const ligne of lignes.slice(0, LIGNES_MAX)) {
    const propre: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(ligne)) {
      const entete = String(cle ?? "").trim();
      if (!entete) continue;
      if (!entetes.includes(entete)) entetes.push(entete);
      propre[entete] = String(valeur ?? "").trim();
    }
    // Une ligne entièrement vide ne compte pas : les exports se terminent
    // souvent par plusieurs.
    if (Object.values(propre).some((v) => v !== "")) propres.push(propre);
  }

  return { entetes, lignes: propres };
}

function lireCsv(fichier: File): Promise<Tableur> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(fichier, {
      header: true,
      skipEmptyLines: true,
      // Les exports français sont souvent en point-virgule ; laisser
      // Papaparse deviner évite de tout lire dans une seule colonne.
      complete: (resultat) => resolve(nettoyer(resultat.data)),
      error: (erreur) => reject(erreur),
    });
  });
}

async function lireExcel(fichier: File): Promise<Tableur> {
  const tampon = await fichier.arrayBuffer();
  const classeur = XLSX.read(tampon, { type: "array" });
  const premiere = classeur.SheetNames[0];
  if (!premiere) return { entetes: [], lignes: [] };

  const feuille = classeur.Sheets[premiere];
  // `defval` garde les cellules vides : sans lui, une ligne dont la première
  // colonne est vide décale toutes les suivantes.
  const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, {
    defval: "",
    raw: false,
  });
  return nettoyer(lignes);
}

export async function lireTableur(fichier: File): Promise<Tableur> {
  const nom = fichier.name.toLowerCase();
  if (
    nom.endsWith(".xlsx") ||
    nom.endsWith(".xls") ||
    fichier.type.includes("spreadsheet") ||
    fichier.type.includes("excel")
  ) {
    return lireExcel(fichier);
  }
  return lireCsv(fichier);
}
