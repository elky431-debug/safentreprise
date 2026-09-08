/**
 * Étape 3-4 du raccordement : le retour de Microsoft.
 *
 * ⚠ CE RETOUR NE PROUVE RIEN. C'est une redirection de navigateur : n'importe
 *   qui peut ouvrir cette adresse avec les paramètres de son choix. On ne
 *   croit donc AUCUN de ses paramètres pour établir le consentement.
 *
 *   Ce qui prouve, c'est d'obtenir un jeton d'application pour le locataire
 *   annoncé. Si Microsoft nous le délivre, l'accord existe réellement.
 *
 *   Le paramètre « tenant » sert seulement à savoir POUR QUI demander ce
 *   jeton. Le forger ne mène nulle part : soit le locataire n'a pas consenti
 *   et le jeton est refusé, soit il a consenti et il est déjà rattaché à sa
 *   société — valider_consentement_graph refuse alors la reprise.
 *
 * ⚠ LES NOMS DES PARAMÈTRES DE RETOUR N'ONT PAS PU ÊTRE VÉRIFIÉS dans la
 *   documentation Microsoft, inaccessible depuis l'environnement de
 *   développement. Le code accepte donc plusieurs graphies, et surtout : en
 *   cas d'échec il ENREGISTRE la liste des paramètres réellement reçus. Le
 *   premier essai réel dira la vérité, au lieu de laisser deviner.
 */
import {
  ErreurGraph,
  obtenirJeton,
  obtenirServicePrincipal,
} from "@/lib/microsoft/graph";
import { adresseAppelante, rpcService } from "@/lib/microsoft/consentement";
import { avecContexteJournal } from "@/lib/microsoft/journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Validation = {
  resultat: "accorde" | "refuse" | "expire" | "invalide";
  tenant_uid: string | null;
  company_id: string | null;
  detail: string;
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Les noms de paramètres possibles, du plus probable au moins. */
function premierPresent(p: URLSearchParams, noms: string[]): string | null {
  for (const nom of noms) {
    const valeur = p.get(nom)?.trim();
    if (valeur) return valeur;
  }
  return null;
}

/**
 * Ce que Microsoft a réellement envoyé, pour pouvoir le lire après coup.
 * Les valeurs sont tronquées : on veut savoir ce qui est arrivé, pas
 * recopier un éventuel secret dans la base.
 */
function parametresRecus(p: URLSearchParams): string {
  const morceaux: string[] = [];
  for (const [cle, valeur] of p) {
    morceaux.push(`${cle}=${valeur.slice(0, 60)}`);
  }
  return morceaux.join(" | ").slice(0, 400);
}

/**
 * Obtenir un jeton, en tenant compte de la réplication.
 *
 * Juste après un accord, le service principal peut ne pas encore exister dans
 * le locataire, et Microsoft répond alors une erreur d'application inconnue.
 * Quelques secondes suffisent. Conclure à l'échec du premier coup ferait
 * échouer un raccordement parfaitement valide.
 */
async function prouverLeConsentement(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const attentes = [0, 2000, 4000];
  let dernier = "";

  for (const attente of attentes) {
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    try {
      await obtenirJeton(tenantId);
      return { ok: true };
    } catch (erreur) {
      dernier = messageDe(erreur);
      // Un secret d'application invalide ne s'arrangera pas en attendant.
      if (erreur instanceof ErreurGraph && erreur.code === "invalid_client") break;
    }
  }
  return { ok: false, detail: dernier };
}

/* ==========================================================================
   La page de retour
   ========================================================================== */

/**
 * Cette page reste volontairement autonome, en HTML nu.
 *
 * ⚠ ELLE EST RENDUE SANS SESSION SAFENTREPRISE. Microsoft renvoie
 *   l'administrateur ici, et cet administrateur n'est presque jamais la
 *   personne qui a ouvert le parcours : il n'a pas de compte chez nous.
 *   Rediriger vers /microsoft l'enverrait sur l'écran de connexion, sans
 *   comprendre pourquoi. On lui dit donc ce qui s'est passé, et on renvoie le
 *   dirigeant vers son espace par un lien — pas par une redirection.
 */
const RETOUR = "/microsoft";

function page(titre: string, corps: string, statut: number): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre} — Safentreprise</title>
<style>
 body{font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      max-width:38rem;margin:4rem auto;padding:0 1.5rem;color:#111827}
 h1{font-size:1.4rem;margin:0 0 1rem}
 .detail{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;
         padding:1rem;font-size:.9rem;white-space:pre-wrap;word-break:break-word}
 a{color:#1d4ed8}
</style></head><body>
<h1>${titre}</h1>
${corps}
<p><a href="${RETOUR}">Retour à Safentreprise</a></p>
</body></html>`;
  return new Response(html, {
    status: statut,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function echec(titre: string, explication: string, detail?: string): Response {
  return page(
    titre,
    `<p>${explication}</p>` +
      (detail ? `<div class="detail">${detail.replace(/[<>&]/g, "")}</div>` : ""),
    400,
  );
}

async function getInterne(requete: Request) {
  const parametres = new URL(requete.url).searchParams;
  const etat = premierPresent(parametres, ["state"]);

  // 1. Sans jeton d'état, on ne sait pas quelle société raccorder — et on ne
  //    peut rien tracer. C'est le seul cas où l'on ne laisse aucune trace.
  if (!etat) {
    console.error("[consentement] retour sans state :", parametresRecus(parametres));
    return echec(
      "Retour incomplet",
      "Ce lien ne contient pas le jeton attendu. Relancez le raccordement " +
        "depuis votre espace Safentreprise.",
      parametresRecus(parametres),
    );
  }

  // 2. L'administrateur a refusé, ou Microsoft a rejeté la demande.
  const erreurMs = premierPresent(parametres, ["error"]);
  if (erreurMs) {
    const description =
      premierPresent(parametres, ["error_description"]) ?? "sans description";
    await rpcService("echec_consentement_graph", {
      p_etat: etat,
      p_detail: `${erreurMs} — ${description}`,
    }).catch(() => {});
    return echec(
      "Accord non donné",
      "Microsoft n'a pas accordé l'autorisation. Rien n'a été raccordé.",
      `${erreurMs} — ${description}`,
    );
  }

  // 3. Quel locataire ? On l'accepte de Microsoft parce qu'il faut bien savoir
  //    à qui demander un jeton — pas parce qu'on lui fait confiance.
  const tenantId = premierPresent(parametres, ["tenant", "tenant_id", "tid"]);
  if (!tenantId) {
    const recus = parametresRecus(parametres);
    console.error("[consentement] retour sans locataire :", recus);
    await rpcService("echec_consentement_graph", {
      p_etat: etat,
      p_detail: `Aucun identifiant de locataire dans le retour. Reçu : ${recus}`,
    }).catch(() => {});
    return echec(
      "Retour incomplet",
      "Microsoft n'a pas indiqué de locataire. Le détail ci-dessous a été " +
        "enregistré ; transmettez-le au support.",
      recus,
    );
  }

  // 4. LA PREUVE : obtenir un jeton d'application pour ce locataire.
  const preuve = await prouverLeConsentement(tenantId);
  if (!preuve.ok) {
    await rpcService("echec_consentement_graph", {
      p_etat: etat,
      p_detail: `Jeton refusé pour ${tenantId} : ${preuve.detail}`,
    }).catch(() => {});
    return echec(
      "Autorisation non confirmée",
      "L'accord semble avoir été donné, mais Microsoft refuse encore de " +
        "délivrer une autorisation à Safentreprise. Attendez une minute puis " +
        "relancez le raccordement. Si cela persiste, transmettez le détail " +
        "ci-dessous au support.",
      preuve.detail,
    );
  }

  // 5. Le jeton est venu : on peut enregistrer, avec sa preuve.
  let validation: Validation | undefined;
  try {
    const lignes = await rpcService<Validation[]>("valider_consentement_graph", {
      p_etat: etat,
      p_tenant_id: tenantId,
      // ⚠ Le « qui » vient de la demande de départ, enregistrée dans
      //   graph_consentements par la session Safentreprise — jamais de ce
      //   retour, que personne ne contrôle.
      p_consenti_par: null,
      p_ip: adresseAppelante(requete),
    });
    validation = Array.isArray(lignes) ? lignes[0] : lignes;
  } catch (erreur) {
    console.error("[consentement] valider_consentement_graph :", messageDe(erreur));
    return echec(
      "Enregistrement impossible",
      "L'autorisation Microsoft est confirmée, mais nous n'avons pas pu " +
        "l'enregistrer. Relancez le raccordement.",
      messageDe(erreur),
    );
  }

  if (!validation || validation.resultat !== "accorde") {
    return echec(
      "Raccordement refusé",
      validation?.detail ?? "Le jeton d'état n'a pas été accepté.",
    );
  }

  // 6. L'ObjectId de notre service principal dans CE locataire. Il est exigé
  //    par New-ServicePrincipal, côté Exchange, et il servira à écrire le
  //    script de restriction sans imposer le module Microsoft.Graph à
  //    l'administrateur du client.
  //
  //    ⚠ UN ÉCHEC ICI N'ANNULE PAS LE RACCORDEMENT. Le consentement est acquis
  //      et prouvé ; renvoyer une page d'erreur ferait tout recommencer pour
  //      un identifiant que la route de restriction sait aller rechercher plus
  //      tard. On enregistre ce qu'on peut, on note le reste.
  if (validation.tenant_uid) {
    try {
      const sp = await obtenirServicePrincipal(tenantId);
      await rpcService("enregistrer_sp_graph", {
        p_tenant_uid: validation.tenant_uid,
        p_sp_object_id: sp.objectId,
      });
    } catch (erreur) {
      console.error(
        "[consentement] service principal introuvable :",
        messageDe(erreur),
      );
    }
  }

  // 7. Reste les étapes 5 à 7 : choisir les boîtes, restreindre, vérifier.
  return page(
    "Microsoft 365 est autorisé",
    `<p>L'accord de votre administrateur est enregistré, et nous avons vérifié
      qu'il fonctionne réellement.</p>
     <p><strong>Le raccordement n'est pas terminé.</strong> Il reste à choisir
      les boîtes à surveiller, puis à restreindre l'accès de Safentreprise à
      ces seules boîtes. Tant que cette restriction n'a pas été constatée,
      <strong>aucun message n'est analysé</strong>.</p>
     <p>La suite se passe dans l'espace Safentreprise de votre société, page
      <strong>Microsoft 365</strong>. Si vous n'êtes pas la personne qui a
      lancé ce raccordement, prévenez-la : c'est là qu'elle reprendra.</p>
     <div class="detail">Locataire : ${tenantId.replace(/[<>&]/g, "")}</div>`,
    200,
  );
}

// Microsoft redirige en GET. On accepte POST par prudence : certains
// mandataires d'entreprise transforment la redirection.
export async function POST(requete: Request) {
  return GET(requete);
}

/**
 * Tout accès déclenché par cette route est attribué à « raccordement ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function GET(requete: Request) {
  return avecContexteJournal(
    { acteur: "raccordement", tache: "retour-consentement" },
    () => getInterne(requete),
  );
}
