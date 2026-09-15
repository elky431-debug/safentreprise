/**
 * La santé des raccordements, constatée toutes les trente minutes.
 *
 *   POST  (secret partagé)   sonde chaque locataire et écrit son état
 *   GET   (secret partagé)   idem — pratique pour déclencher depuis un navigateur
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ CE QUE CETTE ROUTE RÉPARE. `maj_sante_tenant` et `tenants_a_verifier`
 *   existaient depuis 20260907 sans qu'aucun appelant ne les touche. Rien
 *   n'écrivait donc jamais « revoque » : un administrateur qui retirait
 *   l'autorisation Microsoft arrêtait toute la chaîne d'analyse, et l'écran
 *   continuait d'annoncer « n boîtes surveillées » jusqu'à l'expiration
 *   naturelle des abonnements — près de sept jours.
 *
 * ⚠ UN LOCATAIRE PAR REQUÊTE, JAMAIS EN LOT. `constater_sante_tenant` rend
 *   `bascule`, qui commande l'envoi des mails. Plusieurs appels réunis dans UNE
 *   SEULE instruction SQL partagent le même instantané : chacun lit l'état
 *   d'AVANT l'instruction, et tous rendent `bascule = true`. Mesuré sur
 *   Postgres 16 — cinq appels dans un `LATERAL` ont rendu cinq bascules là où
 *   il n'y en avait qu'une. En appels séparés, c'est juste. Chaque appel part
 *   donc dans sa propre requête PostgREST, et il faut que cela le reste : un
 *   regroupement « pour optimiser » enverrait une rafale de mails de
 *   révocation à chaque passage.
 *
 * ⚠ LA SONDE PASSE AVANT TOUTE ÉCRITURE. On sonde tout le parc, PUIS on écrit.
 *   C'est ce qui permet de reconnaître une panne générale — secret expiré,
 *   variable perdue au déploiement — avant d'avoir marqué le premier client.
 *
 * ⚠ CETTE ROUTE NE DOIT PAS ÊTRE OUVERTE. Elle lit l'état de tous les
 *   locataires et peut déclencher des mails à des clients. Même garde que le
 *   worker et la maintenance : le secret partagé, posé par
 *   `appeler_route_interne` dans l'en-tête `x-safentreprise-worker`.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { rpcService } from "@/lib/microsoft/consentement";
import { panneGenerale, sonder, type Verdict } from "@/lib/microsoft/sante";
import { avecContexteJournal } from "@/lib/microsoft/journal";
import { envoyerEmail } from "@/lib/send/email";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Locataires examinés par passage. Au-delà, le suivant reprendra la file. */
const LOT = 50;

/** Les variables d'expédition, dans l'ordre de préférence. */
const VARIABLES_EXPEDITEUR = ["VEILLE_FROM_EMAIL", "SIMULATION_FROM_EMAIL"];

const EMAIL_CONTACT = "contact@safentreprise.com";

type Locataire = {
  tenant_uid: string;
  tenant_id: string;
  company_id: string | null;
  statut: string;
};

type Constatation = {
  statut_avant: string;
  statut_apres: string;
  bascule: boolean;
  echecs: number;
};

type Bilan = {
  tenant_uid: string;
  societe: string | null;
  verdict: Verdict;
  statut_avant: string;
  statut_apres: string;
  bascule: boolean;
  detail: string;
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/* ==========================================================================
   Lecture de service
   ========================================================================== */

/**
 * Lecture d'une table avec la clé de service.
 *
 * ⚠ LA CLÉ DE SERVICE CONTOURNE LA RLS, ET C'EST INDISPENSABLE ICI. Cette
 *   route n'a pas de session : elle est déclenchée par la base elle-même, pour
 *   TOUS les locataires. Aucune politique RLS ne peut lui rendre ces lignes.
 */
async function lireService<T>(chemin: string): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.");
  }

  const reponse = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    cache: "no-store",
  });

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Lecture ${chemin} : HTTP ${reponse.status} — ${texte.slice(0, 200)}`);
  }
  return (texte.trim() === "" ? [] : JSON.parse(texte)) as T[];
}

/**
 * La boîte que la sonde va essayer de lire.
 *
 * ⚠ ELLE DOIT ÊTRE `choisie` ET `actif`. Une boîte simplement cochée n'a jamais
 *   été autorisée par la restriction : Microsoft la refuserait pour une raison
 *   parfaitement légitime, et la sonde conclurait à une révocation qui n'a pas
 *   eu lieu. On ne sonde que ce qui DOIT répondre.
 */
async function boiteSonde(tenantUid: string): Promise<string | null> {
  const lignes = await lireService<{ graph_user_id: string }>(
    `boites_surveillees?tenant_uid=eq.${encodeURIComponent(tenantUid)}` +
      `&choisie=is.true&actif=is.true&select=graph_user_id&limit=1`,
  );
  return lignes[0]?.graph_user_id ?? null;
}

async function societeDe(companyId: string | null): Promise<{
  nom: string | null;
  email: string | null;
}> {
  if (!companyId) return { nom: null, email: null };
  const lignes = await lireService<{ nom: string; email_responsable: string }>(
    `companies?id=eq.${encodeURIComponent(companyId)}&select=nom,email_responsable&limit=1`,
  );
  return {
    nom: lignes[0]?.nom ?? null,
    email: lignes[0]?.email_responsable ?? null,
  };
}

/* ==========================================================================
   Les mails
   ========================================================================== */

async function envoyer(to: string, objet: string, texte: string): Promise<string | null> {
  const from = expediteurVerifie(VARIABLES_EXPEDITEUR);
  if (!from) return erreurExpediteur(VARIABLES_EXPEDITEUR);

  const r = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to,
    subject: objet,
    text: texte,
    replyTo: EMAIL_CONTACT,
  });
  return r.ok ? null : r.erreur;
}

/**
 * L'alerte interne — à chaque bascule, dans les deux sens.
 *
 * ⚠ À LA BASCULE SEULEMENT. Envoyer à chaque vérification ferait 48 mails par
 *   jour et par locataire en panne ; on cesserait de les lire, ce qui revient à
 *   ne pas les envoyer du tout.
 */
function texteInterne(b: Bilan): string {
  return [
    `Locataire : ${b.societe ?? "société inconnue"} (${b.tenant_uid})`,
    `Statut : ${b.statut_avant} → ${b.statut_apres}`,
    `Verdict de la sonde : ${b.verdict}`,
    "",
    `Détail Microsoft : ${b.detail || "sans détail"}`,
    "",
    b.statut_apres === "revoque"
      ? "PLUS AUCUN MESSAGE N'EST ANALYSÉ pour ce client. L'accord doit être " +
        "redonné depuis sa page Microsoft 365."
      : b.statut_apres === "erreur"
        ? "La surveillance est incertaine. Si c'est passager, la prochaine " +
          "vérification rétablira le statut toute seule."
        : "Retour à la normale, rien à faire.",
  ].join("\n");
}

/**
 * L'alerte au dirigeant — révocation uniquement.
 *
 * ⚠ JAMAIS SUR « erreur ». C'est passager par construction, et le plus souvent
 *   notre problème ou celui de Microsoft. Un mail à chaque hoquet apprendrait
 *   au dirigeant à ignorer nos alertes — et le jour de la vraie révocation, il
 *   ne la lirait pas.
 *
 * ⚠ AUCUNE DONNÉE PERSONNELLE DANS LE CORPS. Un statut, une date, une marche à
 *   suivre. La seule donnée nominative est l'adresse du destinataire, qui sort
 *   déjà vers Resend au titre de l'alerte de fraude (AIPD § 1.5 bis).
 */
function texteDirigeant(societe: string | null): string {
  return [
    `Bonjour,`,
    "",
    `La surveillance Safentreprise de votre messagerie Microsoft 365 est ` +
      `ARRÊTÉE${societe ? ` pour ${societe}` : ""}.`,
    "",
    `L'autorisation que votre administrateur avait accordée à Safentreprise a ` +
      `été retirée dans votre annuaire Microsoft. Depuis, plus aucun message ` +
      `n'est analysé, et aucune tentative de fraude n'est signalée.`,
    "",
    `Nous l'avons constaté automatiquement — vous n'avez rien fait de mal, et ` +
      `nous ne pouvons pas le rétablir depuis chez nous : seul un ` +
      `administrateur de votre organisation peut redonner l'accord.`,
    "",
    `POUR RÉTABLIR LA SURVEILLANCE`,
    `Connectez-vous à votre espace Safentreprise, page « Microsoft 365 », et ` +
      `suivez le bouton « Autoriser chez Microsoft ». Vos boîtes déjà ` +
      `choisies et la restriction déjà vérifiée sont conservées : il n'y a pas ` +
      `tout à refaire.`,
    "",
    `Si vous n'êtes pas à l'origine de ce retrait, vérifiez auprès de votre ` +
      `administrateur qu'il s'agit bien d'une décision voulue.`,
    "",
    `L'équipe Safentreprise`,
  ].join("\n");
}

/* ==========================================================================
   Le passage
   ========================================================================== */

async function executer() {
  const locataires =
    (await rpcService<Locataire[]>("tenants_a_verifier", { p_limite: LOT })) ?? [];

  if (locataires.length === 0) {
    return Response.json({ locataires: 0, message: "Aucun locataire à vérifier." });
  }

  // --- 1. Sonder tout le parc, sans rien écrire -----------------------------
  const sondes: { l: Locataire; verdict: Verdict; detail: string }[] = [];

  for (const l of locataires) {
    let graphUserId: string | null = null;
    try {
      graphUserId = await boiteSonde(l.tenant_uid);
    } catch (erreur) {
      // Une base injoignable n'est pas un problème d'autorisation.
      sondes.push({ l, verdict: "passager", detail: messageDe(erreur) });
      continue;
    }
    const constat = await sonder(l.tenant_id, graphUserId);
    sondes.push({ l, verdict: constat.verdict, detail: constat.detail });
  }

  // --- 2. Le garde-fou de la panne générale ---------------------------------
  //
  // ⚠ SANS LUI, UN SECRET EXPIRÉ MARQUERAIT TOUT LE PARC « RÉVOQUÉ » EN TROIS
  //   PASSAGES, et enverrait à chaque client un mail lui annonçant que son
  //   administrateur a retiré son accord. Ce serait faux, et irrattrapable.
  const generale = panneGenerale(sondes.map((s) => s.verdict));
  if (generale) {
    for (const s of sondes) {
      if (s.verdict === "definitif") {
        s.verdict = "passager";
        s.detail = `[panne générale probable, révocation non retenue] ${s.detail}`;
      }
    }
  }

  // --- 3. Écrire, un locataire par requête ----------------------------------
  //
  // ⚠ LA BOUCLE NE SE REGROUPE PAS. Voir l'avertissement en tête de fichier :
  //   plusieurs `constater_sante_tenant` dans une même instruction SQL
  //   partagent un instantané et rendent tous `bascule = true`.
  const bilans: Bilan[] = [];

  for (const s of sondes) {
    const lignes = await rpcService<Constatation[]>("constater_sante_tenant", {
      p_tenant_uid: s.l.tenant_uid,
      p_verdict: s.verdict,
      p_detail: s.detail,
    });
    const c = (Array.isArray(lignes) ? lignes[0] : lignes) as Constatation | undefined;
    if (!c) continue;

    const societe = await societeDe(s.l.company_id);

    bilans.push({
      tenant_uid: s.l.tenant_uid,
      societe: societe.nom,
      verdict: s.verdict,
      statut_avant: c.statut_avant,
      statut_apres: c.statut_apres,
      bascule: c.bascule,
      detail: s.detail,
    });

    if (!c.bascule) continue;

    // Interne, sur toute bascule.
    const erreurInterne = await envoyer(
      process.env.VEILLE_DESTINATAIRE?.trim() || EMAIL_CONTACT,
      `[Safentreprise] ${societe.nom ?? "Un client"} — surveillance ${c.statut_apres}`,
      texteInterne(bilans[bilans.length - 1]),
    );
    if (erreurInterne) console.error("[sante] alerte interne :", erreurInterne);

    // Dirigeant, sur révocation seulement.
    if (c.statut_apres === "revoque" && societe.email) {
      const erreurClient = await envoyer(
        societe.email,
        "Votre surveillance Safentreprise est arrêtée",
        texteDirigeant(societe.nom),
      );
      if (erreurClient) console.error("[sante] alerte dirigeant :", erreurClient);
    }
  }

  return Response.json({
    locataires: locataires.length,
    panne_generale: generale,
    bascules: bilans.filter((b) => b.bascule).length,
    bilans,
  });
}

/* ==========================================================================
   Entrées
   ========================================================================== */

/** Le secret partagé protège le déclenchement. Même garde que le worker. */
function autorise(request: Request): boolean {
  const attendu = process.env.WORKER_SECRET;
  if (!attendu) return false;

  const fourni =
    request.headers.get("x-safentreprise-worker") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  return fourni === attendu;
}

async function postInterne(request: Request) {
  if (!autorise(request)) {
    return new Response("non autorisé", { status: 401 });
  }

  try {
    return await executer();
  } catch (erreur) {
    const detail = messageDe(erreur);
    console.error("[sante] échec global :", detail);
    return Response.json({ erreur: detail }, { status: 500 });
  }
}

/** Même traitement en GET, pour pouvoir déclencher depuis un navigateur. */
export async function GET(request: Request) {
  return POST(request);
}

/**
 * Tout accès Microsoft déclenché ici est attribué à « sante ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function POST(request: Request) {
  return avecContexteJournal(
    { acteur: "sante", tache: "verification-raccordement" },
    () => postInterne(request),
  );
}
