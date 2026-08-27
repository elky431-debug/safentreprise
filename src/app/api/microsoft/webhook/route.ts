/**
 * Point d'entrée des notifications Microsoft Graph.
 *
 * BUDGET : 3 SECONDES. Microsoft considère une notification comme livrée s'il
 * reçoit une réponse 2xx dans ce délai. Au-delà il retente pendant 4 heures,
 * mais si plus de 15 % des réponses dépassent 10 secondes sur une fenêtre de
 * 10 minutes, il passe le point d'entrée en état « drop » et JETTE les
 * notifications pendant 10 minutes.
 *
 * Conséquences sur ce fichier, toutes délibérées :
 *
 *   • Il n'importe RIEN. Ni le moteur de détection, ni le convertisseur HTML,
 *     ni le client Supabase. Sur Netlify chaque route est une fonction
 *     indépendante dont le temps de démarrage à froid dépend de son graphe
 *     d'import. Une seule ligne d'import de trop se paie en notifications
 *     perdues. Ne rien ajouter ici sans mesurer.
 *
 *   • L'appel à la base est un fetch direct vers PostgREST, pas le SDK.
 *
 *   • La vérification du clientState ET la mise en file se font dans le même
 *     appel : un aller-retour au lieu de deux.
 *
 * Le travail réel — récupérer le message, analyser, agir — est fait par le
 * worker, qui draine la file.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marge de sécurité sous les 3 secondes imposées. */
const BUDGET_MS = 2200;

type Notification = {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string };
  /**
   * Présent UNIQUEMENT sur les notifications de cycle de vie. C'est à ça
   * qu'on les distingue : Microsoft les envoie sur le même point d'entrée,
   * la documentation autorisant lifecycleNotificationUrl à valoir
   * notificationUrl. Trois valeurs possibles :
   *
   *   reauthorizationRequired — réautoriser l'abonnement
   *   subscriptionRemoved     — il a été supprimé, en recréer un
   *   missed                  — des notifications ont été perdues
   */
  lifecycleEvent?: string;
};

/**
 * Enregistre un événement de cycle de vie.
 *
 * On ne fait ici que le CONSTATER — marquer l'abonnement et, si des messages
 * ont été perdus, demander un rattrapage. Recréer l'abonnement ou parcourir
 * le delta prend bien plus que les 3 secondes accordées : c'est le travail de
 * la route de maintenance.
 */
async function enregistrerCycleVie(
  url: string,
  cle: string,
  notification: Notification,
): Promise<boolean> {
  if (!notification.subscriptionId || !notification.clientState) {
    console.warn("[graph] événement de cycle de vie incomplet, ignoré");
    return true;
  }

  const reponse = await fetch(
    `${url}/rest/v1/rpc/enregistrer_evenement_cycle_vie`,
    {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_subscription_id: notification.subscriptionId,
        p_client_state: notification.clientState,
        p_evenement: notification.lifecycleEvent ?? "inconnu",
      }),
    },
  );

  if (!reponse.ok) {
    console.error(`[graph] cycle de vie : HTTP ${reponse.status}`);
    return false;
  }

  const reconnu = (await reponse.json()) as boolean;
  if (!reconnu) {
    // Abonnement inconnu ou clientState incorrect : ne pas faire retenter.
    console.warn(
      `[graph] événement de cycle de vie refusé pour ${notification.subscriptionId}`,
    );
    return true;
  }

  console.warn(
    `[graph] cycle de vie « ${notification.lifecycleEvent} » sur ` +
      `${notification.subscriptionId}`,
  );
  return true;
}

/**
 * Identifiant du message annoncé.
 * `resourceData.id` est la source normale ; le chemin `resource` sert de
 * repli. Les deux viennent de l'extérieur : ils ne servent qu'à désigner un
 * message, jamais à construire l'appel Graph. La boîte à interroger est celle
 * enregistrée avec l'abonnement, côté base.
 */
function extraireMessageId(notification: Notification): string | null {
  const direct = notification.resourceData?.id;
  if (typeof direct === "string" && direct.length > 0) return direct;

  const chemin = notification.resource ?? "";
  const trouve = chemin.match(/messages(?:\(['"]?|\/)([^'")/]+)/i);
  return trouve ? trouve[1] : null;
}

/** Met une notification en file. Renvoie false si la base l'a refusée. */
async function mettreEnFile(notification: Notification): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) {
    console.error("[graph] Supabase non configuré");
    return false;
  }

  // Notification de cycle de vie : aucun message à mettre en file, c'est
  // l'abonnement lui-même qui est en cause.
  if (notification.lifecycleEvent) {
    return enregistrerCycleVie(url, cle, notification);
  }

  const messageId = extraireMessageId(notification);
  if (!messageId || !notification.subscriptionId || !notification.clientState) {
    // Notification inexploitable : inutile de faire retenter Microsoft.
    console.warn("[graph] notification incomplète, ignorée");
    return true;
  }

  const reponse = await fetch(
    `${url}/rest/v1/rpc/enregistrer_notification_graph`,
    {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_subscription_id: notification.subscriptionId,
        p_client_state: notification.clientState,
        p_message_id: messageId,
        p_resource: notification.resource ?? null,
        p_change_type: notification.changeType ?? null,
      }),
    },
  );

  if (!reponse.ok) {
    console.error(`[graph] mise en file impossible (HTTP ${reponse.status})`);
    return false;
  }

  const ligneId = (await reponse.json()) as string | null;

  if (ligneId === null) {
    // Abonnement inconnu ou clientState incorrect. On ne fait PAS retenter :
    // ça ne s'arrangera pas, et ça éviterait qu'un tiers nous fasse boucler.
    console.warn(
      `[graph] notification refusée pour l'abonnement ${notification.subscriptionId}`,
    );
    return true;
  }

  return true;
}

/**
 * Poignée de main de validation.
 *
 * À la création d'un abonnement, Graph appelle cette URL avec un jeton en
 * paramètre. Il faut le renvoyer TEL QUEL, en text/plain, avec un 200. Pas de
 * JSON, pas de guillemets : la moindre décoration fait échouer la création.
 *
 * Graph n'utilise que POST. On répond aussi sur GET, volontairement : c'est
 * le verbe par défaut de curl et d'un navigateur, donc celui avec lequel on
 * teste. Sans ça, un test manuel tombe sur la page d'accueil de la route et
 * laisse croire à une panne alors que tout fonctionne.
 */
function reponseValidation(request: Request): Response | null {
  const jeton = new URL(request.url).searchParams.get("validationToken");
  if (jeton === null) return null;

  return new Response(jeton, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const validation = reponseValidation(request);
  if (validation) return validation;

  /* ----------------------------------------------------------------------
     Notifications
     ---------------------------------------------------------------------- */
  let charge: { value?: Notification[] };
  try {
    charge = (await request.json()) as { value?: Notification[] };
  } catch {
    return new Response("corps illisible", { status: 400 });
  }

  const notifications = Array.isArray(charge.value) ? charge.value : [];
  if (notifications.length === 0) {
    return new Response(null, { status: 202 });
  }

  // Toutes en parallèle, sous un budget global. Ce qui n'aboutit pas dans le
  // temps imparti sera repris — soit par la reprise de Microsoft, soit par le
  // rattrapage delta, qui reste le filet de sécurité final.
  const budget = new Promise<"budget">((resolve) =>
    setTimeout(() => resolve("budget"), BUDGET_MS),
  );

  const traitement = Promise.all(
    notifications.map((n) =>
      mettreEnFile(n).catch((erreur) => {
        console.error("[graph] échec de mise en file :", erreur);
        return false;
      }),
    ),
  );

  const resultat = await Promise.race([traitement, budget]);

  if (resultat === "budget") {
    // On n'a pas fini à temps. Un 5xx fait retenter Microsoft, ce qui vaut
    // mieux qu'un 202 qui lui ferait considérer la notification comme livrée
    // alors qu'elle est perdue.
    console.error("[graph] budget dépassé, réponse 503 pour faire retenter");
    return new Response(null, { status: 503 });
  }

  const toutesEnFile = resultat.every(Boolean);
  return new Response(null, { status: toutesEnFile ? 202 : 503 });
}

/**
 * Pratique pour vérifier d'un navigateur que la route est bien déployée, et
 * pour tester la poignée de main sans avoir à forcer la méthode.
 */
export async function GET(request: Request) {
  const validation = reponseValidation(request);
  if (validation) return validation;

  return new Response("Safentreprise — point d'entrée des notifications Graph", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
