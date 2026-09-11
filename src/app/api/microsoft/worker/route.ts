/**
 * Worker : draine la file des notifications Graph.
 *
 * Pour chaque message en attente : le récupérer, convertir son corps en
 * texte, l'analyser, écrire le verdict. **Il ne touche pas au message.**
 * Poser une catégorie et injecter une bannière viendra ensuite, une fois les
 * scores observés sur de vrais messages — un faux positif défigure
 * définitivement un mail légitime, ce droit-là se donne les yeux ouverts.
 *
 * Déclenchement : appel HTTP protégé par un secret partagé. La tâche
 * planifiée qui l'appellera toutes les minutes viendra avec le renouvellement
 * des abonnements ; en attendant, on l'appelle à la main.
 *
 * Contrairement au webhook, cette route peut prendre son temps et importe ce
 * dont elle a besoin. Elle reste bornée pour tenir sous le délai de Netlify :
 * un lot court, un budget, et le reste au tour suivant.
 */
import { analyser } from "@/lib/detection";
import {
  DOSSIER_SERVICE,
  ErreurGraph,
  assurerCategorie,
  assurerDossierService,
  deplacerMessage,
  lireMessage,
  obtenirJeton,
  poserCategorie,
  remplacerCorps,
} from "@/lib/microsoft/graph";
import {
  construireBanniere,
  construireBanniereTexte,
  contientBanniere,
  corpsEstHtml,
  poserBanniere,
  poserBanniereTexte,
  refDeBanniere,
  texteVersHtml,
  type NiveauBanniere,
} from "@/lib/microsoft/banniere";
import { convertirCorps } from "@/lib/detection/html-texte.js";
import { avecContexteJournal, journaliserAcces } from "@/lib/microsoft/journal";
import {
  alerteFictive,
  envoyerAlerteDirigeant,
  envoyerResumeDirigeant,
  type AlerteANotifier,
  type ResumeANotifier,
} from "@/lib/microsoft/alerte-dirigeant";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";
import {
  envoyerRapportMensuel,
  rapportFictif,
  type DonneesRapport,
} from "@/lib/microsoft/rapport-mensuel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Au-delà, on rend la main et le reste attend le tour suivant. */
const BUDGET_MS = 20_000;
const LOT = 5;

type Travail = {
  travail_id: string;
  company_id: string;
  boite_id: string;
  message_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  tentatives: number;
};

/** Faits d'entreprise passés au moteur. Voir `normaliserContexte`. */
type ContexteDetection = {
  domainesInternes: string[];
  domainesAutorises: string[];
  annuaire: { nom: string; email: string | null }[];
};

/* ==========================================================================
   Base
   ========================================================================== */

/**
 * Erreur portant l'étape où elle s'est produite.
 *
 * Sans ça, une panne se présente comme un message nu — « Unexpected end of
 * JSON input » — sans dire quel appel a échoué. L'étape est ce qui manque pour
 * diagnostiquer depuis la seule réponse HTTP, sans accès aux journaux.
 */
class ErreurEtape extends Error {
  constructor(
    message: string,
    readonly etape: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ErreurEtape";
  }
}

function etapeDe(erreur: unknown): string {
  return erreur instanceof ErreurEtape ? erreur.etape : "inconnue";
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Appel d'une fonction Postgres avec la clé de service.
 *
 * Les fonctions du worker lisent des métadonnées de messages et modifient la
 * file : elles ne sont volontairement pas accessibles avec la clé anonyme.
 */
async function rpc<T>(nom: string, parametres: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new ErreurEtape(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent de l'environnement.",
      "configuration",
    );
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${url}/rest/v1/rpc/${nom}`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parametres),
    });
  } catch (erreur) {
    throw new ErreurEtape(
      `${nom} : impossible de joindre PostgREST — ${messageDe(erreur)}`,
      `rpc:${nom}`,
      erreur,
    );
  }

  const texte = await reponse.text();

  if (!reponse.ok) {
    throw new ErreurEtape(
      `${nom} : HTTP ${reponse.status} — ${texte.slice(0, 300)}`,
      `rpc:${nom}`,
    );
  }

  // Une fonction qui RETURNS VOID — echec_travail_graph — fait répondre
  // PostgREST sans corps. Faire JSON.parse dessus lève « Unexpected end of
  // JSON input », un message qui ne dit ni quel appel ni quelle étape.
  if (texte.trim() === "") return null as T;

  try {
    return JSON.parse(texte) as T;
  } catch {
    throw new ErreurEtape(
      `${nom} : réponse illisible (HTTP ${reponse.status}) — ${texte.slice(0, 200)}`,
      `rpc:${nom}`,
    );
  }
}

/**
 * Signale l'échec d'un travail sans jamais masquer l'erreur d'origine.
 *
 * Ce compte rendu est appelé DEPUIS un bloc catch. S'il lève à son tour,
 * l'exception remplace celle qu'on était en train de traiter et la vraie cause
 * disparaît — c'est exactement ce qui rendait la panne indéchiffrable.
 */
async function signalerEchec(
  travailId: string,
  erreur: string,
  definitif: boolean,
): Promise<string | null> {
  try {
    await rpc("echec_travail_graph", {
      p_travail_id: travailId,
      p_erreur: erreur,
      p_definitif: definitif,
    });
    return null;
  } catch (secondaire) {
    const detail = messageDe(secondaire);
    console.error(`[worker] compte rendu d'échec impossible : ${detail}`);
    return detail;
  }
}

/* ==========================================================================
   Action sur le message
   ========================================================================== */

/**
 * Interrupteur d'écriture. DÉSACTIVÉ PAR DÉFAUT.
 *
 *   off       — on n'écrit rien. Le worker analyse et enregistre, comme avant.
 *   categorie — pose seulement la catégorie. Réversible d'un clic par
 *               l'utilisateur lui-même, et ne modifie pas le message.
 *   complet   — catégorie ET bannière dans le corps.
 *
 * Il est à « off » tant que personne ne l'a explicitement changé : déployer ce
 * code ne modifie donc aucune boîte. C'est voulu — la bannière est la seule
 * opération irréversible du produit, elle ne doit jamais s'activer par le
 * simple fait d'une mise en ligne.
 */
function modeAction(): "off" | "categorie" | "complet" {
  const valeur = (process.env.GRAPH_ACTIONS ?? "off").trim().toLowerCase();
  return valeur === "complet" || valeur === "categorie" ? valeur : "off";
}

type Action = {
  mode: string;
  categorie?: {
    etat: "posee" | "echec";
    nom?: string;
    /** Sans la liste maîtresse, la catégorie s'affiche sans couleur. */
    couleur?: "declaree" | "sans-couleur";
    erreur?: string;
  };
  banniere?: {
    // « ignoree-texte » n'existe plus : un corps en texte brut reçoit une
    // bannière en texte brut. Soit elle est posée, soit c'est une erreur.
    etat: "posee" | "echec" | "deja-presente" | "annulee-non-verifiable";
    /** Format réellement posé — « texte » signale un repli après échec. */
    format?: "html" | "texte";
    erreur?: string;
  };
  /**
   * L'action a réussi mais n'a pas pu être consignée en base. C'est grave :
   * sans trace, graph:restaurer ne saura pas qu'il y a quelque chose à
   * défaire sur ce message.
   */
  enregistrement?: string;
  /**
   * Pourquoi le message n'a pas pu être déplacé, le cas échéant.
   *
   * ⚠ CE CHAMP EXISTE PARCE QUE SON ABSENCE A COÛTÉ UNE FONCTIONNALITÉ
   *   ENTIÈRE. Le déplacement a été mis en service et n'a jamais marché une
   *   seule fois : l'échec partait dans un `console.error` et nulle part
   *   ailleurs, si bien qu'une bannière jamais déplacée laissait exactement la
   *   même trace qu'une bannière déplacée. La raison remonte désormais ici,
   *   dans la réponse du worker, ET sur la ligne d'analyse.
   */
  deplacement?: string;
};

/**
 * Résume l'action en un état unique, conservé en base.
 *
 * C'est ce que la vue alertes_sans_banniere traduit en clair. Il n'existe
 * PAS de valeur « rien à signaler » : une alerte sans bannière a toujours une
 * raison, et cette raison doit être lisible sans ouvrir les journaux.
 */
function etatAction(action: Action): string {
  if (action.mode === "off") return "mode-off";
  if (action.banniere?.etat) return action.banniere.etat;
  // Mode « categorie » : la bannière n'a délibérément pas été tentée.
  if (action.categorie?.etat === "posee") return "categorie-seule";
  return "echec";
}

/**
 * Pose la catégorie et, selon le mode, la bannière.
 *
 * ⚠ JAMAIS RIEN QUAND IL N'Y A PAS D'ALERTE. Pas de catégorie « analysé »,
 *   pas de pastille verte : on n'affiche que le risque. Une marque d'absence
 *   de risque vaudrait caution, y compris sur les messages que le worker n'a
 *   jamais vus.
 */
async function agir(
  travail: Travail,
  message: { id: string; categories?: string[]; body?: { contentType?: string; content?: string } },
  verdict: { alerte: boolean; niveauBase: string; score: number; signaux: string[] },
  /** Identifiant de la ligne d'analyse — inscrit dans la bannière. */
  analyseId: string | null,
): Promise<Action> {
  const mode = modeAction();
  if (mode === "off") return { mode: "off" };
  if (!verdict.alerte) return { mode };

  const action: Action = { mode };

  // ─────────────────────────────────────────────────────────────────────
  // LES DEUX ACTIONS SONT INDÉPENDANTES.
  //
  // La catégorie est un confort de tri ; la bannière est l'avertissement
  // que l'utilisateur lira. Laisser la première empêcher la seconde revient
  // à ne pas prévenir quelqu'un d'une tentative de fraude parce qu'on n'a
  // pas pu colorier une pastille. Chacune a donc son propre try/catch, et
  // aucune ne peut interrompre l'autre.
  // ─────────────────────────────────────────────────────────────────────

  try {
    const categorie = await etape("création de la catégorie", () =>
      assurerCategorie(travail.tenant_id, travail.graph_user_id, verdict.niveauBase),
    );

    await etape("pose de la catégorie", () =>
      poserCategorie(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        message.categories ?? [],
        categorie.nom,
      ),
    );

    action.categorie = {
      etat: "posee",
      nom: categorie.nom,
      couleur: categorie.enregistree ? "declaree" : "sans-couleur",
      erreur: categorie.motif,
    };
  } catch (erreur) {
    console.error(
      `[worker] catégorie impossible sur ${travail.message_id} : ${messageDe(erreur)}`,
    );
    action.categorie = { etat: "echec", erreur: messageDe(erreur) };
  }

  if (mode === "categorie") return action;

  try {
    action.banniere = await poserBanniereSurMessage(travail, message, verdict, analyseId);
  } catch (erreur) {
    console.error(
      `[worker] bannière impossible sur ${travail.message_id} — ` +
        `étape « ${etapeDe(erreur)} » : ${messageDe(erreur)}`,
    );
    action.banniere = { etat: "echec", erreur: messageDe(erreur) };
  }

  return action;
}

/** Pose la bannière et vérifie qu'on saurait la retirer. */
async function poserBanniereSurMessage(
  travail: Travail,
  message: { body?: { contentType?: string; content?: string } },
  verdict: { niveauBase: string; score: number; signaux: string[] },
  analyseId: string | null,
): Promise<NonNullable<Action["banniere"]>> {
  const origine = message.body?.content ?? "";

  // Le format se décide sur LE CONTENU, pas sur le contentType annoncé :
  // Graph renvoie « html » par défaut même pour un message nativement en
  // texte, et s'est déjà trompé dans l'autre sens. Un corps réellement en
  // texte reçoit une bannière texte ; on ne le convertit jamais en HTML, ce
  // qui casserait la restauration.
  const texteBrut = !corpsEstHtml(message.body);

  if (contientBanniere(origine)) {
    return { etat: "deja-presente" };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SAUVEGARDE AVANT TOUTE ÉCRITURE.
  //
  // Pas de sauvegarde, pas de modification. Un message altéré sans copie de
  // son corps d'origine ne se rattrape que par découpe des marqueurs — ce qui
  // marche, mais interdit toute conversion de format et ne survit pas à un
  // nettoyage HTML d'Exchange.
  //
  // « deja-sauvegarde » est un succès : l'original est en base depuis un
  // passage précédent, et il ne doit surtout pas être remplacé.
  // ─────────────────────────────────────────────────────────────────────
  const sauvegarde = await etape("sauvegarde du corps d'origine", () =>
    rpc<string>("sauvegarder_corps_graph", {
      p_company_id: travail.company_id,
      p_message_id: travail.message_id,
      p_contenu: origine,
      p_content_type: texteBrut ? "text" : "html",
    }),
  );

  if (sauvegarde !== "sauvegarde" && sauvegarde !== "deja-sauvegarde") {
    return {
      etat: "echec",
      erreur:
        `corps d'origine non sauvegardé (${sauvegarde}) — message NON modifié. ` +
        `On ne touche pas à un message qu'on ne saurait pas remettre en état.`,
    };
  }

  const contenu = {
    niveau: verdict.niveauBase as NiveauBanniere,
    score: verdict.score,
    signaux: verdict.signaux ?? [],
    // Le jeton qui permettra de rattacher ce message à sa ligne si son
    // identifiant Graph change au déplacement.
    ref: analyseId,
  };

  // ─────────────────────────────────────────────────────────────────────
  // UN CORPS TEXTE EST CONVERTI EN HTML.
  //
  // Vérifié par expérience sur un locataire réel : Graph accepte de faire
  // passer un message reçu de « text » à « html ». Tous les messages reçoivent
  // donc la même bannière, celle qui se lit le mieux.
  //
  // Ce n'est possible QUE parce que le corps d'origine vient d'être sauvegardé
  // juste au-dessus : la restauration réécrira le texte exact avec son
  // contentType d'avant. Sans cette sauvegarde, la conversion serait
  // irréversible — la découpe par marqueurs ne sait pas défaire un changement
  // de format.
  // ─────────────────────────────────────────────────────────────────────
  let format: "html" | "texte" = "html";

  try {
    const corpsHtml = texteBrut ? texteVersHtml(origine) : origine;
    await etape("pose de la bannière", () =>
      remplacerCorps(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        poserBanniere(corpsHtml, construireBanniere(contenu)),
        "html",
      ),
    );
  } catch (erreur) {
    // La conversion a échoué sur CE message. Plutôt que de ne rien signaler,
    // on repose une bannière texte dans le format d'origine : un avertissement
    // moins beau vaut infiniment mieux qu'aucun avertissement.
    if (!texteBrut) throw erreur;

    console.warn(
      `[worker] conversion HTML refusée sur ${travail.message_id} ` +
        `(${messageDe(erreur)}) — repli sur la bannière texte`,
    );
    format = "texte";
    await etape("pose de la bannière texte (repli)", () =>
      remplacerCorps(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        poserBanniereTexte(origine, construireBanniereTexte(contenu)),
        "text",
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // VÉRIFICATION APRÈS ÉCRITURE.
  //
  // Exchange normalise le HTML qu'on lui envoie. S'il retire nos marqueurs
  // ET notre balise repère, la bannière devient indélébile : on n'a aucune
  // copie du corps d'origine à réécrire. On relit donc ce qui a réellement
  // été enregistré et on vérifie qu'on saurait le défaire.
  //
  // Si ce n'est pas le cas, l'original est encore en mémoire À CET INSTANT
  // et nulle part ailleurs : c'est la seule fenêtre où l'annulation reste
  // possible. On la saisit.
  // ─────────────────────────────────────────────────────────────────────
  const relu = await etape("relecture après pose", () =>
    lireMessage(travail.tenant_id, travail.graph_user_id, travail.message_id),
  );

  if (!contientBanniere(relu.body?.content ?? "")) {
    // On rétablit le corps d'origine DANS SON FORMAT D'ORIGINE, y compris
    // quand on venait de le convertir : c'est l'état d'avant qu'on rend.
    await etape("annulation de la bannière non vérifiable", () =>
      remplacerCorps(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        origine,
        texteBrut ? "text" : "html",
      ),
    );
    return {
      etat: "annulee-non-verifiable",
      erreur:
        "La bannière n'était plus retrouvable après écriture : Exchange a " +
        "retiré les marqueurs ET la balise repère. Corps d'origine rétabli.",
    };
  }

  // Le déplacement qui rend la bannière visible sous Outlook a lieu PLUS
  // TARD, une fois la base à jour : `deplacerPourRafraichir`, appelé en toute
  // fin de `traiter`. Il change l'identifiant du message, donc rien ne doit
  // plus s'écrire sous l'ancien après lui.
  return { etat: "posee", format };
}

/** Au-delà, on laisse la maintenance finir le travail. */
const ESSAIS_DEPLACEMENT = 3;

/**
 * Sort le message de la boîte de réception et l'y remet aussitôt.
 *
 * ⚠ L'INTENTION EST ÉCRITE AVANT L'ACTE. `marquer_deplacement_graph` pose un
 *   horodatage que seul le retour efface. Si le processus meurt entre les
 *   deux, la ligne dit « celui-ci était en route » : on sait lequel chercher,
 *   sans fouiller la boîte.
 *
 * ⚠ LE RETOUR EST RETENTÉ. C'est le seul des deux mouvements dont l'échec
 *   laisse le message hors de la boîte de réception. Trois essais couvrent
 *   l'incident réseau ordinaire ; au-delà, la ligne reste marquée et le
 *   balayage de la maintenance la ramène.
 */
async function deplacerPourRafraichir(travail: Travail): Promise<void> {
  const dossier = await etape("dossier de service", () =>
    assurerDossierService(travail.tenant_id, travail.graph_user_id),
  );

  // Mémorisé pour que le balayage sache où regarder, même si tout le reste
  // échoue ensuite.
  await rpc("enregistrer_dossier_service", {
    p_boite_id: travail.boite_id,
    p_dossier_id: dossier,
  }).catch(() => {});

  await rpc("marquer_deplacement_graph", {
    p_company_id: travail.company_id,
    p_message_id: travail.message_id,
  });

  const enTransit = await etape("déplacement vers le dossier de service", () =>
    deplacerMessage(
      travail.tenant_id,
      travail.graph_user_id,
      travail.message_id,
      dossier,
    ),
  );

  let dernierEchec: unknown = null;
  for (let essai = 1; essai <= ESSAIS_DEPLACEMENT; essai += 1) {
    try {
      const revenu = await deplacerMessage(
        travail.tenant_id,
        travail.graph_user_id,
        enTransit,
        "inbox",
      );

      // ⚠ C'EST ICI QUE LA FENÊTRE SE FERME. Tant que cet appel n'a pas eu
      //   lieu, le message porte une bannière sous un identifiant que la base
      //   ignore — et la restauration ne le retrouverait pas. Le jeton
      //   `data-ref` de la bannière est ce qui couvre l'intervalle.
      await rpc("renommer_message_graph", {
        p_company_id: travail.company_id,
        p_ancien_id: travail.message_id,
        p_nouveau_id: revenu,
      });
      return;
    } catch (erreur) {
      dernierEchec = erreur;
      console.error(
        `[worker] retour en boîte de réception, essai ${essai}/${ESSAIS_DEPLACEMENT} : ` +
          `${messageDe(erreur)}`,
      );
    }
  }

  throw new ErreurEtape(
    `message laissé dans le dossier de service après ${ESSAIS_DEPLACEMENT} essais ` +
      `(${messageDe(dernierEchec)}) — la maintenance le ramènera`,
    "retour en boîte de réception",
    dernierEchec,
  );
}

/* ==========================================================================
   Traitement d'un message
   ========================================================================== */

type Resultat = {
  message_id: string;
  statut: "analyse" | "ignore" | "echec" | "rattache";
  niveau?: string;
  score?: number;
  alerte?: boolean;
  motif?: string;
  /** Où ça a cassé. Vide quand tout s'est bien passé. */
  etape?: string;
  /** Renseigné si le compte rendu d'échec a lui aussi échoué. */
  echecSecondaire?: string;
  /** Le contexte d'entreprise a-t-il pu être appliqué ? */
  contexte?: "applique" | "absent";
  /** Ce qui a été posé sur le message, le cas échéant. */
  action?: Action;
};

/** Exécute une étape en lui attachant son nom en cas d'échec. */
async function etape<T>(nom: string, action: () => Promise<T> | T): Promise<T> {
  try {
    return await action();
  } catch (erreur) {
    if (erreur instanceof ErreurEtape) throw erreur;
    throw new ErreurEtape(messageDe(erreur), nom, erreur);
  }
}

/**
 * Contexte d'entreprise, mis en cache le temps de l'exécution.
 *
 * Un lot porte souvent plusieurs messages de la même société : inutile de
 * redemander l'annuaire à chaque fois. Le cache ne vit QUE le temps de
 * l'invocation — pas de risque de servir à une société le contexte d'une
 * autre entre deux appels.
 */
async function contextePour(
  companyId: string,
  cache: Map<string, ContexteDetection | null>,
): Promise<ContexteDetection | undefined> {
  if (!cache.has(companyId)) {
    try {
      cache.set(
        companyId,
        await rpc<ContexteDetection>("contexte_detection_graph", {
          p_company_id: companyId,
        }),
      );
    } catch (erreur) {
      // Sans contexte le moteur reste opérant : il perd la détection de
      // typosquattage et d'usurpation, pas le reste. Mieux vaut un verdict
      // partiel qu'un message non analysé.
      console.error("[worker] contexte indisponible :", erreur);
      cache.set(companyId, null);
    }
  }

  const contexte = cache.get(companyId);
  // Un contexte sans domaine interne n'apprend rien au moteur et l'exposerait
  // à conclure sur du vide : on préfère ne rien passer du tout.
  if (!contexte || contexte.domainesInternes.length === 0) return undefined;
  return contexte;
}

async function traiter(
  travail: Travail,
  contexte: ContexteDetection | undefined,
): Promise<Resultat> {
  const debut = Date.now();

  const message = await etape("lecture du message (Graph)", () =>
    lireMessage(travail.tenant_id, travail.graph_user_id, travail.message_id),
  );

  // ─────────────────────────────────────────────────────────────────────
  // LE WEBHOOK REJOUÉ — À TRAITER AVANT TOUT LE RESTE.
  //
  // Déplacer un message fait apparaître un NOUVEL élément dans la boîte de
  // réception : Graph émet une notification, le message revient en file, et
  // le worker le retrouve ici — sous un identifiant différent.
  //
  // Sans cette garde, `enregistrer_analyse_graph` ne verrait aucun conflit
  // sur (company_id, message_id) et CRÉERAIT UNE SECONDE LIGNE pour le même
  // message physique : deux alertes dans /menaces, DEUX EMAILS AU DIRIGEANT,
  // et des compteurs gonflés dans le rapport mensuel. Ce serait pire que le
  // défaut qu'on corrige.
  //
  // ⚠ LA RECONNAISSANCE NE REPOSE PAS SUR UNE DEVINETTE. Le corps porte
  //   notre bannière, et la bannière porte l'identifiant de la ligne qui l'a
  //   posée. On rattache exactement, ou on ne rattache pas.
  // ─────────────────────────────────────────────────────────────────────
  const refPortee = refDeBanniere(message.body?.content ?? "");
  if (refPortee) {
    const issue = await rpc<string>("rattacher_message_graph", {
      p_company_id: travail.company_id,
      p_ref: refPortee,
      p_nouveau_id: travail.message_id,
    }).catch((erreur) => {
      console.error(`[worker] rattachement impossible : ${messageDe(erreur)}`);
      return "erreur";
    });

    // ⚠ ON NE SAUTE L'ANALYSE QUE SUR UNE RÉPONSE QUI PROUVE QUELQUE CHOSE.
    //
    //   Une référence se lit dans le corps du message : elle est visible de
    //   son destinataire, donc recopiable. Si en porter une suffisait à être
    //   « rattaché », il suffirait d'en coller une dans un mail frauduleux
    //   pour n'être jamais analysé. Le doublon qu'on cherche à éviter serait
    //   remplacé par un contournement, ce qui est bien pire.
    //
    //   « rattachee » et « deja-a-jour » supposent une ligne à nous dont on
    //   venait d'annoncer le déplacement : elles se refusent à qui n'est pas
    //   ce message-là. « inconnue » et « hors-fenetre » ne prouvent rien : on
    //   analyse, comme n'importe quel message. Il n'en sortira pas de seconde
    //   bannière — `poserBanniereSurMessage` s'arrête sur « deja-presente ».
    if (issue === "rattachee" || issue === "deja-a-jour") {
      await signalerEchec(travail.travail_id, `rattaché (${issue})`, true);
      return {
        message_id: travail.message_id,
        statut: "rattache",
        motif: `bannière déjà posée, ligne ${issue}`,
      };
    }

    // La base n'a pas répondu : on ne tranche pas à l'aveugle. Analyser
    // risquerait le doublon, ignorer risquerait la fraude non vue — on
    // repasse, c'est la seule sortie qui ne perde rien.
    if (issue === "erreur") {
      const secondaire = await signalerEchec(
        travail.travail_id,
        "rattachement indisponible, à reprendre",
        false,
      );
      return {
        message_id: travail.message_id,
        statut: "echec",
        motif: "rattachement indisponible",
        echecSecondaire: secondaire ?? undefined,
      };
    }
  }

  // Un brouillon n'a pas été reçu : rien à analyser.
  if (message.isDraft) {
    const secondaire = await signalerEchec(
      travail.travail_id,
      "brouillon, ignoré",
      true,
    );
    return {
      message_id: travail.message_id,
      statut: "ignore",
      motif: "brouillon",
      echecSecondaire: secondaire ?? undefined,
    };
  }

  // Conversion du corps. C'est elle qui rend la signature trouvable : sur du
  // HTML brut, le moteur ne lit que des balises de fermeture.
  const corps = await etape("conversion du corps", () =>
    convertirCorps(message.body?.content ?? "", {
      format: message.body?.contentType === "text" ? "text" : "auto",
    }),
  );

  const verdict = await etape("analyse (moteur de détection)", () =>
    analyser(
      {
        nomAffiche: message.from?.emailAddress?.name ?? "",
        email: message.from?.emailAddress?.address ?? "",
        objet: message.subject ?? "",
        corps: corps.texte,
      },
      contexte,
    ),
  );

  // ⚠ ON GARDE L'IDENTIFIANT RENDU : c'est lui que la bannière portera, et
  //   c'est par lui qu'on retrouvera le message si son identifiant Graph
  //   change sous nos pieds au déplacement.
  const analyseId = await rpc<string>("enregistrer_analyse_graph", {
    p_travail_id: travail.travail_id,
    p_expediteur_nom: message.from?.emailAddress?.name ?? null,
    p_expediteur_email: message.from?.emailAddress?.address ?? null,
    p_nom_signe: verdict.nomSignature ?? verdict.nomRetenu ?? null,
    p_objet: message.subject ?? null,
    p_employe_email:
      message.toRecipients?.[0]?.emailAddress?.address ?? travail.upn,
    p_recu_at: message.receivedDateTime ?? null,
    p_score: verdict.score,
    p_niveau: verdict.niveauBase,
    p_alerte: verdict.alerte,
    p_signaux: verdict.signaux ?? [],
    p_raisons: verdict.raisons ?? [],
    p_citation_retiree: corps.citationRetiree,
    p_marqueur_citation: corps.marqueurCitation,
    p_blocs_masques: corps.blocsMasques,
    p_invisibles_retires: corps.invisiblesRetires,
    p_format_corps: corps.format,
    p_longueur_texte: corps.texte.length,
    p_duree_ms: Date.now() - debut,
  });

  // L'action vient APRÈS l'enregistrement du verdict, jamais avant : si elle
  // échoue, on garde la trace de ce qu'on a décidé. L'inverse laisserait un
  // message modifié sans qu'aucune ligne n'en témoigne — donc impossible à
  // retrouver pour le défaire.
  let action: Action = { mode: modeAction() };
  try {
    action = await agir(travail, message, verdict, analyseId);

    const categoriePosee =
      action.categorie?.etat === "posee" ? (action.categorie.nom ?? null) : null;
    const bannierePosee = action.banniere?.etat === "posee";

    const erreurs = [action.categorie?.erreur, action.banniere?.erreur]
      .filter(Boolean)
      .join(" | ");

    // ─────────────────────────────────────────────────────────────────────
    // TOUJOURS ENREGISTRER QUAND IL Y A ALERTE.
    //
    // La version précédente n'écrivait que si une catégorie ou une bannière
    // avait été posée, ou qu'une erreur s'était produite. En mode « off »,
    // aucun des trois : la ligne restait vierge, indiscernable d'une pose
    // réussie. Une alerte sans bannière était donc invisible en base.
    //
    // Désormais, une alerte laisse TOUJOURS une trace de ce qui a été fait,
    // y compris « rien, et voici pourquoi ».
    // ─────────────────────────────────────────────────────────────────────
    if (verdict.alerte) {
      await rpc("marquer_action_graph", {
        p_company_id: travail.company_id,
        p_message_id: travail.message_id,
        p_categorie: categoriePosee,
        p_banniere_posee: bannierePosee,
        p_erreur: erreurs ? erreurs.slice(0, 500) : null,
        p_action_etat: etatAction(action),
        p_banniere_format: action.banniere?.format ?? null,
      });
    }
  } catch (erreur) {
    // Une action ratée ne doit pas faire retenter l'analyse : le verdict est
    // écrit, et rejouer poserait la catégorie deux fois.
    const detail = messageDe(erreur);
    console.error(
      `[worker] action impossible sur ${travail.message_id} — ` +
        `étape « ${etapeDe(erreur)} » : ${detail}`,
    );
    // `agir` isole déjà chaque action et ne lève pas : arriver ici veut dire
    // que c'est l'ENREGISTREMENT qui a échoué, pas l'action elle-même. On
    // garde donc ce qu'`agir` a renvoyé — l'écraser ferait disparaître le
    // fait qu'une bannière a bel et bien été posée, et donc la trace
    // permettant de la retirer.
    action = { ...action, enregistrement: detail };
    await rpc("marquer_action_graph", {
      p_company_id: travail.company_id,
      p_message_id: travail.message_id,
      p_categorie: null,
      p_banniere_posee: false,
      p_erreur: `[${etapeDe(erreur)}] ${detail}`.slice(0, 500),
      p_action_etat: "echec",
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────
  // LE DÉPLACEMENT — SANS LUI, PERSONNE NE VOIT LA BANNIÈRE SOUS OUTLOOK.
  //
  // Outlook pour Windows ne redemande jamais un corps qu'il a déjà
  // téléchargé. La boîte restant ouverte toute la journée chez un client, il
  // gagne la course contre le worker presque à chaque fois : la bannière est
  // écrite, vérifiée, et invisible. Déplacer le message lui donne un nouvel
  // identifiant, donc aucun corps en cache, donc un rechargement.
  //
  // ⚠ APRÈS LA POSE, JAMAIS AVANT. Déplacer d'abord rouvrirait la course : le
  //   client téléchargerait le corps du message déplacé avant qu'on ne l'ait
  //   modifié.
  //
  // ⚠ ET APRÈS LA DERNIÈRE ÉCRITURE EN BASE, jamais entre deux. Le
  //   déplacement change l'identifiant du message ; tout ce qui s'écrit
  //   ensuite en le désignant par cet identifiant — `marquer_action_graph` en
  //   premier — ne trouverait plus sa ligne. La bannière serait posée sans que
  //   la base le sache : le rattrapage la reposerait, et `/menaces` la
  //   donnerait pour absente.
  //
  // ⚠ SON ÉCHEC N'ANNULE RIEN. Un avertissement posé et vu par la moitié des
  //   clients vaut mieux qu'aucun avertissement. Le déplacement raté se
  //   rattrape au balayage de la maintenance.
  // ─────────────────────────────────────────────────────────────────────
  //
  // ⚠ ET SON ÉCHEC S'ÉCRIT. Ne le consigner que dans les journaux de la
  //   plateforme revenait à ne pas le consigner : c'est ce qui a laissé cette
  //   étape ne jamais s'exécuter en production sans qu'aucun contrôle ne
  //   bronche. La raison va sur la ligne — désignée par son identifiant, qui
  //   ne change pas, et non par celui du message, qui vient peut-être de
  //   changer — et dans la réponse.
  if (action.banniere?.etat === "posee") {
    const echec = await deplacerPourRafraichir(travail).then(
      () => null,
      (erreur: unknown) =>
        `[${etapeDe(erreur)}] ${messageDe(erreur)}`.slice(0, 400),
    );

    if (echec) {
      console.error(`[worker] déplacement impossible sur ${travail.message_id} : ${echec}`);
      action = { ...action, deplacement: echec };
      if (analyseId) {
        await rpc("marquer_echec_deplacement", {
          p_analyse_id: analyseId,
          p_erreur: echec,
        }).catch((secondaire) => {
          console.error(`[worker] échec de déplacement non consigné : ${messageDe(secondaire)}`);
        });
      }
    }
  }

  return {
    message_id: travail.message_id,
    statut: "analyse",
    niveau: verdict.niveau,
    score: verdict.score,
    alerte: verdict.alerte,
    contexte: contexte ? "applique" : "absent",
    action,
  };
}

/* ==========================================================================
   Alerte au dirigeant
   ========================================================================== */

/**
 * Prévenir le dirigeant des tentatives de RISQUE ÉLEVÉ, et d'elles seules.
 *
 * ⚠ UNE PASSE SÉPARÉE, PAS UN APPEL DANS LA BOUCLE DES MESSAGES. Trois
 *   raisons, dans l'ordre d'importance :
 *
 *   1. Le mécanisme anti-rafale se raisonne par société, pas par message —
 *      il vit donc en base, dans deux fonctions qui réclament leur lot. Une
 *      décision prise message par message ne pourrait pas voir la rafale.
 *   2. Le résumé d'une fenêtre close doit partir même quand plus rien
 *      n'arrive. C'est précisément le cas où la file des messages est vide :
 *      un appel dans la boucle ne se déclencherait jamais.
 *   3. Un envoi lent n'a alors aucun effet sur le budget de traitement des
 *      messages.
 *
 * ⚠ ELLE NE LÈVE JAMAIS. Une panne Resend, une société sans destinataire, une
 *   fonction absente : tout revient en `erreur` dans le compte rendu. La
 *   bannière est la protection ; l'email n'en est que l'écho, et le worker ne
 *   doit pas s'arrêter pour lui.
 */
const ALERTES_PAR_PASSE = 5;

function fenetreAlerte(): number {
  const brut = Number(process.env.ALERTE_FENETRE_MINUTES);
  return Number.isFinite(brut) && brut >= 1 ? Math.floor(brut) : 60;
}

type Notification = {
  type: "alerte" | "resume";
  company_id: string;
  destinataires: number;
  envoyes: number;
  nombre?: number;
  erreur?: string;
};

async function destinatairesDe(companyId: string): Promise<string[]> {
  const lignes = await rpc<{ email: string }[]>("destinataires_alerte", {
    p_company_id: companyId,
  });
  return (Array.isArray(lignes) ? lignes : [])
    .map((l) => (l?.email ?? "").trim())
    .filter(Boolean);
}

/**
 * Une notification envoyée est une sortie de données hors de l'Union
 * européenne. Elle se journalise, comme les accès Graph — et pour une raison
 * plus forte : c'est le seul flux du produit dans ce cas.
 *
 * ⚠ ON NE JOURNALISE PAS LES ADRESSES, seulement leur NOMBRE. `journal_acces`
 *   refuse d'ailleurs toute valeur contenant « @ ». Recopier dans le journal
 *   ce qu'on surveille doublerait le risque au lieu de le réduire.
 */
async function tracerNotification(n: Notification): Promise<void> {
  await journaliserAcces({
    ressource: "notification",
    operation: "ecriture",
    resultat: n.envoyes > 0 ? "ok" : "erreur",
    companyId: n.company_id,
    ressourceRef: n.type === "resume" ? "resume-alertes" : "alerte-eleve",
    code: n.erreur ? "envoi-refuse" : null,
    volume: n.envoyes,
  });
}

async function notifierAlertes(): Promise<Notification[]> {
  const faits: Notification[] = [];
  const fenetre = fenetreAlerte();

  // ── Les résumés de fenêtre close ──────────────────────────────────────
  try {
    const resumes = await rpc<ResumeANotifier[]>("reclamer_resumes_alertes", {
      p_fenetre_minutes: fenetre,
      p_limite: ALERTES_PAR_PASSE,
    });

    for (const resume of Array.isArray(resumes) ? resumes : []) {
      const destinataires = await destinatairesDe(resume.company_id).catch(
        () => [] as string[],
      );
      const r = await envoyerResumeDirigeant(destinataires, resume);
      const fait: Notification = {
        type: "resume",
        company_id: resume.company_id,
        nombre: resume.nombre,
        ...r,
      };
      faits.push(fait);
      await tracerNotification(fait);

      // ⚠ ON NE REND PAS UN RÉSUMÉ À LA FILE. Il couvre N alertes déjà
      //   marquées ; les rendre toutes ferait repartir la société pour un
      //   deuxième résumé identique au passage suivant, et ainsi de suite
      //   tant que Resend est en panne. Une alerte détaillée, elle, est
      //   rendue : elle est seule, et la rejouer ne duplique rien.
      if (r.envoyes === 0) {
        console.error(
          `[worker] résumé d'alertes non envoyé pour ${resume.company_id} : ${r.erreur}`,
        );
      }
    }
  } catch (erreur) {
    faits.push({
      type: "resume",
      company_id: "-",
      destinataires: 0,
      envoyes: 0,
      erreur: messageDe(erreur),
    });
  }

  // ── Les alertes détaillées ────────────────────────────────────────────
  try {
    const alertes = await rpc<AlerteANotifier[]>(
      "reclamer_notifications_alertes",
      { p_fenetre_minutes: fenetre, p_limite: ALERTES_PAR_PASSE },
    );

    for (const alerte of Array.isArray(alertes) ? alertes : []) {
      const destinataires = await destinatairesDe(alerte.company_id).catch(
        () => [] as string[],
      );
      const r = await envoyerAlerteDirigeant(destinataires, alerte);
      const fait: Notification = {
        type: "alerte",
        company_id: alerte.company_id,
        ...r,
      };
      faits.push(fait);
      await tracerNotification(fait);

      if (r.envoyes === 0) {
        console.error(
          `[worker] alerte non envoyée pour ${alerte.message_id} : ${r.erreur}`,
        );
        // Rendue à la file : sans ça, une panne Resend CONSOMMERAIT la
        // notification — l'alerte serait marquée comme rapportée alors que
        // personne n'a rien reçu.
        await rpc("rendre_notification_alerte", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
        }).catch(() => {});
      }
    }
  } catch (erreur) {
    faits.push({
      type: "alerte",
      company_id: "-",
      destinataires: 0,
      envoyes: 0,
      erreur: messageDe(erreur),
    });
  }

  return faits;
}

/* ==========================================================================
   Rapport mensuel
   ========================================================================== */

/**
 * Le rapport mensuel au dirigeant, le 1er de chaque mois.
 *
 * ⚠ PAS DE PLANIFICATEUR, ET C'EST VOULU. Le worker tourne déjà toutes les
 *   minutes ; lui greffer cette passe évite d'introduire une seconde
 *   mécanique de déclenchement — donc un second endroit où la panne peut se
 *   loger silencieusement. La date n'est pas décidée ici mais en base :
 *   `mois_ecoule()` donne le mois couvert, et l'unicité
 *   `(company_id, mois)` fait que cent passages du worker ne produisent
 *   qu'un seul rapport.
 *
 * ⚠ ELLE NE LÈVE JAMAIS, comme la passe d'alertes. Un rapport qui ne part pas
 *   est un incident de communication ; il ne doit pas arrêter l'analyse des
 *   messages.
 */
const RAPPORTS_PAR_PASSE = 3;

type RapportEnvoye = {
  company_id: string;
  mois: string;
  reprise: boolean;
  destinataires: number;
  envoyes: number;
  erreur?: string;
};

type LigneRapport = {
  societe_id: string;
  mois_couvert: string;
  reprise: boolean;
  donnees: DonneesRapport;
};

async function rapporterMensuel(): Promise<RapportEnvoye[]> {
  const faits: RapportEnvoye[] = [];

  try {
    const lignes = await rpc<LigneRapport[]>("reclamer_rapports_mensuels", {
      p_limite: RAPPORTS_PAR_PASSE,
    });

    for (const ligne of Array.isArray(lignes) ? lignes : []) {
      const destinataires = await destinatairesDe(ligne.societe_id).catch(
        () => [] as string[],
      );
      const r = await envoyerRapportMensuel(destinataires, ligne.donnees);

      const fait: RapportEnvoye = {
        company_id: ligne.societe_id,
        mois: ligne.mois_couvert,
        reprise: ligne.reprise,
        ...r,
      };
      faits.push(fait);

      // ⚠ ON MARQUE L'ISSUE DANS LES DEUX CAS. Un échec laisse la ligne avec
      //   `envoye_at IS NULL` : elle repart après le délai de garde, et c'est
      //   elle que le contrôle « rapport mensuel » compte. L'effacer rendrait
      //   l'incident invisible.
      await rpc("marquer_rapport_mensuel", {
        p_company_id: ligne.societe_id,
        p_mois: ligne.mois_couvert,
        p_envoye: r.envoyes > 0,
        p_destinataires: r.envoyes,
        p_erreur: r.erreur ?? null,
      }).catch(() => {});

      await journaliserAcces({
        ressource: "rapport",
        operation: "ecriture",
        resultat: r.envoyes > 0 ? "ok" : "erreur",
        companyId: ligne.societe_id,
        // Le mois, pas une adresse : `journal_acces` refuse tout « @ ».
        ressourceRef: `rapport-${ligne.mois_couvert}`,
        code: r.erreur ? "envoi-refuse" : null,
        volume: r.envoyes,
      });

      if (r.envoyes === 0) {
        console.error(
          `[worker] rapport mensuel non envoyé pour ${ligne.societe_id} ` +
            `(${ligne.mois_couvert}) : ${r.erreur}`,
        );
      }
    }
  } catch (erreur) {
    faits.push({
      company_id: "-",
      mois: "-",
      reprise: false,
      destinataires: 0,
      envoyes: 0,
      erreur: messageDe(erreur),
    });
  }

  return faits;
}

/* ==========================================================================
   Point d'entrée
   ========================================================================== */

async function executer(): Promise<Response> {
  const travaux = await rpc<Travail[]>("reclamer_travaux_graph", {
    p_limite: LOT,
  });

  if (!Array.isArray(travaux) || travaux.length === 0) {
    // ⚠ LA PASSE D'ALERTES TOURNE MÊME QUAND LA FILE EST VIDE, et c'est
    //   indispensable : le résumé d'une fenêtre close part une heure APRÈS la
    //   dernière alerte, c'est-à-dire au moment le plus probable où plus rien
    //   n'arrive. Sous l'ancien retour anticipé, il n'aurait jamais été envoyé.
    return Response.json({
      traites: 0,
      resultats: [],
      notifications: await notifierAlertes(),
      // Le 1er du mois, la file des messages est vide comme n'importe quel
      // autre jour : le rapport ne peut pas dépendre de ce qu'elle contient.
      rapports: await rapporterMensuel(),
    });
  }

  const resultats: Resultat[] = [];
  const echeance = Date.now() + BUDGET_MS;
  const contextes = new Map<string, ContexteDetection | null>();

  for (const travail of travaux) {
    if (Date.now() > echeance) {
      // On rend la main : les travaux non traités repassent en attente
      // au bout de dix minutes, ou dès le prochain tour si le lot est vide.
      await signalerEchec(
        travail.travail_id,
        "budget de temps dépassé, repris au tour suivant",
        false,
      );
      continue;
    }

    try {
      const contexte = await contextePour(travail.company_id, contextes);
      resultats.push(await traiter(travail, contexte));
    } catch (erreur) {
      const graph = erreur instanceof ErreurGraph ? erreur : null;
      const detail = messageDe(erreur);
      const ou = etapeDe(erreur);

      console.error(
        `[worker] ${travail.message_id} — étape « ${ou} » : ${detail}`,
        graph ? `(HTTP ${graph.statut}, ${graph.code})` : "",
      );

      // signalerEchec avale ses propres pannes : sans ça, une erreur ici
      // remplacerait celle qu'on est en train de traiter.
      const secondaire = await signalerEchec(
        travail.travail_id,
        `[${ou}] ${detail}`,
        // Un message supprimé, une permission manquante : inutile d'insister.
        graph ? !graph.reessayable : false,
      );

      resultats.push({
        message_id: travail.message_id,
        statut: "echec",
        etape: ou,
        motif: detail.slice(0, 300),
        echecSecondaire: secondaire ?? undefined,
      });
    }
  }

  return Response.json({
    traites: resultats.filter((r) => r.statut === "analyse").length,
    echecs: resultats.filter((r) => r.statut === "echec").length,
    resultats,
    // Après la boucle : les bannières du lot sont posées, donc éligibles.
    notifications: await notifierAlertes(),
    rapports: await rapporterMensuel(),
  });
}

/* ==========================================================================
   Diagnostic
   ========================================================================== */

type Controle = { controle: string; etat: "ok" | "échec"; detail: string };

/**
 * Vérifie chaque dépendance, une par une, SANS TOUCHER À LA FILE.
 *
 * Quand le worker répond par une erreur, il est impossible de savoir depuis
 * l'extérieur laquelle de ses cinq dépendances a lâché : variables
 * d'environnement, PostgREST, les trois fonctions Postgres, le jeton Graph,
 * l'annuaire. Ce mode les prend dans l'ordre et dit laquelle casse.
 *
 * Aucun travail n'est réclamé, aucun message lu, aucune ligne modifiée : on
 * peut le lancer autant de fois qu'on veut, y compris en production.
 */
async function diagnostiquer(): Promise<Response> {
  const controles: Controle[] = [];
  const ajouter = (controle: string, etat: "ok" | "échec", detail: string) =>
    controles.push({ controle, etat, detail });

  // 1. Environnement. On ne révèle JAMAIS les valeurs, seulement la présence.
  const requises = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "WORKER_SECRET",
    "MS_CLIENT_ID",
    "MS_CLIENT_SECRET",
  ];
  const absentes = requises.filter((v) => !process.env[v]);

  ajouter(
    "mode d'action (GRAPH_ACTIONS)",
    "ok",
    modeAction() === "off"
      ? "off — aucune écriture dans les boîtes"
      : `${modeAction()} — LE WORKER ÉCRIT DANS LES BOÎTES`,
  );
  // Pas dans « requises » : la maintenance sait retrouver l'adresse du webhook
  // sans elle (déploiement Netlify, adresse déjà utilisée, en-tête d'appel).
  // La signaler reste utile — une adresse explicite vaut mieux qu'une déduite.
  ajouter(
    "GRAPH_NOTIFICATION_URL",
    "ok",
    process.env.GRAPH_NOTIFICATION_URL
      ? "définie"
      : "absente — l'adresse du webhook sera déduite du déploiement. " +
        "Vérifier : POST /api/microsoft/maintenance?seulement=abonnements",
  );
  // Le raccordement d'un nouveau client en dépend, et une valeur qui ne
  // correspond pas au caractère près à Azure échoue au milieu du parcours.
  // Ici on ne vérifie que ce qui est vérifiable sans appeler Microsoft.
  {
    const brute = process.env.MS_REDIRECT_URI?.trim();
    const attendu = "/api/microsoft/consentement";
    let etat: "ok" | "échec" = "ok";
    let detail: string;
    if (!brute) {
      detail =
        "absente — aucun client ne peut se raccorder. Poser la valeur exacte " +
        "déclarée dans Azure.";
      etat = "échec";
    } else {
      try {
        const u = new URL(brute);
        if (u.protocol !== "https:" || u.pathname !== attendu) {
          etat = "échec";
          detail = `${brute} — attendu : https + chemin ${attendu}, sans barre oblique finale`;
        } else {
          detail = `${brute} — doit correspondre au caractère près à Azure`;
        }
      } catch {
        etat = "échec";
        detail = `${brute} — n'est pas une URL`;
      }
    }
    ajouter("MS_REDIRECT_URI", etat, detail);
  }

  ajouter(
    "variables d'environnement",
    absentes.length === 0 ? "ok" : "échec",
    absentes.length === 0
      ? `${requises.length} présentes`
      : `absentes : ${absentes.join(", ")}`,
  );

  if (absentes.includes("NEXT_PUBLIC_SUPABASE_URL") || absentes.includes("SUPABASE_SECRET_KEY")) {
    return Response.json({ diagnostic: controles }, { status: 500 });
  }

  // 1 bis. OÙ CE CODE S'EXÉCUTE. La politique de confidentialité affirme que
  //        le contenu des messages ne sort jamais de l'Union européenne : c'est
  //        ici que le corps d'un message est lu et analysé. Un réglage remis
  //        sur une région américaine rendrait cette phrase fausse en silence.
  //
  //        On lit la région réelle du processus, pas la valeur attendue.
  //        Netlify exécute les fonctions sur AWS Lambda, qui renseigne
  //        AWS_REGION. Si rien n'est renseigné, on le dit plutôt que de
  //        conclure.
  {
    const region =
      process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? null;
    const europeenne = region ? /^eu-/.test(region) : false;
    ajouter(
      "région d'exécution",
      region === null ? "ok" : europeenne ? "ok" : "échec",
      region === null
        ? "non renseignée par l'hébergeur — à vérifier dans Netlify : " +
          "Build & deploy → Functions region"
        : europeenne
          ? `${region} — Union européenne`
          : `${region} — HORS UNION EUROPÉENNE. Le corps des messages y est ` +
            `analysé, ce que la politique de confidentialité exclut. ` +
            `Corriger dans Netlify : Build & deploy → Functions region.`,
    );
  }

  // 2. Les fonctions du worker répondent-elles ?
  //    On les appelle avec des paramètres inoffensifs.
  //
  // ⚠ L'UUID NUL NE CONVIENT PLUS POUR UNE SOCIÉTÉ, ET C'EST RÉCENT. Tant que
  //   `contexte_detection_graph` se contentait de LIRE (version SQL de la
  //   migration 20260827), un identifiant ne correspondant à rien renvoyait
  //   trois tableaux vides sans rien toucher. Depuis 20260915, elle ÉCRIT une
  //   ligne de journal avant de rendre son résultat, en y reportant le
  //   `company_id` reçu — et `journal_acces.company_id` porte une clé
  //   étrangère vers `companies`. Un zéro, syntaxiquement valide mais absent
  //   de la table, fait donc échouer toute la fonction sur un 23503.
  //
  //   `NULL` passe, lui : la colonne est nullable. Et c'est la valeur juste,
  //   pas un contournement — un appel de diagnostic n'est rattaché à aucune
  //   société, et la ligne de journal doit dire exactement cela.
  //
  // ⚠ LE ZÉRO RESTE BON POUR UN IDENTIFIANT DE TRAVAIL. `echec_travail_graph`
  //   n'a pas été réécrite par 20260915, ne journalise pas, et se contente de
  //   ne mettre à jour aucune ligne. La distinction est dans la contrainte, pas
  //   dans le type.
  const TRAVAIL_INEXISTANT = "00000000-0000-0000-0000-000000000000";

  for (const [nom, parametres, attendu] of [
    ["contexte_detection_graph", { p_company_id: null }, "objet JSON"],
    ["echec_travail_graph", { p_travail_id: TRAVAIL_INEXISTANT, p_erreur: "diagnostic", p_definitif: false }, "corps vide (RETURNS VOID)"],
  ] as const) {
    try {
      const r = await rpc<unknown>(nom, parametres);
      ajouter(
        `fonction ${nom}`,
        "ok",
        `répond — ${attendu}${r === null ? ", corps vide comme prévu" : ""}`,
      );
    } catch (erreur) {
      ajouter(`fonction ${nom}`, "échec", messageDe(erreur));
    }
  }

  // 2 quater. LE JOURNAL A-T-IL PERDU DES LIGNES ?
  //
  // ⚠ CE CONTRÔLE EXISTE PARCE QUE L'ÉCHEC EST DEVENU SILENCIEUX, ET C'EST
  //   VOULU. Depuis la migration 20260918, un refus d'écriture du journal ne
  //   fait plus échouer la lecture qui l'a déclenché — la détection garde ses
  //   règles. Le revers est qu'il ne se voit plus nulle part. Il se voit ici,
  //   et la veille en envoie un mail.
  //
  // ⚠ « recents » PLUTÔT QUE « total » POUR L'ÉTAT. Un incident réglé le mois
  //   dernier ne doit pas maintenir le contrôle au rouge, mais son décompte
  //   reste affiché : un journal qui a eu des trous, même anciens, est une
  //   information à garder sous les yeux.
  try {
    const [echecs] = await rpc<
      {
        recents: number;
        total: number;
        dernier_at: string | null;
        codes: string;
      }[]
    >("echecs_de_journalisation", {});

    const recents = echecs?.recents ?? 0;
    const total = echecs?.total ?? 0;

    ajouter(
      "journalisation des accès",
      recents > 0 ? "échec" : "ok",
      total === 0
        ? "aucune écriture refusée"
        : `${recents} refus dans les 24 h (${total} au total). ` +
          `Code(s) SQL : ${echecs.codes || "inconnu"}. ` +
          `Dernier : ${echecs.dernier_at}. ` +
          `Les lectures concernées ont abouti — c'est leur TRACE qui manque. ` +
          `Détail : SELECT * FROM journal_echecs ORDER BY at DESC;`,
    );
  } catch (erreur) {
    ajouter("journalisation des accès", "échec", messageDe(erreur));
  }

  // 2 bis. LE CONTRÔLE QUI COMPTE : une alerte sans bannière est un mail
  //        frauduleux qui n'a pas été signalé à son destinataire.
  try {
    const [compte] = await rpc<
      { total: number; reparables: number; plus_ancienne: string | null }[]
    >("compter_alertes_sans_banniere", {});

    ajouter(
      "alertes sans bannière",
      compte && compte.total > 0 ? "échec" : "ok",
      !compte || compte.total === 0
        ? "aucune"
        : `${compte.total} alerte(s) sans bannière, dont ${compte.reparables} ` +
          `réparable(s) au prochain passage de la maintenance. ` +
          `La plus ancienne : ${compte.plus_ancienne}. ` +
          `Détail : SELECT * FROM alertes_sans_banniere;`,
    );
  } catch (erreur) {
    ajouter("alertes sans bannière", "échec", messageDe(erreur));
  }

  // 2 ter. L'AUTRE CONTRÔLE QUI COMPTE. Une alerte sans bannière est un mail
  //        non signalé ; un abonnement mort, c'est toute une boîte qui n'est
  //        plus regardée — et cette panne-là ne produit aucune alerte, donc
  //        rien ne manque nulle part. Elle est passée inaperçue dix jours.
  try {
    const [compte] = await rpc<
      {
        total: number;
        morts: number;
        expire_bientot: number;
        prochaine_expiration: string | null;
      }[]
    >("compter_abonnements_en_alerte", {});

    const enPanne = compte ? compte.morts + compte.expire_bientot : 0;
    ajouter(
      "abonnements Graph",
      !compte || compte.total === 0 || enPanne > 0 ? "échec" : "ok",
      !compte || compte.total === 0
        ? "AUCUN abonnement : plus aucune boîte n'est surveillée."
        : enPanne === 0
          ? `${compte.total} actif(s), prochaine expiration ${compte.prochaine_expiration}`
          : `${compte.morts} mort(s), ${compte.expire_bientot} expirant sous 48 h, ` +
            `sur ${compte.total}. Détail : SELECT * FROM abonnements_en_alerte;`,
    );
  } catch (erreur) {
    ajouter("abonnements Graph", "échec", messageDe(erreur));
  }

  // 2 quater. Et qui surveille la veille ? Elle note chaque passage : si la
  //           dernière trace remonte à plus d'un jour, plus personne ne
  //           regarde les deux vues, et le silence ne veut plus rien dire.
  try {
    const [veille] = await rpc<
      {
        dernier_controle_at: string | null;
        muette: boolean;
        probleme_en_cours: boolean;
        envois: number;
        echecs_consecutifs: number;
        derniere_erreur: string | null;
        secours_configure: boolean;
      }[]
    >("etat_veille", {});

    const souci = !veille || veille.muette || veille.echecs_consecutifs > 0;
    ajouter(
      "veille (alerte par mail)",
      souci ? "échec" : "ok",
      !veille
        ? "aucun état : migration 20260905 non appliquée ?"
        : veille.muette
          ? `AUCUN passage depuis ${veille.dernier_controle_at ?? "jamais"} — ` +
            `la tâche pg_cron safentreprise-veille ne tourne plus.`
          : veille.echecs_consecutifs > 0
            ? `${veille.echecs_consecutifs} envoi(s) en échec — ${veille.derniere_erreur ?? "sans détail"}` +
              (veille.secours_configure ? "" : " ; SECOURS NON CONFIGURÉ (parametres_systeme.resend_api_key)")
            : `dernier passage ${veille.dernier_controle_at}, ` +
              `${veille.probleme_en_cours ? "un problème est signalé" : "rien à signaler"}`,
    );
  } catch (erreur) {
    ajouter("veille (alerte par mail)", "échec", messageDe(erreur));
  }

  // 2 quinquies. L'ALERTE AU DIRIGEANT. Deux choses peuvent la rendre muette
  //              sans que rien d'autre ne bouge : une adresse d'expédition
  //              hors du domaine — la garde refuse alors chaque envoi — et
  //              une file qui s'allonge parce que les envois échouent.
  {
    const from = expediteurVerifie([
      "ALERTE_FROM_EMAIL",
      "VEILLE_FROM_EMAIL",
      "DEMO_FROM_EMAIL",
    ]);
    ajouter(
      "expéditeur des alertes",
      from ? "ok" : "échec",
      from
        ? `${from} — doit être vérifiée chez Resend`
        : erreurExpediteur(["ALERTE_FROM_EMAIL", "VEILLE_FROM_EMAIL"]),
    );
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.SUPABASE_SECRET_KEY as string;
    // ⚠ LECTURE DIRECTE, PAS `reclamer_notifications_alertes` : celle-ci
    //   MARQUE ce qu'elle rend. Un diagnostic qui consomme la file enverrait
    //   des alertes à chaque contrôle.
    const r = await fetch(
      `${url}/rest/v1/graph_analyses?select=company_id,analyse_at` +
        `&alerte=is.true&niveau=eq.eleve&notifiee_at=is.null` +
        `&banniere_posee_at=not.is.null&restauree_at=is.null` +
        `&order=analyse_at.asc&limit=200`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
    );
    const lignes = (await r.json()) as { analyse_at: string }[];
    const attente = Array.isArray(lignes) ? lignes.length : 0;

    // Une alerte encore en attente une heure après son analyse n'attend plus
    // la fenêtre : elle n'est pas partie.
    const limite = Date.now() - fenetreAlerte() * 60_000;
    const bloquees = (Array.isArray(lignes) ? lignes : []).filter(
      (l) => new Date(l.analyse_at).getTime() < limite,
    ).length;

    ajouter(
      "alertes dirigeant en attente",
      bloquees > 0 ? "échec" : "ok",
      attente === 0
        ? "aucune"
        : bloquees === 0
          ? `${attente} en attente de la prochaine fenêtre (${fenetreAlerte()} min) — normal`
          : `${bloquees} alerte(s) en attente depuis plus de ${fenetreAlerte()} min ` +
            `sur ${attente}. L'envoi ne passe pas : vérifier la clé Resend et ` +
            `l'adresse d'expédition. Essai en blanc : POST ?essai-alerte=1.`,
    );
  } catch (erreur) {
    ajouter("alertes dirigeant en attente", "échec", messageDe(erreur));
  }

  // 2 quinquies bis. LES MESSAGES RESTÉS EN TRANSIT.
  //
  // ⚠ CE CONTRÔLE EXISTE PARCE QU'ON A PROMIS QU'AUCUN MESSAGE NE RESTERAIT
  //   COINCÉ. Le worker sort chaque message bannièrisé de la boîte de
  //   réception pour l'y remettre aussitôt — sans quoi Outlook desktop ne
  //   relit jamais le corps modifié. Si le retour échoue, le message dort
  //   dans un sous-dossier visible de son destinataire, ce qui n'est pas un
  //   état acceptable. La maintenance le ramène de nuit ; ce voyant dit s'il
  //   y en a un qui attend.
  try {
    const [etat] = await rpc<
      {
        en_cours: number;
        bloques: number;
        plus_ancien: string | null;
        multiples: number;
      }[]
    >("etat_deplacements", {});

    const bloques = etat?.bloques ?? 0;
    const multiples = etat?.multiples ?? 0;

    ajouter(
      "messages en transit",
      bloques > 0 || multiples > 0 ? "échec" : "ok",
      !etat
        ? "aucun état : migration 20260923 non appliquée ?"
        : bloques === 0 && multiples === 0
          ? etat.en_cours > 0
            ? `${etat.en_cours} déplacement(s) en cours — normal, ils durent une fraction de seconde`
            : "aucun message en transit"
          : [
              bloques > 0
                ? `${bloques} message(s) DANS LE DOSSIER DE SERVICE depuis ${etat.plus_ancien}. ` +
                  `Ils sont visibles par leur destinataire mais hors de sa boîte de réception. ` +
                  `POST /api/microsoft/maintenance les ramène immédiatement.`
                : "",
              // Un message déplacé plus de deux fois trahit un webhook rejoué
              // que le rattachement n'a pas attrapé : c'est la boucle qu'on
              // veut voir venir avant qu'elle ne double les alertes.
              multiples > 0
                ? `${multiples} message(s) déplacé(s) plus de deux fois — ` +
                  `rattachement en défaut, vérifier : SELECT message_id, deplacements ` +
                  `FROM graph_analyses WHERE deplacements > 2;`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
    );
  } catch (erreur) {
    ajouter("messages en transit", "échec", messageDe(erreur));
  }

  // 2 quinquies bis. LE DÉPLACEMENT ABOUTIT-IL ?
  //
  // ⚠ LE CONTRÔLE QUI MANQUAIT, ET DONT L'ABSENCE A COÛTÉ LA FONCTIONNALITÉ.
  //   « Messages en transit » ne regarde que les déplacements COMMENCÉS. Un
  //   déplacement qui échoue avant même de commencer — création du dossier de
  //   service refusée — n'en laisse aucun, et ce voyant restait obstinément
  //   vert pendant que pas une bannière n'était déplacée.
  //
  //   La question posée ici est la seule qui compte : des bannières sont
  //   posées, sont-elles déplacées ? Si la réponse est non, l'avertissement
  //   reste invisible dans Outlook desktop — le défaut qu'on croyait corrigé.
  try {
    const [etat] = await rpc<
      {
        boites_actives: number;
        avec_dossier: number;
        bannieres_24h: number;
        deplacees_24h: number;
        derniere_erreur: string | null;
      }[]
    >("etat_dossiers_service", {});

    if (!etat) {
      ajouter("dossier de service", "échec", "aucun état : migration 20260924 non appliquée ?");
    } else {
      // Rien posé depuis 24 h : il n'y a rien à conclure, ni dans un sens ni
      // dans l'autre. Un voyant qui rougirait faute d'alertes apprendrait à
      // être ignoré.
      const sansMatiere = etat.bannieres_24h === 0;
      const aucunDeplacement = etat.bannieres_24h > 0 && etat.deplacees_24h === 0;

      ajouter(
        "dossier de service",
        aucunDeplacement ? "échec" : "ok",
        sansMatiere
          ? `aucune bannière posée depuis 24 h — rien à conclure ` +
            `(${etat.avec_dossier}/${etat.boites_actives} boîte(s) ont leur dossier)`
          : aucunDeplacement
            ? `${etat.bannieres_24h} bannière(s) posée(s) depuis 24 h et AUCUNE déplacée. ` +
              `L'avertissement reste invisible dans Outlook desktop sur une boîte ouverte. ` +
              `${etat.avec_dossier}/${etat.boites_actives} boîte(s) ont un dossier de service. ` +
              (etat.derniere_erreur
                ? `Dernière raison : ${etat.derniere_erreur}`
                : `Aucune raison consignée — POST ?essai-deplacement=1 pour la provoquer.`)
            : `${etat.deplacees_24h}/${etat.bannieres_24h} bannière(s) déplacée(s) sur 24 h, ` +
              `${etat.avec_dossier}/${etat.boites_actives} boîte(s) ont leur dossier de service`,
      );
    }
  } catch (erreur) {
    ajouter("dossier de service", "échec", messageDe(erreur));
  }

  // 2 sexies. LE RAPPORT MENSUEL. Sa panne est la plus discrète du produit :
  //           elle ne casse rien, ne produit aucune erreur visible, et ne se
  //           constate qu'en s'apercevant qu'un client n'a rien reçu depuis
  //           trois mois. D'où un contrôle explicite.
  try {
    const [etat] = await rpc<
      {
        mois: string;
        eligibles: number;
        envoyes: number;
        en_echec: number;
        jamais_reclames: number;
        derniere_erreur: string | null;
      }[]
    >("etat_rapports_mensuels", {});

    // ⚠ ON NE PASSE AU ROUGE QU'APRÈS UN DÉLAI DE COURTOISIE. Le 1er à
    //   00 h 05, `jamais_reclames` vaut légitimement le nombre de clients :
    //   le worker n'est pas encore passé. Rougir immédiatement ferait du
    //   contrôle une alarme mensuelle qu'on apprendrait à ignorer.
    const jour = new Date().getUTCDate();
    const enRetard = jour >= 2;
    const manquants = etat
      ? etat.en_echec + (enRetard ? etat.jamais_reclames : 0)
      : 0;

    ajouter(
      "rapport mensuel",
      !etat ? "échec" : manquants > 0 ? "échec" : "ok",
      !etat
        ? "aucun état : migration 20260921 non appliquée ?"
        : manquants === 0
          ? `${etat.mois} — ${etat.envoyes} envoyé(s) sur ${etat.eligibles} ` +
            `société(s)` +
            (etat.jamais_reclames > 0
              ? `, ${etat.jamais_reclames} en attente du prochain passage`
              : "")
          : `${etat.mois} — ${manquants} rapport(s) DÛ(S) NON PARTI(S) : ` +
            `${etat.en_echec} en échec, ${etat.jamais_reclames} jamais ` +
            `réclamé(s), sur ${etat.eligibles} société(s). ` +
            `Dernière erreur : ${etat.derniere_erreur ?? "aucune"}. ` +
            `Détail : SELECT * FROM etat_rapports_mensuels(); ` +
            `Essai en blanc : POST ?essai-rapport=1.`,
    );
  } catch (erreur) {
    ajouter("rapport mensuel", "échec", messageDe(erreur));
  }

  // 3. État de la file, par simple lecture.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.SUPABASE_SECRET_KEY as string;
    const r = await fetch(
      `${url}/rest/v1/graph_file_attente?select=statut&limit=200`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
    );
    const lignes = (await r.json()) as { statut: string }[];
    const parStatut: Record<string, number> = {};
    for (const l of lignes) parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
    ajouter(
      "file d'attente",
      "ok",
      Object.keys(parStatut).length
        ? Object.entries(parStatut).map(([s, n]) => `${s}: ${n}`).join(", ")
        : "vide",
    );
  } catch (erreur) {
    ajouter("file d'attente", "échec", messageDe(erreur));
  }

  // 4. Locataires raccordés, et jeton Graph pour chacun.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.SUPABASE_SECRET_KEY as string;
    const r = await fetch(
      `${url}/rest/v1/microsoft_tenants?select=tenant_id,company_id,statut&statut=eq.actif`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
    );
    const locataires = (await r.json()) as {
      tenant_id: string;
      company_id: string;
    }[];

    ajouter(
      "locataires actifs",
      locataires.length > 0 ? "ok" : "échec",
      locataires.length > 0
        ? `${locataires.length} — ${locataires.map((l) => l.tenant_id).join(", ")}`
        : "aucun : lancer npm run graph:abonner",
    );

    for (const locataire of locataires) {
      try {
        await obtenirJeton(locataire.tenant_id);
        ajouter(`jeton Graph ${locataire.tenant_id}`, "ok", "obtenu");
      } catch (erreur) {
        ajouter(`jeton Graph ${locataire.tenant_id}`, "échec", messageDe(erreur));
      }

      try {
        const contexte = await rpc<ContexteDetection>(
          "contexte_detection_graph",
          { p_company_id: locataire.company_id },
        );
        const interne = contexte?.domainesInternes?.length ?? 0;
        ajouter(
          `contexte société ${locataire.company_id.slice(0, 8)}`,
          interne > 0 ? "ok" : "échec",
          interne > 0
            ? `${interne} domaine(s) interne(s), ` +
              `${contexte.domainesAutorises.length} autorisé(s), ` +
              `${contexte.annuaire.length} personne(s)`
            : "aucun domaine interne — le moteur tournera SANS détection de " +
              "typosquattage ni d'usurpation. Lancer npm run graph:annuaire.",
        );
      } catch (erreur) {
        ajouter(
          `contexte société ${locataire.company_id.slice(0, 8)}`,
          "échec",
          messageDe(erreur),
        );
      }
    }
  } catch (erreur) {
    ajouter("locataires actifs", "échec", messageDe(erreur));
  }

  const echecs = controles.filter((c) => c.etat === "échec");
  return Response.json(
    {
      resume: echecs.length === 0
        ? `${controles.length} contrôles, tout est vert`
        : `${echecs.length} contrôle(s) en échec : ${echecs.map((c) => c.controle).join(", ")}`,
      diagnostic: controles,
    },
    { status: echecs.length === 0 ? 200 : 500 },
  );
}

/**
 * Essai de l'alerte au dirigeant, en blanc.
 *
 * ⚠ IL N'ÉCRIT RIEN ET NE CONSOMME RIEN. Aucune alerte n'est réclamée, aucune
 *   ligne marquée : on peut le lancer en production autant qu'on veut. C'est
 *   la seule façon de vérifier la chaîne d'envoi — domaine vérifié chez
 *   Resend, clé valide, mise en forme lisible sur un téléphone — sans
 *   attendre qu'une vraie fraude arrive.
 *
 * ⚠ IL N'ÉCRIT PAS AU DIRIGEANT NON PLUS. Le destinataire est
 *   `ALERTE_ESSAI_EMAIL`, à défaut `DEMO_NOTIFICATION_EMAIL` : une adresse
 *   d'exploitation. Envoyer un faux « tentative de fraude détectée » à un
 *   client est exactement ce qu'un mode d'essai ne doit pas pouvoir faire.
 *
 * ⚠ LES DONNÉES SONT FICTIVES, y compris l'expéditeur et la boîte. Rien de
 *   réel ne part vers Resend pour un essai.
 */
async function essaiAlerte(): Promise<Response> {
  const destinataire =
    process.env.ALERTE_ESSAI_EMAIL?.trim() ||
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    "";

  if (!destinataire) {
    return Response.json(
      {
        essai: "alerte-dirigeant",
        envoye: false,
        erreur:
          "Aucun destinataire d'essai : poser ALERTE_ESSAI_EMAIL (ou, à " +
          "défaut, DEMO_NOTIFICATION_EMAIL). L'essai n'écrit jamais au " +
          "dirigeant d'un client.",
      },
      { status: 400 },
    );
  }

  const resultat = await envoyerAlerteDirigeant([destinataire], alerteFictive());

  return Response.json(
    {
      essai: "alerte-dirigeant",
      destinataire,
      envoye: resultat.envoyes > 0,
      erreur: resultat.erreur,
      rappel:
        "Aucune ligne n'a été lue ni marquée : la file des alertes est " +
        "intacte. Les données de ce message sont fictives.",
    },
    { status: resultat.envoyes > 0 ? 200 : 502 },
  );
}

/**
 * Essai du rapport mensuel, en blanc. Mêmes garanties que `essaiAlerte` :
 * aucune lecture, aucune écriture, aucune ligne réclamée, et jamais un
 * destinataire client.
 *
 * ⚠ IL N'ATTEND PAS LE 1er DU MOIS. C'est tout l'intérêt : le rendu d'un
 *   email HTML se vérifie dans un vrai client de messagerie, pas sur une
 *   capture. Sans ce mode, il faudrait attendre trente jours pour voir si le
 *   tableau tient dans Outlook.
 */
async function essaiRapport(): Promise<Response> {
  const destinataire =
    process.env.ALERTE_ESSAI_EMAIL?.trim() ||
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    "";

  if (!destinataire) {
    return Response.json(
      {
        essai: "rapport-mensuel",
        envoye: false,
        erreur:
          "Aucun destinataire d'essai : poser ALERTE_ESSAI_EMAIL (ou, à " +
          "défaut, DEMO_NOTIFICATION_EMAIL). L'essai n'écrit jamais au " +
          "dirigeant d'un client.",
      },
      { status: 400 },
    );
  }

  const resultat = await envoyerRapportMensuel([destinataire], rapportFictif());

  return Response.json(
    {
      essai: "rapport-mensuel",
      destinataire,
      envoye: resultat.envoyes > 0,
      erreur: resultat.erreur,
      rappel:
        "Aucune ligne n'a été lue ni marquée : la file des rapports est " +
        "intacte. Les chiffres de ce message sont fictifs.",
    },
    { status: resultat.envoyes > 0 ? 200 : 502 },
  );
}

/**
 * Tente la création du dossier de service, et rend l'erreur Graph telle quelle.
 *
 * ⚠ IL NE TOUCHE À AUCUN MESSAGE. Ni lecture de corps, ni écriture, ni
 *   déplacement : uniquement l'étape qui échoue aujourd'hui, la création du
 *   sous-dossier. C'est ce qui permet de l'essayer autant qu'on veut, sur une
 *   boîte réelle, sans fabriquer un message frauduleux à chaque fois et sans
 *   rien modifier chez le client.
 *
 * ⚠ IL N'EST PAS EN BLANC, et c'est voulu. Créer le dossier est précisément
 *   l'opération à valider ; la simuler ne prouverait rien. L'opération est
 *   idempotente — le dossier existant est retrouvé, pas recréé — et le
 *   dossier est de toute façon celui que le produit crée en fonctionnement
 *   normal.
 */
async function essaiDeplacement(): Promise<Response> {
  type Boite = {
    boite_id: string;
    company_id: string;
    tenant_id: string;
    graph_user_id: string;
    upn: string;
  };

  const boites = await rpc<Boite[]>("boites_a_rattraper", {
    p_interval_minutes: 1,
    p_limite: 3,
  }).catch((erreur) => {
    console.error(`[worker] essai-deplacement : ${messageDe(erreur)}`);
    return [] as Boite[];
  });

  if (!Array.isArray(boites) || boites.length === 0) {
    return Response.json({
      essai: "deplacement",
      resultat: "aucune boîte à essayer",
      indice:
        "Aucune boîte active éligible à l'instant. Elles le redeviennent une " +
        "minute après leur dernier rattrapage — réessayer dans une minute.",
    });
  }

  const details: Record<string, unknown>[] = [];
  let reussies = 0;

  for (const boite of boites) {
    try {
      const dossier = await assurerDossierService(boite.tenant_id, boite.graph_user_id);

      // On le mémorise : si l'essai passe, le worker n'aura pas à le retrouver.
      const memorise = await rpc("enregistrer_dossier_service", {
        p_boite_id: boite.boite_id,
        p_dossier_id: dossier,
      })
        .then(() => "oui")
        .catch((erreur) => `non (${messageDe(erreur)})`);

      reussies += 1;
      details.push({
        boite: boite.upn,
        dossier: `${DOSSIER_SERVICE} — ${dossier.slice(0, 24)}…`,
        memorise,
      });
    } catch (erreur) {
      // ⚠ L'ERREUR GRAPH EST RENDUE TELLE QUELLE, code et statut compris.
      //   C'est tout l'objet de cet essai : jusqu'ici elle n'existait que
      //   dans les journaux de la plateforme.
      details.push({
        boite: boite.upn,
        echec: messageDe(erreur),
        statut: erreur instanceof ErreurGraph ? erreur.statut : null,
        code: erreur instanceof ErreurGraph ? erreur.code : null,
        reessayable: erreur instanceof ErreurGraph ? erreur.reessayable : null,
        etape: etapeDe(erreur),
      });
    }
  }

  return Response.json({
    essai: "deplacement",
    dossier: DOSSIER_SERVICE,
    essayees: boites.length,
    reussies,
    details,
    lecture:
      reussies === boites.length
        ? "Le dossier de service est créable. Si le déplacement échoue encore, " +
          "la cause est plus loin : POST ?verifier=1, contrôle « dossier de service »."
        : "La création du dossier est refusée. Le champ « code » nomme la " +
          "raison côté Microsoft ; un 403 désigne le rôle Exchange, pas le code.",
  });
}

/** Le secret partagé protège le déclenchement. */
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

  const parametres = new URL(request.url).searchParams;

  // ?verifier=1 — contrôle les dépendances sans rien consommer.
  if (parametres.has("verifier")) {
    return diagnostiquer();
  }

  // ?essai-alerte=1 — envoie l'alerte au dirigeant, en blanc.
  if (parametres.has("essai-alerte")) {
    return essaiAlerte();
  }

  // ?essai-rapport=1 — envoie le rapport mensuel, en blanc.
  if (parametres.has("essai-rapport")) {
    return essaiRapport();
  }

  // ?essai-deplacement=1 — tente la création du dossier de service, sans
  // toucher à un seul message.
  if (parametres.has("essai-deplacement")) {
    return essaiDeplacement();
  }

  try {
    return await executer();
  } catch (erreur) {
    const detail = messageDe(erreur);
    const ou = etapeDe(erreur);
    console.error(`[worker] échec global — étape « ${ou} » : ${detail}`);
    return Response.json(
      {
        erreur: detail,
        etape: ou,
        indice:
          "Lancer le même appel avec ?verifier=1 pour contrôler chaque " +
          "dépendance sans toucher à la file.",
      },
      { status: 500 },
    );
  }
}

/** Même traitement en GET, pour pouvoir déclencher depuis un navigateur. */
export async function GET(request: Request) {
  return POST(request);
}

/**
 * Tout accès déclenché par cette route est attribué à « worker ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function POST(request: Request) {
  return avecContexteJournal(
    { acteur: "worker", tache: "traitement-file" },
    () => postInterne(request),
  );
}
