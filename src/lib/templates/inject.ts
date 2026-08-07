/**
 * Injection des variables dans les gabarits de messages.
 * Aucune IA : remplacement déterministe des placeholders {…}.
 */

export type VariablesMessage = {
  logoUrl: string | null;
  entreprise: string;
  nomDirigeant: string;
  nomFournisseur: string;
  prenomEmploye: string;
  signatureHtml: string;
  couleur: string;
};

/** Construit le markup du logo (ou un libellé texte de secours). */
export function baliseLogo(
  logoUrl: string | null,
  entreprise: string,
  couleur: string,
): string {
  if (logoUrl) {
    return (
      `<img src="${echapperAttr(logoUrl)}" alt="${echapperAttr(entreprise)}" ` +
      `width="148" style="display:block;max-width:148px;height:auto;border:0;" />`
    );
  }

  return (
    `<span style="font-size:18px;font-weight:700;color:${echapperAttr(couleur)};">` +
    `${echapperHtml(entreprise)}</span>`
  );
}

/**
 * Remplace toutes les variables d'un gabarit.
 * Les valeurs HTML (logo, signature) sont injectées telles quelles ;
 * le texte libre est échappé pour éviter d'ouvrir du markup involontaire.
 */
export function injecterVariables(
  gabarit: string,
  variables: VariablesMessage,
): string {
  const logo = baliseLogo(
    variables.logoUrl,
    variables.entreprise,
    variables.couleur,
  );
  const signature =
    variables.signatureHtml.trim() ||
    `<p style="margin:0;">${echapperHtml(variables.nomDirigeant)}</p>`;

  const remplacements: Record<string, string> = {
    "{logo}": logo,
    "{entreprise}": echapperHtml(variables.entreprise),
    "{nom_dirigeant}": echapperHtml(variables.nomDirigeant),
    "{nom_fournisseur}": echapperHtml(variables.nomFournisseur || "Fournisseur"),
    "{prenom_employe}": echapperHtml(variables.prenomEmploye),
    "{signature}": signature,
    "{couleur}": echapperAttr(variables.couleur || "#0e8593"),
  };

  let resultat = gabarit;
  for (const [cle, valeur] of Object.entries(remplacements)) {
    resultat = resultat.split(cle).join(valeur);
  }
  return resultat;
}

/** Nom d'expéditeur affiché dans l'aperçu (l'envoi partira d'un domaine Safentreprise). */
export function nomExpediteur(
  typeFraude: "president" | "fournisseur",
  nomDirigeant: string,
  nomFournisseur: string | null,
): string {
  if (typeFraude === "president") return nomDirigeant;
  return nomFournisseur
    ? `Comptabilité — ${nomFournisseur}`
    : "Service comptabilité fournisseur";
}

function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function echapperAttr(texte: string): string {
  return echapperHtml(texte).replace(/'/g, "&#39;");
}
