/**
 * Libellés et helpers partagés du module Campagnes.
 * Aucune dépendance à React ni à Supabase : utilisable serveur comme client.
 */
import type {
  CanalCampagne,
  CanalMessage,
  StatutCampagne,
  TypeFraude,
  TypeFraudeCampagne,
} from "@/lib/types";

/* --------------------------------------------------------------------------
   Libellés
   -------------------------------------------------------------------------- */

export const TYPE_FRAUDE_LABELS: Record<TypeFraude, string> = {
  president: "Arnaque au président",
  fournisseur: "Faux fournisseur",
};

export const TYPE_FRAUDE_DESCRIPTIONS: Record<TypeFraude, string> = {
  president:
    "Un virement urgent et confidentiel, demandé au nom du dirigeant.",
  fournisseur:
    "Un changement de coordonnées bancaires sur un compte déjà connu.",
};

export const CANAL_LABELS: Record<CanalMessage, string> = {
  email: "Email",
  sms: "SMS",
};

export const STATUT_LABELS: Record<StatutCampagne, string> = {
  brouillon: "Brouillon",
  prete: "Prête",
  envoyee: "Envoyée",
};

/** Couleur de charte par défaut (bleu canard Safentreprise). */
export const COULEUR_MARQUE_DEFAUT = "#0e8593";

/** Signature HTML de départ proposée à l'étape Marque. */
export function signatureParDefaut(nomDirigeant: string, entreprise: string): string {
  return (
    `<p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;color:#374151;">` +
    `<strong>${nomDirigeant}</strong><br />${entreprise}</p>`
  );
}

/* --------------------------------------------------------------------------
   Conversions entre le périmètre d'une campagne et celui d'un message
   -------------------------------------------------------------------------- */

/** Types de fraude concrets couverts par une campagne. */
export function typesFraudeDeCampagne(
  type: TypeFraudeCampagne,
): TypeFraude[] {
  return type === "les_deux" ? ["president", "fournisseur"] : [type];
}

/** Canaux concrets couverts par une campagne. */
export function canauxDeCampagne(canal: CanalCampagne): CanalMessage[] {
  return canal === "les_deux" ? ["email", "sms"] : [canal];
}

/** Inverse : déduit la valeur à stocker sur la campagne depuis la sélection. */
export function typeFraudeCampagne(
  types: TypeFraude[],
): TypeFraudeCampagne | null {
  if (types.length === 0) return null;
  return types.length > 1 ? "les_deux" : types[0];
}

/** Inverse : déduit le canal à stocker sur la campagne depuis la sélection. */
export function canalCampagne(canaux: CanalMessage[]): CanalCampagne | null {
  if (canaux.length === 0) return null;
  return canaux.length > 1 ? "les_deux" : canaux[0];
}

/**
 * Combinaisons type × canal couvertes par une campagne (legacy « les_deux »).
 */
export function combinaisonsDeCampagne(
  type: TypeFraudeCampagne,
  canal: CanalCampagne,
): { typeFraude: TypeFraude; canal: CanalMessage }[] {
  return typesFraudeDeCampagne(type).flatMap((typeFraude) =>
    canauxDeCampagne(canal).map((c) => ({ typeFraude, canal: c })),
  );
}

/* --------------------------------------------------------------------------
   Affichage
   -------------------------------------------------------------------------- */

/** Résumé lisible du périmètre d'une campagne, ex. « Président · Email ». */
export function resumeCampagne(
  type: TypeFraudeCampagne,
  canal: CanalCampagne,
): string {
  const types = typesFraudeDeCampagne(type)
    .map((t) => TYPE_FRAUDE_LABELS[t])
    .join(" + ");
  const canaux = canauxDeCampagne(canal)
    .map((c) => CANAL_LABELS[c])
    .join(" + ");

  return `${types} · ${canaux}`;
}

export function formatDateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
