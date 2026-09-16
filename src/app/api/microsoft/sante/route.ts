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
 * ⚠ DÉLAI RÉEL ENTRE LA COUPURE ET L'AFFICHAGE : JUSQU'À DEUX HEURES. MESURÉ,
 *   PAS ESTIMÉ. C'est un engagement commercial — ne pas l'arrondir à la baisse
 *   en le récitant, et ne pas le recalculer de tête : il se décompose ainsi.
 *
 *     révocation réelle du rôle Exchange       T
 *     Exchange cesse d'honorer l'accès        ~ T + 30 min
 *     première sonde en échec                  T + 30 à 60 min
 *     bascule, au 3ᵉ échec consécutif          T + 90 à 120 min
 *
 *   Les 30 premières minutes ne sont PAS de notre fait : Exchange continue de
 *   servir l'accès après `Remove-ManagementRoleAssignment`. Mesuré sur le
 *   locataire Safentreprise le 15 septembre 2026 — le dépôt annonçait déjà
 *   « jusqu'à une heure de propagation » dans `restriction.ts`, ce qui est
 *   cohérent. Le reste vient de nous : une passe toutes les 30 minutes, et
 *   trois échecs consécutifs exigés avant de basculer.
 *
 *   ⚠ LES TROIS ÉCHECS NE SONT PAS NÉGOCIABLES CONTRE CE DÉLAI. Descendre à un
 *     seul échec ferait gagner une heure et annoncerait « surveillance
 *     interrompue » à un client au premier incident réseau de Microsoft. Une
 *     fausse alerte coûte plus cher que soixante minutes.
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
import {
  panneGenerale,
  sonder,
  type Constat,
  type Portee,
  type Verdict,
} from "@/lib/microsoft/sante";
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
  portee: Portee | null;
  annuaire_bascule: boolean;
  annuaire_coupe: boolean;
};

type Bilan = {
  tenant_uid: string;
  societe: string | null;
  verdict: Verdict;
  portee: Portee | null;
  statut_avant: string;
  statut_apres: string;
  bascule: boolean;
  annuaire_coupe: boolean;
  annuaire_bascule: boolean;
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
    `Porte : ${b.portee ?? (b.annuaire_coupe ? "annuaire" : "—")}`,
    `Verdict de la sonde : ${b.verdict}`,
    "",
    `Détail Microsoft : ${b.detail || "sans détail"}`,
    "",
    conduiteInterne(b),
  ].join("\n");
}

function conduiteInterne(b: Bilan): string {
  if (b.statut_apres === "revoque" && b.portee === "tout") {
    return (
      "TOUT COUPÉ — plus aucun message n'est analysé. L'application a " +
      "probablement été supprimée du locataire : le client doit reprendre le " +
      "parcours depuis le consentement, PUIS refaire exécuter le script."
    );
  }
  if (b.statut_apres === "revoque") {
    return (
      "COURRIER COUPÉ — plus aucun message n'est analysé. C'est l'attribution " +
      "de rôle Exchange qui a sauté : refaire le consentement Entra n'y " +
      "changerait RIEN, il faut réexécuter le script PowerShell de l'étape 3."
    );
  }
  if (b.annuaire_coupe) {
    return (
      "ANNUAIRE COUPÉ — les messages sont toujours analysés, mais l'usurpation " +
      "d'annuaire n'est plus détectée. Le consentement Entra doit être " +
      "réaccordé (bouton « Autoriser chez Microsoft »)."
    );
  }
  if (b.statut_apres === "erreur") {
    return (
      "La surveillance est incertaine. Si c'est passager, la prochaine " +
      "vérification rétablira le statut toute seule."
    );
  }
  return "Retour à la normale, rien à faire.";
}

/* --------------------------------------------------------------------------
   Les trois textes au dirigeant
   -------------------------------------------------------------------------- */

/**
 * ⚠ TROIS PANNES, TROIS REMÈDES OPPOSÉS, ET C'EST TOUT L'ENJEU DE CES TEXTES.
 *   La première version en connaissait un seul et disait « cliquez Autoriser
 *   chez Microsoft » dans les trois cas. Un test réel a montré que c'était faux
 *   deux fois sur trois : l'accès au courrier vient du RBAC Exchange posé par
 *   le script, pas d'un rôle d'application Entra. Envoyer un client refaire un
 *   consentement pour réparer une attribution de rôle Exchange, c'est le faire
 *   tourner en rond pendant que rien n'est analysé.
 *
 * ⚠ ET L'ANNUAIRE N'EST PAS UNE INTERRUPTION. Les messages continuent d'être
 *   analysés ; c'est la reconnaissance des dirigeants et collaborateurs qui
 *   tombe, donc l'usurpation d'annuaire. Le dire « arrêté » serait un second
 *   mensonge. Le texte doit être pressant SANS être alarmiste.
 */
function texteDirigeant(
  societe: string | null,
  cas: "courrier" | "tout" | "annuaire",
): { objet: string; corps: string } {
  const chez = societe ? ` pour ${societe}` : "";

  if (cas === "annuaire") {
    return {
      objet: "Votre protection Safentreprise est amoindrie",
      corps: [
        "Bonjour,",
        "",
        `Vos messages sont toujours analysés${chez} — la surveillance ` +
          "fonctionne. En revanche, nous n'avons plus accès à votre annuaire " +
          "Microsoft.",
        "",
        "CE QUI SE DÉGRADE EN ATTENDANT",
        "Le moteur ne reconnaît plus les noms et adresses de vos dirigeants et " +
          "de vos collaborateurs. Une tentative qui se présente au nom de l'un " +
          "d'eux — le scénario le plus courant de l'arnaque au président — ne " +
          "sera plus repérée comme telle. Les autres règles de détection " +
          "continuent de fonctionner normalement.",
        "",
        "POUR RÉTABLIR",
        "Connectez-vous à votre espace Safentreprise, page « Microsoft 365 », " +
          "et suivez le bouton « Autoriser chez Microsoft ». Un administrateur " +
          "général devra réaccorder le consentement. Il n'y a rien d'autre à " +
          "refaire.",
        "",
        "L'équipe Safentreprise",
      ].join("\n"),
    };
  }

  if (cas === "tout") {
    return {
      objet: "Votre surveillance Safentreprise est arrêtée",
      corps: [
        "Bonjour,",
        "",
        `La surveillance Safentreprise de votre messagerie Microsoft 365 est ` +
          `ARRÊTÉE${chez}.`,
        "",
        "Microsoft refuse désormais de nous délivrer la moindre autorisation. " +
          "L'application Safentreprise a probablement été supprimée ou " +
          "désactivée dans votre annuaire. Depuis, plus aucun message n'est " +
          "analysé, et aucune tentative de fraude n'est signalée.",
        "",
        "POUR RÉTABLIR — DEUX ÉTAPES",
        "1. Espace Safentreprise, page « Microsoft 365 », bouton « Autoriser " +
          "chez Microsoft » : un administrateur général réaccorde l'accès.",
        "2. Puis faites réexécuter par un administrateur Exchange le script " +
          "PowerShell de l'étape 3, qui redonne à Safentreprise l'accès à vos " +
          "seules boîtes choisies.",
        "",
        "Les deux sont nécessaires : la première seule ne rétablira pas " +
          "l'analyse du courrier.",
        "",
        "L'équipe Safentreprise",
      ].join("\n"),
    };
  }

  return {
    objet: "Votre surveillance Safentreprise est arrêtée",
    corps: [
      "Bonjour,",
      "",
      `La surveillance Safentreprise de votre messagerie Microsoft 365 est ` +
        `ARRÊTÉE${chez}. Depuis, plus aucun message n'est analysé, et aucune ` +
        "tentative de fraude n'est signalée.",
      "",
      "L'attribution de rôle qui nous donne accès à vos boîtes a été retirée " +
        "dans Exchange. Nous ne pouvons pas la rétablir de notre côté.",
      "",
      "POUR RÉTABLIR",
      "⚠ Ce n'est PAS le bouton « Autoriser chez Microsoft » qui réglera ce " +
        "problème. Cette autorisation-là est toujours valable.",
      "",
      "Il faut faire réexécuter par un administrateur Exchange le script " +
        "PowerShell de l'étape 3 — celui qui déclare Safentreprise dans " +
        "Exchange et lui attribue l'accès à vos seules boîtes choisies. Vous " +
        "le retrouvez dans votre espace, page « Microsoft 365 », étape " +
        "« Restreindre l'accès ».",
      "",
      "Vos boîtes choisies et le périmètre déjà défini sont conservés : il n'y " +
        "a pas tout à refaire.",
      "",
      "L'équipe Safentreprise",
    ].join("\n"),
  };
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
  const sondes: { l: Locataire; c: Constat }[] = [];

  for (const l of locataires) {
    let graphUserId: string | null = null;
    try {
      graphUserId = await boiteSonde(l.tenant_uid);
    } catch (erreur) {
      // Une base injoignable n'est pas un problème d'autorisation, et ne dit
      // rien de l'annuaire : on ne touche à aucun drapeau.
      sondes.push({
        l,
        c: {
          verdict: "passager",
          portee: null,
          detail: messageDe(erreur),
          annuaireOk: null,
          annuaireDetail: null,
        },
      });
      continue;
    }
    sondes.push({ l, c: await sonder(l.tenant_id, graphUserId) });
  }

  // --- 2. Le garde-fou de la panne générale ---------------------------------
  //
  // ⚠ SANS LUI, UN SECRET EXPIRÉ MARQUERAIT TOUT LE PARC « RÉVOQUÉ » EN TROIS
  //   PASSAGES, et enverrait à chaque client un mail lui annonçant que son
  //   administrateur a retiré son accord. Ce serait faux, et irrattrapable.
  const generale = panneGenerale(sondes.map((s) => s.c.verdict));
  if (generale) {
    for (const s of sondes) {
      if (s.c.verdict === "definitif") {
        s.c.verdict = "passager";
        s.c.portee = null;
        s.c.detail = `[panne générale probable, révocation non retenue] ${s.c.detail}`;
      }
      // ⚠ ET ON NE LÈVE PAS NON PLUS LE DRAPEAU D'ANNUAIRE. Une panne
      //   généralisée le ferait tomber partout à la fois, avec la même
      //   fausseté et le même mail à chaque client.
      s.c.annuaireOk = null;
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
      p_verdict: s.c.verdict,
      p_portee: s.c.portee,
      p_detail: s.c.detail,
      p_annuaire_ok: s.c.annuaireOk,
      p_annuaire_detail: s.c.annuaireDetail,
    });
    const c = (Array.isArray(lignes) ? lignes[0] : lignes) as Constatation | undefined;
    if (!c) continue;

    const societe = await societeDe(s.l.company_id);

    const bilan: Bilan = {
      tenant_uid: s.l.tenant_uid,
      societe: societe.nom,
      verdict: s.c.verdict,
      portee: c.portee,
      statut_avant: c.statut_avant,
      statut_apres: c.statut_apres,
      bascule: c.bascule,
      annuaire_coupe: c.annuaire_coupe,
      annuaire_bascule: c.annuaire_bascule,
      detail: s.c.detail,
    };
    bilans.push(bilan);

    // ⚠ DEUX AXES, DONC DEUX BASCULES POSSIBLES DANS LE MÊME PASSAGE. Le
    //   courrier et l'annuaire ne tombent pas ensemble ; chacun a son mail.
    if (!c.bascule && !c.annuaire_bascule) continue;

    const erreurInterne = await envoyer(
      process.env.VEILLE_DESTINATAIRE?.trim() || EMAIL_CONTACT,
      `[Safentreprise] ${societe.nom ?? "Un client"} — ${resumeObjet(bilan)}`,
      texteInterne(bilan),
    );
    if (erreurInterne) console.error("[sante] alerte interne :", erreurInterne);

    if (!societe.email) continue;

    // --- Le dirigeant ------------------------------------------------------
    //
    // ⚠ TOUJOURS PAS SUR « erreur ». C'est passager par construction : un mail
    //   à chaque hoquet apprendrait au dirigeant à ignorer nos alertes, et le
    //   jour de la vraie coupure il ne la lirait pas.
    //
    // ⚠ MAIS OUI SUR L'ANNUAIRE, et c'est un ajout assumé à la règle
    //   « révocation seulement ». Un annuaire coupé est un fait CONSTATÉ, pas
    //   un doute, et seul le client peut le réparer — par un geste qui n'est
    //   pas celui de la révocation de courrier. Se taire le laisserait avec
    //   une détection amputée sans le savoir.
    if (c.bascule && c.statut_apres === "revoque") {
      const cas = c.portee === "tout" ? "tout" : "courrier";
      const { objet, corps } = texteDirigeant(societe.nom, cas);
      const erreurClient = await envoyer(societe.email, objet, corps);
      if (erreurClient) console.error("[sante] alerte dirigeant :", erreurClient);
    } else if (c.annuaire_bascule && c.annuaire_coupe && c.statut_apres !== "revoque") {
      // Sur une révocation, le mail rouge dit déjà tout : en ajouter un second
      // sur l'annuaire noierait le message qui compte.
      const { objet, corps } = texteDirigeant(societe.nom, "annuaire");
      const erreurClient = await envoyer(societe.email, objet, corps);
      if (erreurClient) console.error("[sante] alerte annuaire :", erreurClient);
    }
  }

  return Response.json({
    locataires: locataires.length,
    panne_generale: generale,
    bascules: bilans.filter((b) => b.bascule || b.annuaire_bascule).length,
    bilans,
  });
}

/** Le résumé qui tient dans un objet de mail. */
function resumeObjet(b: Bilan): string {
  if (b.statut_apres === "revoque") {
    return b.portee === "tout" ? "TOUT COUPÉ" : "courrier coupé";
  }
  if (b.annuaire_bascule && b.annuaire_coupe) return "annuaire coupé";
  if (b.statut_apres === "erreur") return "santé incertaine";
  return "retour à la normale";
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
