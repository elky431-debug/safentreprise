/**
 * Réduction des signaux du moteur de détection à une étiquette courte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ CE MODULE A ÉTÉ SORTI DE `MenacesTable`, ET C'EST CE QUI COMPTE. Le
 *   tableau de bord doit afficher le MÊME motif que la page Menaces pour la
 *   même alerte. Tant que la table de correspondance vivait dans un composant
 *   client, le second écran ne pouvait que la recopier — deux vérités
 *   destinées à diverger dès la première règle ajoutée au moteur.
 *
 * ⚠ IL NE DÉPEND NI DE REACT NI DU DOM. C'est ce qui lui permet d'être appelé
 *   depuis un composant serveur (la liste du tableau de bord) comme depuis un
 *   composant client (le tableau filtrable).
 *
 * ⚠ LE MOTEUR PRODUIT DES PHRASES ENTIÈRES, PAS DES CODES. Affichées telles
 *   quelles, elles écrasent une ligne de tableau sur trois lignes de haut.
 *   L'étiquette courte sert en liste ; la phrase complète reste lisible dans
 *   le détail d'une alerte, et c'est elle qui fait foi.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Familles de signaux. La teinte se décide à l'affichage, pas ici. */
export type TonSignal = "identite" | "canal" | "action";

export const RESUMES_SIGNAUX: {
  motif: RegExp;
  label: string;
  ton: TonSignal;
}[] = [
  // ⚠ L'ANNUAIRE AVANT LA RÈGLE GÉNÉRALE. Les deux phrases commencent par
  //   « se présente au nom » : sans cette entrée placée d'abord, l'usurpation
  //   d'annuaire s'afficherait sous le libellé plus faible « Nom ↔ adresse ».
  //   Le moteur ne produit plus les deux à la fois (voir `remplace` dans
  //   detection-rules.js), mais l'ordre reste ce qui rend chaque motif juste.
  { motif: /figure à l'annuaire/i, label: "Identité de l'annuaire", ton: "identite" },
  { motif: /aucune forme de ce nom|se présente au nom/i, label: "Nom ↔ adresse", ton: "identite" },
  { motif: /ne correspond pas au nom affich/i, label: "Adresse ↔ nom affiché", ton: "identite" },
  { motif: /sign(é|e) «/i, label: "Signature usurpée", ton: "identite" },
  { motif: /messagerie grand public/i, label: "Messagerie perso", ton: "canal" },
  { motif: /typosquatting|ressemble fortement/i, label: "Domaine sosie", ton: "canal" },
  { motif: /action sensible/i, label: "Demande sensible", ton: "action" },
  // ⚠ « Urgence et secret », pas « Urgence · secret ». Le point médian figure
  // dans les suppressions du document ; entre deux mots, une conjonction dit la
  // même chose et se lit à voix haute.
  { motif: /urgence|secret|indisponibilit/i, label: "Urgence et secret", ton: "action" },
];

export function resumerSignal(signal: string): {
  label: string;
  ton: TonSignal | null;
} {
  const connu = RESUMES_SIGNAUX.find((r) => r.motif.test(signal));
  if (connu) return { label: connu.label, ton: connu.ton };

  // Repli — anciens formats techniques (« incoherence_nom_adresse ») ou
  // libellés inconnus : on nettoie, on tronque, et on reste en neutre.
  const nettoye = signal.replace(/[_-]+/g, " ").trim();
  if (!nettoye) return { label: "Signal", ton: null };
  const capitalise = nettoye.charAt(0).toUpperCase() + nettoye.slice(1);
  return {
    label:
      capitalise.length <= 26
        ? capitalise
        : `${capitalise.slice(0, 25).trimEnd()}…`,
    ton: null,
  };
}

/**
 * Le motif à mettre en avant quand il n'y a de place que pour un seul.
 *
 * ⚠ LE PREMIER SIGNAL, PAS LE PLUS GRAVE. Le moteur les émet dans l'ordre où
 *   ses règles se déclenchent, et cet ordre porte déjà un sens : l'incohérence
 *   d'identité vient avant la demande sensible, parce que c'est elle qui
 *   qualifie la tentative. Trier par gravité supposerait un barème par signal
 *   que le moteur ne fournit pas — on ne va pas l'inventer ici.
 *
 * ⚠ LE COMPTE DES AUTRES EST RENDU, PAS PERDU. Une ligne qui montre un motif
 *   sur quatre sans le dire laisse croire qu'il n'y en avait qu'un.
 */
export function motifPrincipal(signaux: string[]): {
  label: string;
  ton: TonSignal | null;
  autres: number;
} | null {
  if (signaux.length === 0) return null;
  const { label, ton } = resumerSignal(signaux[0]);
  return { label, ton, autres: signaux.length - 1 };
}
