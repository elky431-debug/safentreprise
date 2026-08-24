#!/usr/bin/env node
/**
 * Spike Safentreprise — injection d'une bannière d'alerte dans un mail
 * Microsoft 365, côté serveur, via Microsoft Graph.
 *
 * Ce n'est PAS du code de production : aucune gestion multi-client, aucun
 * cache de jeton, aucune reprise sur erreur. Le but est de répondre à une
 * seule question : est-ce que Graph accepte de modifier le corps d'un mail
 * déjà reçu, et à quoi ça ressemble dans Outlook ?
 *
 * Commandes :
 *   node index.js list             liste les 10 derniers mails
 *   node index.js backup <index>   sauvegarde le corps original
 *   node index.js inject <index>   injecte la bannière en haut du corps
 *   node index.js restore <index>  restaure le corps original
 *
 * Zéro dépendance : Node 18+ suffit (fetch est intégré).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = dirname(fileURLToPath(import.meta.url));
const FICHIER_INDEX = join(RACINE, ".messages.json");
const DOSSIER_BACKUPS = join(RACINE, "backups");

/** Marqueur invisible : permet de reconnaître un mail déjà traité. */
const MARQUEUR = "<!--SAFENTREPRISE-BANNIERE-->";

/* ==========================================================================
   Configuration
   ========================================================================== */

/** Lit le fichier .env sans dépendance externe. */
function lireEnv() {
  const chemin = join(RACINE, ".env");
  if (!existsSync(chemin)) {
    throw new Error(
      "Fichier .env introuvable.\n" +
        "  → Copie .env.example en .env, puis colle la valeur du secret client.",
    );
  }

  const config = {};
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith("#")) continue;

    const separateur = propre.indexOf("=");
    if (separateur === -1) continue;

    const cle = propre.slice(0, separateur).trim();
    const valeur = propre
      .slice(separateur + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    config[cle] = valeur;
  }

  const requis = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET", "MAILBOX"];
  const manquants = requis.filter((c) => !config[c]);
  if (manquants.length) {
    throw new Error(`Valeurs manquantes dans .env : ${manquants.join(", ")}`);
  }
  if (config.CLIENT_SECRET.startsWith("colle-ici")) {
    throw new Error(
      "CLIENT_SECRET n'a pas été renseigné dans .env.\n" +
        "  → Colle la colonne « Valeur » du secret, pas l'« ID de secret ».",
    );
  }

  return config;
}

/* ==========================================================================
   Authentification
   ========================================================================== */

/**
 * Récupère un jeton d'application (client credentials).
 * Aucun utilisateur connecté : l'app agit seule, avec les permissions
 * consenties par l'administrateur.
 */
async function obtenirJeton(config) {
  const url = `https://login.microsoftonline.com/${config.TENANT_ID}/oauth2/v2.0/token`;

  const corps = new URLSearchParams({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  console.log(`\n[auth] POST ${url}`);

  const reponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
  });

  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    console.error(`\n❌ Authentification refusée (HTTP ${reponse.status})`);
    console.error(`   Code Microsoft : ${donnees.error ?? "inconnu"}`);
    console.error(`   Message        : ${donnees.error_description ?? "—"}`);
    console.error("\n   Causes probables :");
    console.error("   • CLIENT_SECRET faux, expiré, ou c'est l'ID au lieu de la valeur");
    console.error("   • TENANT_ID ou CLIENT_ID incorrect");
    process.exit(1);
  }

  console.log("[auth] jeton obtenu ✓");
  return donnees.access_token;
}

/* ==========================================================================
   Appels Graph
   ========================================================================== */

/** Traduit un code HTTP en explication lisible. */
function expliquerErreur(status, codeMicrosoft) {
  if (codeMicrosoft === "MailboxNotEnabledForRESTAPI") {
    return [
      "La boîte visée n'a pas de licence Exchange Online active.",
      "→ Vérifie dans le centre d'administration Microsoft 365 que le compte",
      "  possède bien une licence avec Exchange, et qu'il s'est connecté au",
      "  moins une fois à Outlook pour que la boîte soit créée.",
    ].join("\n     ");
  }

  switch (status) {
    case 400:
      return "Requête mal formée. Souvent un identifiant tronqué, ou un JSON invalide.";
    case 401:
      return "Jeton refusé ou expiré. Relance la commande ; si ça persiste, le secret est en cause.";
    case 403:
      return [
        "Permission refusée. Trois causes possibles :",
        "• la permission Mail.ReadWrite n'a pas été ajoutée en « Autorisations d'application »",
        "  (et non « déléguées ») ;",
        "• le consentement administrateur n'a pas été accordé — le statut doit être",
        "  vert dans le portail, pas orange ;",
        "• à partir du 31/12/2026, modifier le corps d'un mail reçu exigera en plus",
        "  Mail-Advanced.ReadWrite.",
      ].join("\n     ");
    case 404:
      return "Boîte ou message introuvable. Vérifie MAILBOX, ou relance « list » : le mail a pu être déplacé.";
    case 405:
      return [
        "Méthode non autorisée sur cette URL. Dans 9 cas sur 10, l'identifiant",
        "du message est vide ou tronqué : l'URL se termine alors par /messages",
        "et PATCH n'existe pas sur une collection.",
        "→ Regarde l'URL loguée juste au-dessus : elle doit finir par un long",
        "  identifiant encodé, pas par « /messages ».",
      ].join("\n     ");
    case 409:
    case 412:
      return "Conflit : le message a changé entre-temps. Relance « list » puis réessaie.";
    case 429:
      return "Trop de requêtes. Attends une minute et réessaie.";
    case 503:
    case 504:
      return "Microsoft Graph est momentanément indisponible. Réessaie dans quelques instants.";
    default:
      return "Erreur non répertoriée — le message Microsoft ci-dessus est le plus utile.";
  }
}

/**
 * Appelle Graph en loguant systématiquement l'URL complète.
 * C'est ce log qui permet de diagnostiquer les erreurs 405.
 */
async function appelGraph(jeton, methode, url, corps) {
  console.log(`\n[graph] ${methode} ${url}`);

  const options = {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}` },
  };

  if (corps !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(corps);
  }

  const reponse = await fetch(url, options);

  // 204 No Content : succès sans corps de réponse
  if (reponse.status === 204) {
    console.log("[graph] 204 ✓");
    return null;
  }

  const texte = await reponse.text();
  let donnees = null;
  try {
    donnees = texte ? JSON.parse(texte) : null;
  } catch {
    donnees = null;
  }

  if (!reponse.ok) {
    const erreur = donnees?.error ?? {};
    console.error(`\n❌ HTTP ${reponse.status} ${reponse.statusText}`);
    console.error(`   Code Microsoft : ${erreur.code ?? "—"}`);
    const detail = erreur.message ?? (texte.slice(0, 400) || "—");
    console.error(`   Message        : ${detail}`);
    console.error(`\n   Ce que ça veut probablement dire :`);
    console.error(`     ${expliquerErreur(reponse.status, erreur.code)}`);
    process.exit(1);
  }

  console.log(`[graph] ${reponse.status} ✓`);
  return donnees;
}

/* ==========================================================================
   La bannière
   ========================================================================== */

/**
 * Bannière d'alerte, en HTML inline uniquement.
 *
 * Contraintes des clients mail, toutes volontaires :
 * • aucune feuille de style externe, aucune balise <style>, aucun JavaScript —
 *   ils sont supprimés à l'affichage ;
 * • une <table> et pas des <div> : Outlook sur Windows utilise le moteur de
 *   rendu de Word, qui ignore une bonne partie du CSS mais respecte les
 *   tableaux ;
 * • la barre rouge à gauche est une cellule de tableau, pas un border-left,
 *   pour la même raison ;
 * • couleurs forcées sur CHAQUE élément, texte comme fond, et attribut
 *   bgcolor en plus du style : sans ça, le mode sombre d'Outlook mobile
 *   inverse le fond et rend le texte illisible.
 */
function construireBanniere(signaux) {
  const lignes = signaux
    .map(
      (signal) =>
        `<tr><td style="padding:2px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;">` +
        `<span style="color:#B91C1C;">&#8226;</span>&nbsp;${signal}</td></tr>`,
    )
    .join("");

  return `${MARQUEUR}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px 0;">
  <tr>
    <td width="6" bgcolor="#B91C1C" style="width:6px;background-color:#B91C1C;font-size:0;line-height:0;">&nbsp;</td>
    <td bgcolor="#FEE2E2" style="background-color:#FEE2E2;padding:14px 18px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 8px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;line-height:20px;">
            &#9888; Safentreprise &#8212; Expéditeur suspect
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;">
            Ce message présente plusieurs signes d&#39;usurpation d&#39;identité&nbsp;:
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${lignes}
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FCA5A5" style="background-color:#FCA5A5;padding:9px 12px;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;">
            <strong style="color:#7F1D1D;">Que faire&nbsp;?</strong>
            Ne répondez pas et n&#39;effectuez aucun virement. Vérifiez par téléphone,
            sur un numéro que vous connaissez déjà.
          </td>
        </tr>
        <tr>
          <td style="padding:9px 0 0 0;color:#991B1B;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:16px;">
            Analyse automatique Safentreprise
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`;
}

/** Signaux d'exemple — remplacés par le moteur de détection en production. */
const SIGNAUX_TEST = [
  "Le nom affiché imite celui d&#39;un dirigeant de votre entreprise.",
  "L&#39;adresse d&#39;envoi utilise un domaine grand public, pas le domaine de la société.",
  "Le message évoque un virement urgent et confidentiel.",
  "L&#39;adresse de réponse est différente de l&#39;adresse d&#39;expédition.",
];

/**
 * Insère la bannière en haut du corps, sans toucher au contenu existant.
 * Si le HTML contient une balise <body>, on insère juste après ; sinon on
 * place la bannière devant. Dans les deux cas le message d'origine reste
 * intégralement en dessous.
 */
function injecterDansCorps(contenu, banniere) {
  const ouverture = contenu.match(/<body[^>]*>/i);
  if (ouverture) {
    const position = ouverture.index + ouverture[0].length;
    return contenu.slice(0, position) + banniere + contenu.slice(position);
  }
  return banniere + contenu;
}

/* ==========================================================================
   Index court -> identifiant Microsoft
   ========================================================================== */

function chargerIndex() {
  if (!existsSync(FICHIER_INDEX)) {
    throw new Error(
      "Aucune liste en mémoire.\n  → Lance d'abord : node index.js list",
    );
  }
  return JSON.parse(readFileSync(FICHIER_INDEX, "utf8"));
}

function resoudreIndex(argument) {
  const numero = Number.parseInt(argument, 10);
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error(
      `Index invalide : « ${argument} ». Attendu : un nombre entier (1, 2, 3…).`,
    );
  }

  const messages = chargerIndex();
  const message = messages[numero - 1];
  if (!message) {
    throw new Error(
      `Index ${numero} inconnu — la liste en contient ${messages.length}.\n` +
        "  → Relance : node index.js list",
    );
  }
  return message;
}

function cheminBackup(numero) {
  return join(DOSSIER_BACKUPS, `mail-${numero}.json`);
}

/* ==========================================================================
   Commandes
   ========================================================================== */

async function commandeList(config, jeton) {
  const boite = encodeURIComponent(config.MAILBOX);
  const parametres =
    "$top=10" +
    "&$select=id,subject,from,receivedDateTime,isDraft" +
    "&$orderby=receivedDateTime desc";

  const url = `https://graph.microsoft.com/v1.0/users/${boite}/mailFolders/inbox/messages?${parametres}`;
  const donnees = await appelGraph(jeton, "GET", url);

  const messages = (donnees.value ?? []).map((m) => ({
    id: m.id,
    objet: m.subject ?? "(sans objet)",
    expediteur: m.from?.emailAddress?.address ?? "(inconnu)",
    date: m.receivedDateTime,
    brouillon: m.isDraft === true,
  }));

  writeFileSync(FICHIER_INDEX, JSON.stringify(messages, null, 2));

  console.log(`\n${messages.length} message(s) dans ${config.MAILBOX} :\n`);
  messages.forEach((m, i) => {
    const date = new Date(m.date).toLocaleString("fr-FR");
    const marque = m.brouillon ? "  [BROUILLON]" : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${m.objet}${marque}`);
    console.log(`      de ${m.expediteur} — ${date}`);
  });

  console.log(
    "\nUtilise le numéro de gauche dans les autres commandes, par exemple :",
  );
  console.log("  node index.js backup 1");
}

async function commandeBackup(config, jeton, numero) {
  const message = resoudreIndex(numero);
  const boite = encodeURIComponent(config.MAILBOX);
  const identifiant = encodeURIComponent(message.id);

  const url = `https://graph.microsoft.com/v1.0/users/${boite}/messages/${identifiant}?$select=id,subject,body,isDraft`;
  const donnees = await appelGraph(jeton, "GET", url);

  if (!existsSync(DOSSIER_BACKUPS)) mkdirSync(DOSSIER_BACKUPS);

  const sauvegarde = {
    index: Number(numero),
    id: donnees.id,
    objet: donnees.subject,
    estBrouillon: donnees.isDraft,
    sauvegardeLe: new Date().toISOString(),
    corps: donnees.body, // { contentType, content }
  };

  const chemin = cheminBackup(numero);
  writeFileSync(chemin, JSON.stringify(sauvegarde, null, 2));

  console.log(`\n✓ Corps original sauvegardé`);
  console.log(`  Objet   : ${donnees.subject}`);
  console.log(`  Format  : ${donnees.body?.contentType}`);
  console.log(`  Taille  : ${donnees.body?.content?.length ?? 0} caractères`);
  console.log(`  Fichier : ${chemin}`);
}

async function commandeInject(config, jeton, numero) {
  const message = resoudreIndex(numero);
  const boite = encodeURIComponent(config.MAILBOX);
  const identifiant = encodeURIComponent(message.id);

  // Sécurité : on ne modifie jamais un mail sans sauvegarde préalable.
  if (!existsSync(cheminBackup(numero))) {
    console.log("\nAucune sauvegarde trouvée — je la fais maintenant.");
    await commandeBackup(config, jeton, numero);
  }

  const urlLecture = `https://graph.microsoft.com/v1.0/users/${boite}/messages/${identifiant}?$select=id,body,isDraft`;
  const actuel = await appelGraph(jeton, "GET", urlLecture);

  const contenuActuel = actuel.body?.content ?? "";
  const formatActuel = actuel.body?.contentType ?? "html";

  if (contenuActuel.includes(MARQUEUR)) {
    console.log(
      "\n⚠ Ce message contient déjà une bannière Safentreprise. Rien n'a été modifié.",
    );
    console.log("  → Pour recommencer : node index.js restore " + numero);
    return;
  }

  // Un mail en texte brut doit passer en HTML pour accepter la bannière.
  let base = contenuActuel;
  if (formatActuel.toLowerCase() === "text") {
    console.log(
      "\n[info] Le message est en texte brut : conversion en HTML pour permettre la mise en forme.",
    );
    const echappe = contenuActuel
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    base = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;white-space:pre-wrap;">${echappe}</div>`;
  }

  const nouveauContenu = injecterDansCorps(
    base,
    construireBanniere(SIGNAUX_TEST),
  );

  const urlEcriture = `https://graph.microsoft.com/v1.0/users/${boite}/messages/${identifiant}`;
  await appelGraph(jeton, "PATCH", urlEcriture, {
    body: { contentType: "HTML", content: nouveauContenu },
  });

  console.log(`\n✓ Bannière injectée dans « ${message.objet} »`);
  console.log(`  Corps original conservé intégralement en dessous.`);
  console.log(`  Ouvre Outlook (web, bureau, mobile) pour vérifier l'affichage.`);
  console.log(`\n  Pour annuler : node index.js restore ${numero}`);
}

async function commandeRestore(config, jeton, numero) {
  const chemin = cheminBackup(numero);
  if (!existsSync(chemin)) {
    throw new Error(
      `Aucune sauvegarde pour l'index ${numero} (${chemin} absent).\n` +
        "  → Le corps original n'est plus récupérable par ce script.",
    );
  }

  const sauvegarde = JSON.parse(readFileSync(chemin, "utf8"));
  const boite = encodeURIComponent(config.MAILBOX);
  const identifiant = encodeURIComponent(sauvegarde.id);

  const url = `https://graph.microsoft.com/v1.0/users/${boite}/messages/${identifiant}`;
  await appelGraph(jeton, "PATCH", url, {
    body: {
      contentType: sauvegarde.corps.contentType,
      content: sauvegarde.corps.content,
    },
  });

  console.log(`\n✓ Corps original restauré pour « ${sauvegarde.objet} »`);
}

/* ==========================================================================
   Point d'entrée
   ========================================================================== */

const AIDE = `
Spike Safentreprise — bannière d'alerte via Microsoft Graph

  node index.js list             liste les 10 derniers mails de la boîte
  node index.js backup <index>   sauvegarde le corps original d'un mail
  node index.js inject <index>   injecte la bannière en haut du corps
  node index.js restore <index>  restaure le corps original

L'index est le petit numéro affiché par « list » (1, 2, 3…).
`;

async function principal() {
  const [commande, argument] = process.argv.slice(2);

  if (!commande || commande === "--help" || commande === "-h") {
    console.log(AIDE);
    return;
  }

  // On valide la commande avant de toucher au .env : inutile de réclamer un
  // secret pour une faute de frappe.
  if (!["list", "backup", "inject", "restore"].includes(commande)) {
    console.error(`Commande inconnue : « ${commande} »`);
    console.log(AIDE);
    process.exit(1);
  }

  const config = lireEnv();
  const jeton = await obtenirJeton(config);

  switch (commande) {
    case "list":
      await commandeList(config, jeton);
      break;
    case "backup":
      if (!argument) throw new Error("Index manquant : node index.js backup 1");
      await commandeBackup(config, jeton, argument);
      break;
    case "inject":
      if (!argument) throw new Error("Index manquant : node index.js inject 1");
      await commandeInject(config, jeton, argument);
      break;
    case "restore":
      if (!argument) throw new Error("Index manquant : node index.js restore 1");
      await commandeRestore(config, jeton, argument);
      break;
    default:
      console.error(`Commande inconnue : « ${commande} »`);
      console.log(AIDE);
      process.exit(1);
  }
}

// Ne lance la ligne de commande que si le fichier est exécuté directement,
// pour qu'un script de test puisse importer la bannière sans tout déclencher.
const executeDirectement =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executeDirectement) {
  principal().catch((erreur) => {
    console.error(`\n❌ ${erreur.message}`);
    process.exit(1);
  });
}

export { construireBanniere, injecterDansCorps, SIGNAUX_TEST, MARQUEUR };
