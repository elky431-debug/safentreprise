/**
 * Parsing d'un fichier CSV ou Excel (colonnes : prenom, email, telephone).
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedEmployee = {
  prenom: string;
  email: string;
  telephone: string | null;
};

/** Normalise les noms de colonnes (accents, casse, espaces). */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function mapRow(row: Record<string, unknown>): ParsedEmployee | null {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = String(value ?? "").trim();
  }

  const prenom =
    normalized.prenom ||
    normalized.firstname ||
    normalized.first_name ||
    normalized.prenoms ||
    "";
  const email = (normalized.email || normalized.mail || "").toLowerCase();
  const telephone =
    normalized.telephone ||
    normalized.tel ||
    normalized.phone ||
    normalized.mobile ||
    "";

  if (!prenom || !email || !email.includes("@")) {
    return null;
  }

  return {
    prenom,
    email,
    telephone: telephone || null,
  };
}

/** Parse un fichier CSV via PapaParse. */
export function parseCsvFile(file: File): Promise<ParsedEmployee[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const employees = results.data
          .map(mapRow)
          .filter((e): e is ParsedEmployee => e !== null);
        resolve(employees);
      },
      error(err) {
        reject(err);
      },
    });
  });
}

/** Parse un fichier Excel (.xlsx / .xls) via SheetJS. */
export async function parseExcelFile(file: File): Promise<ParsedEmployee[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return rows.map(mapRow).filter((e): e is ParsedEmployee => e !== null);
}

/** Détecte le type de fichier et parse. */
export async function parseEmployeeFile(
  file: File
): Promise<ParsedEmployee[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseCsvFile(file);
  }
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel")
  ) {
    return parseExcelFile(file);
  }
  // Tentative CSV par défaut
  return parseCsvFile(file);
}
