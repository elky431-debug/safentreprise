/**
 * Les deux emails du diagnostic : l'analyse au prospect, la fiche pour nous.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ MODULE SANS IMPORTATION D'EXÉCUTION, ET IL DOIT LE RESTER. Il ne tire que
 *   de `diagnostic.ts` et `tarifs.ts`, qui n'importent eux-mêmes rien : c'est
 *   ce qui le rend exécutable par `node --experimental-strip-types`, donc
 *   testable sans monter Next. Importer ici `@/lib/send/email` casserait ça —
 *   l'envoi vit dans `diagnostic-notification.ts`, à côté.
 *
 * ⚠ STYLES EN LIGNE UNIQUEMENT, MISE EN PAGE EN TABLEAUX. Même raison que le
 *   rapport mensuel : les clients de messagerie ignorent les feuilles de style
 *   et une partie des sélecteurs, et Outlook ignore en plus flex et grid. Un
 *   `<div>` en colonnes s'y effondre en pile illisible.
 *
 * ⚠ TOUT CE QUI VIENT DU FORMULAIRE EST ÉCHAPPÉ. Le prénom, le nom, la société
 *   et le domaine sont saisis par un inconnu : un chevron y suffirait à casser
 *   le HTML, et une balise à y injecter autre chose.
 *
 * ⚠ L'EMAIL AU PROSPECT NE VEND PAS. Il rend ce qu'on lui a promis — son
 *   analyse — et s'arrête là. Un argumentaire ajouté derrière le résultat
 *   transformerait une promesse tenue en prétexte à prospection, ce qui est
 *   exactement ce que le formulaire a demandé de ne pas faire.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {
  LIBELLE_PALIER,
  QUESTIONS,
  QUESTIONS_NOTEES,
  SYNTHESES,
  detailler,
  horsPerimetre,
  offrePourEffectif,
  palierDuScore,
  trouverOption,
  type Reponses,
} from "@/lib/diagnostic";
import { OFFRES, formaterEuros } from "@/lib/tarifs";

/** Ce que le formulaire de la page de résultat collecte. */
export type Coordonnees = {
  prenom: string;
  nom: string;
  email: string;
  entreprise: string;
};

/** Coordonnées du produit, passées plutôt qu'importées (voir l'en-tête). */
export type ContexteEmail = {
  /** Adresse de contact affichée en pied. */
  contact: string;
  /** Adresse publique du site, sans barre finale. */
  siteUrl: string;
};

/* ==========================================================================
   Palette — la même que le rapport mensuel
   ========================================================================== */

const C = {
  fond: "#f6f7f8",
  carte: "#ffffff",
  marine: "#0f2444",
  encre: "#101828",
  ancre: "#17356b",
  ancreDoux: "#eff1f5",
  secondaire: "#4a5567",
  discret: "#6b7686",
  trait: "#e7e8e8",
  // ⚠ ALIGNÉ SUR `--eleve` DE L'APPLICATION, comme le rapport mensuel.
  //   Voir l'en-tête de `rapport-mensuel-html.ts` pour le raisonnement.
  //   5,91:1 sur `dangerDoux`, 6,48:1 sur blanc.
  danger: "#9d3f49",
  dangerDoux: "#fdf2f2",

  // ⚠ L'AMBRE NE SUIT PAS `--modere`, ET CE N'EST PAS UN OUBLI. `--modere`
  //   (`#9A6B39`) a été mesuré pour deux rôles : un aplat de pastille avec du
  //   texte blanc dessus, et un liseré de bannière — un objet graphique, dont
  //   le seuil WCAG est 3:1. Ici la couleur est du TEXTE sur un fond ambre
  //   pâle, et le seuil devient 4,5:1 :
  //
  //       #9A6B39 sur #F7F1E4 : 4,11:1   SOUS le seuil
  //       #9A6B39 sur #FEF6EC : 4,32:1   SOUS le seuil
  //       #8F5F00 sur #F7F1E4 : 4,90:1   conforme
  //
  //   Aligner la teinte ferait donc reculer l'accessibilité d'un texte qui est
  //   aujourd'hui conforme, pour gagner une cohérence que personne ne peut
  //   voir : le palier « significatif » du diagnostic n'a pas d'équivalent à
  //   l'écran, puisque ce mail part à un prospect qui n'a pas encore de
  //   tableau de bord. Ne pas « finir l'alignement » sans remesurer.
  warning: "#8f5f00",
  warningDoux: "#f7f1e4",
};

const POLICE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function echapper(texte: unknown): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Libellé de l'effectif tel qu'il a été choisi, ou une mention explicite. */
export function libelleEffectif(reponses: Reponses): string {
  return trouverOption("effectif", reponses.effectif)?.libelle ?? "effectif non précisé";
}

/* ==========================================================================
   1. La fiche interne — pour nous
   ========================================================================== */

/**
 * Sujet lisible dans une liste, sans ouvrir le message.
 *
 *   Diagnostic — 82 % — 26 à 75 personnes — Dupont / Acme
 *
 * ⚠ LE NOM EST EN FIN DE SUJET, ET C'EST VOULU. Le score et l'effectif
 *   décident si on rappelle ; le nom sert à retrouver le message une fois la
 *   décision prise. Dans une liste tronquée, c'est le score qu'on veut voir.
 *
 * ⚠ SANS COORDONNÉES, LE SUJET LE DIT. Un diagnostic anonyme et un diagnostic
 *   converti ne se traitent pas pareil ; un sujet identique obligerait à
 *   ouvrir chaque message pour faire le tri.
 */
export function sujetInterne(
  score: number,
  reponses: Reponses,
  coordonnees: Coordonnees | null,
): string {
  const qui = coordonnees
    ? `${coordonnees.nom || coordonnees.prenom} / ${coordonnees.entreprise}`
    : "sans coordonnées";

  return `Diagnostic — ${score} % — ${libelleEffectif(reponses)} personnes — ${qui}`;
}

/**
 * Corps de la fiche interne : une information par ligne, en texte simple.
 * Pas de HTML — il se lit aussi bien sur un téléphone que dans un client
 * texte, et rien n'y est mis en forme qui doive l'être.
 */
export function corpsInterne(
  score: number,
  reponses: Reponses,
  coordonnees: Coordonnees | null,
): string {
  const palier = palierDuScore(score);
  const offre = offrePourEffectif(reponses.effectif, OFFRES);

  const lignes: string[] = [
    `Score           : ${score} / 100`,
    `Palier          : ${LIBELLE_PALIER[palier]}`,
    `Offre déduite   : ${offre ? offre.nom : "—"}`,
    "",
    "LES RÉPONSES",
  ];

  // ⚠ ON PARCOURT `QUESTIONS`, PAS LES CLÉS REÇUES. Une question non répondue
  //   doit apparaître comme telle : son absence est une information.
  for (const question of QUESTIONS) {
    const valeur = reponses[question.cle];
    const option = trouverOption(question.cle, valeur);
    const rendu = option
      ? option.libelle + (option.poids ? ` (+${option.poids})` : "")
      : (valeur ?? "—");

    lignes.push(`  ${question.cle.padEnd(22)}: ${rendu}`);
  }

  const total = QUESTIONS_NOTEES.reduce(
    (somme, cle) => somme + (trouverOption(cle, reponses[cle])?.poids ?? 0),
    0,
  );
  lignes.push(
    "",
    `Somme des poids : ${total} (le score est borné à 35–95)`,
  );

  if (horsPerimetre(reponses)) {
    lignes.push(
      "",
      "⚠ HORS PÉRIMÈTRE — messagerie autre que Microsoft 365.",
      "  Le prospect en a été informé sur la page de résultat.",
    );
  }

  lignes.push("", "COORDONNÉES");
  if (coordonnees) {
    lignes.push(
      `  Contact         : ${coordonnees.prenom} ${coordonnees.nom}`,
      `  Entreprise      : ${coordonnees.entreprise}`,
      `  Email           : ${coordonnees.email}`,
      "",
      "— Répondre à ce message écrit directement au prospect.",
    );
  } else {
    lignes.push(
      "  Aucune. Le répondant n'a pas rempli le formulaire.",
      "",
      "  Si ses coordonnées arrivent ensuite, un second message suivra avec",
      "  le même score — c'est la même ligne en base, pas un doublon.",
    );
  }

  return lignes.join("\n");
}

/* ==========================================================================
   2. L'analyse — pour le prospect
   ========================================================================== */

export function sujetProspect(score: number): string {
  return `Votre diagnostic d'exposition à la fraude au virement — ${score} / 100`;
}

/** Version texte, servie en parallèle du HTML. */
export function texteProspect(
  score: number,
  reponses: Reponses,
  coordonnees: Coordonnees,
  c: ContexteEmail,
): string {
  const palier = palierDuScore(score);
  const offre = offrePourEffectif(reponses.effectif, OFFRES);

  const lignes: string[] = [
    `Bonjour ${coordonnees.prenom},`,
    "",
    `Voici l'analyse détaillée de votre diagnostic.`,
    "",
    `SCORE : ${score} / 100 — ${LIBELLE_PALIER[palier]}`,
    "",
    SYNTHESES[palier],
    "",
    "CE QUI PÈSE DANS VOTRE SCORE",
  ];

  for (const ligne of detailler(reponses)) {
    lignes.push(
      "",
      `• ${ligne.constat} (+${ligne.poids})`,
      `  ${ligne.implication}`,
      `  → ${ligne.reponse}`,
    );
  }

  if (horsPerimetre(reponses)) {
    lignes.push(
      "",
      "À SAVOIR",
      "Safentreprise se branche aujourd'hui sur Microsoft 365 uniquement.",
      "Votre score reste valable : il mesure votre exposition, pas votre outillage.",
    );
  }

  if (offre) {
    lignes.push("", `VOTRE OFFRE — ${offre.nom} (${offre.effectif})`);
    lignes.push(
      offre.prix
        ? `${formaterEuros(offre.prix.abonnementMensuel)} par mois, après un audit initial de ` +
            `${formaterEuros(offre.prix.auditInitial)} facturé une fois au démarrage. ` +
            `Montants hors taxes, engagement 12 mois.`
        : `Au-delà de 200 collaborateurs, l'offre est construite sur mesure. Nous consulter.`,
    );
  }

  lignes.push(
    "",
    `Pour en parler : ${c.siteUrl}/demo`,
    `Ou directement : ${c.contact}`,
    "",
    "L'équipe Safentreprise",
  );

  return lignes.join("\n");
}

/** Version HTML. */
export function htmlProspect(
  score: number,
  reponses: Reponses,
  coordonnees: Coordonnees,
  c: ContexteEmail,
): string {
  const palier = palierDuScore(score);
  const offre = offrePourEffectif(reponses.effectif, OFFRES);
  const lignes = detailler(reponses);

  const tonPalier =
    palier === "eleve"
      ? { fond: C.dangerDoux, texte: C.danger }
      : palier === "significatif"
        ? { fond: C.warningDoux, texte: C.warning }
        : { fond: C.ancreDoux, texte: C.secondaire };

  const blocs: string[] = [];

  // ---- Bandeau -------------------------------------------------------------
  blocs.push(
    `<tr><td style="background:${C.marine};padding:20px 28px;">` +
      `<div style="font-size:13px;font-weight:700;letter-spacing:0.04em;` +
      `color:#ffffff;">SAFENTREPRISE</div>` +
      `<div style="font-size:12px;color:#c3ccdb;margin-top:2px;">` +
      `Diagnostic d'exposition à la fraude au virement</div>` +
      `</td></tr>`,
  );

  // ---- Score ---------------------------------------------------------------
  blocs.push(
    `<tr><td style="padding:30px 28px 0 28px;">` +
      `<div style="font-size:14px;color:${C.secondaire};">` +
      `Bonjour ${echapper(coordonnees.prenom)},</div>` +
      `<div style="font-size:14px;color:${C.secondaire};margin-top:10px;">` +
      `Voici l'analyse détaillée de votre diagnostic.</div>` +
      `</td></tr>`,

    `<tr><td align="center" style="padding:26px 28px 0 28px;">` +
      `<div style="font-size:56px;line-height:1;font-weight:700;` +
      `letter-spacing:-0.03em;color:${C.encre};">${score}</div>` +
      `<div style="font-size:12px;color:${C.discret};margin-top:6px;">sur 100</div>` +
      `<div style="display:inline-block;margin-top:14px;padding:7px 14px;` +
      `border-radius:999px;background:${tonPalier.fond};color:${tonPalier.texte};` +
      `font-size:13px;font-weight:600;">${LIBELLE_PALIER[palier]}</div>` +
      `</td></tr>`,

    `<tr><td style="padding:22px 28px 0 28px;">` +
      `<div style="font-size:14px;line-height:1.6;color:${C.secondaire};">` +
      `${echapper(SYNTHESES[palier])}</div>` +
      `</td></tr>`,
  );

  // ---- Hors périmètre ------------------------------------------------------
  if (horsPerimetre(reponses)) {
    const messagerie =
      trouverOption("messagerie", reponses.messagerie)?.libelle ?? "votre messagerie";
    blocs.push(
      `<tr><td style="padding:20px 28px 0 28px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="width:100%;background:${C.warningDoux};border-radius:8px;">` +
        `<tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;` +
        `color:${C.encre};">` +
        `<strong style="color:${C.warning};">Nous ne couvrons pas encore ` +
        `${echapper(messagerie)}.</strong><br>` +
        `Votre score reste valable : il mesure votre exposition, pas votre ` +
        `outillage. La surveillance se branche aujourd'hui sur Microsoft&nbsp;365 ` +
        `uniquement.` +
        `</td></tr></table></td></tr>`,
    );
  }

  // ---- Le détail -----------------------------------------------------------
  blocs.push(
    `<tr><td style="padding:32px 28px 0 28px;">` +
      `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;` +
      `color:${C.discret};">Ce qui pèse dans votre score</div>` +
      `</td></tr>`,
  );

  for (const ligne of lignes) {
    blocs.push(
      `<tr><td style="padding:14px 28px 0 28px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="width:100%;border:1px solid ${C.trait};border-radius:10px;">` +
        `<tr><td style="padding:16px 18px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="width:100%;"><tr>` +
        `<td style="font-size:14px;font-weight:600;color:${C.encre};">` +
        `${echapper(ligne.constat)}</td>` +
        `<td align="right" style="font-size:12px;color:${C.discret};` +
        `white-space:nowrap;padding-left:10px;">+${ligne.poids}</td>` +
        `</tr></table>` +
        `<div style="font-size:13px;line-height:1.55;color:${C.secondaire};` +
        `margin-top:8px;">${echapper(ligne.implication)}</div>` +
        `<div style="font-size:13px;line-height:1.55;color:${C.encre};` +
        `margin-top:10px;padding-top:10px;border-top:1px solid ${C.trait};">` +
        `${echapper(ligne.reponse)}</div>` +
        `</td></tr></table></td></tr>`,
    );
  }

  // ---- L'offre -------------------------------------------------------------
  if (offre) {
    const prix = offre.prix
      ? `<div style="font-size:20px;font-weight:700;color:${C.encre};">` +
        `${formaterEuros(offre.prix.abonnementMensuel)}` +
        `<span style="font-size:13px;font-weight:400;color:${C.secondaire};">` +
        ` par mois</span></div>` +
        `<div style="font-size:13px;color:${C.secondaire};margin-top:6px;">` +
        `Après un audit initial de ${formaterEuros(offre.prix.auditInitial)}, ` +
        `facturé une fois au démarrage. Montants hors taxes, engagement 12 mois.` +
        `</div>`
      : `<div style="font-size:14px;line-height:1.55;color:${C.encre};">` +
        `Au-delà de 200 collaborateurs, l'offre est construite sur mesure. ` +
        `Nous consulter.</div>`;

    blocs.push(
      `<tr><td style="padding:32px 28px 0 28px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="width:100%;background:${C.ancreDoux};border-radius:10px;">` +
        `<tr><td style="padding:20px 18px;">` +
        `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;` +
        `color:${C.discret};">Votre offre</div>` +
        `<div style="font-size:17px;font-weight:700;color:${C.encre};margin-top:6px;">` +
        `${echapper(offre.nom)}` +
        `<span style="font-size:13px;font-weight:400;color:${C.secondaire};"> — ` +
        `${echapper(offre.effectif)}</span></div>` +
        `<div style="margin-top:14px;">${prix}</div>` +
        `</td></tr></table></td></tr>`,
    );
  }

  // ---- Action et pied ------------------------------------------------------
  blocs.push(
    `<tr><td style="padding:26px 28px 0 28px;">` +
      `<a href="${echapper(c.siteUrl)}/demo" ` +
      `style="display:inline-block;background:${C.ancre};color:#ffffff;` +
      `text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;` +
      `border-radius:8px;">Demander une démonstration</a>` +
      `</td></tr>`,

    `<tr><td style="padding:24px 28px 28px 28px;">` +
      `<div style="border-top:1px solid ${C.trait};padding-top:16px;` +
      `font-size:12px;line-height:1.6;color:${C.discret};">` +
      `Vous recevez ce message parce que vous avez demandé votre analyse ` +
      `détaillée sur ${echapper(c.siteUrl)}/diagnostic. ` +
      `Une question : <a href="mailto:${echapper(c.contact)}" ` +
      `style="color:${C.ancre};">${echapper(c.contact)}</a>.` +
      `</div></td></tr>`,
  );

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;background:${C.fond};margin:0;padding:24px 0;">` +
    `<tr><td align="center" style="padding:0 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;background:${C.carte};` +
    `border-radius:12px;overflow:hidden;font-family:${POLICE};">` +
    blocs.join("") +
    `</table></td></tr></table>`
  );
}
