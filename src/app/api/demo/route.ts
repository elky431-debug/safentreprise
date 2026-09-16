/**
 * Enregistre une demande de démonstration issue de la vitrine.
 *
 * POST /api/demo
 *   { entreprise, effectif, prenom, nom, email, telephone, microsoft365, besoin? }
 *
 * L'insertion passe par la politique RLS « demandes_demo_insert_public »
 * (voir supabase/schema.sql) : écriture publique autorisée, lecture réservée
 * au back-office Supabase.
 *
 * ⚠ ENREGISTRER D'ABORD, NOTIFIER ENSUITE. L'insertion est l'opération
 *   principale : une demande écrite en base est acquise, même si aucun email
 *   ne part. Un échec Resend est consigné dans les logs et n'apparaît nulle
 *   part dans la réponse — le visiteur voit son panneau de succès, et la
 *   demande reste consultable dans le back-office.
 *
 * ⚠ `effectif` ET `microsoft_365` ONT LEURS COLONNES DEPUIS LA MIGRATION
 *   20260917. Ils étaient repliés en texte libre dans `message`, donc
 *   impossibles à filtrer. Le champ `message` ne porte plus que ce que la
 *   personne a écrit.
 *
 *   Un repli existe pour le cas où le code tournerait avant la migration :
 *   voir `enregistrer()`. Il est là pour ne pas perdre de prospect pendant
 *   les quelques minutes d'un déploiement mal ordonné, pas pour dispenser
 *   d'appliquer la migration.
 *
 * ⚠ UN SEUL EMAIL PART DÉSORMAIS : LA NOTIFICATION INTERNE. La confirmation
 *   automatique au demandeur est suspendue depuis le 16 septembre 2026 — un
 *   robot s'en servait pour faire écrire notre domaine à des tiers dont les
 *   adresses avaient été volées. Le motif complet et la condition de retour
 *   sont en tête de `@/lib/demo-notification`.
 *
 * ⚠ POST /api/demo?verifier=1 — essai de l'email interne, sans rien enregistrer.
 *   Protégé par WORKER_SECRET, comme /api/veille.
 */
import { createClient } from "@/lib/supabase/server";
import { EFFECTIFS, REPONSES_MICROSOFT } from "@/lib/demo";
import { notifierDemande, type DemandeDemo } from "@/lib/demo-notification";
import { EMAIL_CONTACT, TELEPHONE_AFFICHE } from "@/lib/contact";
import {
  empreinteOrigine,
  origineRequete,
  signauxAutomatiques,
} from "@/lib/demo-antirobot";

type Corps = {
  entreprise?: string;
  effectif?: string;
  prenom?: string;
  nom?: string;
  email?: string;
  telephone?: string;
  microsoft365?: string;
  besoin?: string;
  /**
   * ⚠ LE PIÈGE. Champ caché du formulaire, invisible à l'œil et hors du
   *   parcours de tabulation. Un humain ne peut pas le remplir ; un robot qui
   *   remplit tout ce qu'il trouve le remplit toujours.
   */
  societe_complement?: string;
  /** Millisecondes entre l'affichage du formulaire et l'envoi. */
  dureeSaisieMs?: number;
};

/**
 * Message affiché quand la base est injoignable.
 *
 * ⚠ IL DOIT PORTER LES COORDONNÉES. Le visiteur a rempli huit champs et vient
 *   de tout perdre : lui dire « écrivez-nous » sans dire où revient à le
 *   renvoyer chercher dans le pied de page, ou à le perdre.
 */
const MESSAGE_PANNE =
  `Le formulaire est momentanément indisponible. Joignez-nous directement : ` +
  `${TELEPHONE_AFFICHE} ou ${EMAIL_CONTACT}.`;

/** Validation volontairement souple : on filtre les saisies manifestement fausses. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LONGUEUR_MAX = {
  entreprise: 160,
  prenom: 80,
  nom: 80,
  email: 200,
  telephone: 40,
  besoin: 2000,
};

/**
 * Essai des deux emails, sans rien enregistrer.
 *
 * ⚠ PROTÉGÉ PAR `WORKER_SECRET`, comme /api/veille. Sans garde, cette route
 *   publique deviendrait un moyen d'expédier des messages à la boîte de
 *   notification autant de fois qu'on veut.
 *
 * ⚠ LA CONFIRMATION PART VERS L'ADRESSE DE NOTIFICATION, PAS VERS UNE ADRESSE
 *   FOURNIE DANS LA REQUÊTE. Accepter un destinataire en paramètre ferait de
 *   cette route un relais d'envoi anonyme.
 */
async function essai(): Promise<Response> {
  const destination =
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    process.env.VEILLE_DESTINATAIRE?.trim() ||
    EMAIL_CONTACT;

  const factice: DemandeDemo = {
    entreprise: "Essai Safentreprise",
    effectif: EFFECTIFS[0],
    prenom: "Essai",
    nom: "Technique",
    email: destination,
    telephone: TELEPHONE_AFFICHE,
    microsoft365: REPONSES_MICROSOFT[0],
    besoin:
      "Message d'essai déclenché par POST /api/demo?verifier=1. " +
      "Aucune demande n'a été enregistrée.",
  };

  const envois = await notifierDemande(factice);

  return Response.json({
    enregistrement: "aucun — ?verifier=1 n'écrit rien en base",
    destination,
    expediteur:
      process.env.DEMO_FROM_EMAIL?.trim() ||
      process.env.VEILLE_FROM_EMAIL?.trim() ||
      `contact@safentreprise.com (défaut du code)`,
    notification: envois.interne,
    confirmation:
      envois.confirmation ??
      "suspendue — aucune confirmation automatique n'est envoyée au demandeur " +
        "tant que le filtre anti-robot n'est pas en place",
  });
}

function autorise(request: Request): boolean {
  const attendu = process.env.WORKER_SECRET;
  if (!attendu) return false;
  const fourni =
    request.headers.get("x-safentreprise-worker") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return fourni === attendu;
}

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.has("verifier")) {
    if (!autorise(request)) {
      return new Response("non autorisé", { status: 401 });
    }
    return essai();
  }

  let corps: Corps;
  try {
    corps = (await request.json()) as Corps;
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const entreprise = corps.entreprise?.trim() ?? "";
  const effectif = corps.effectif?.trim() ?? "";
  const prenom = corps.prenom?.trim() ?? "";
  const nom = corps.nom?.trim() ?? "";
  const email = corps.email?.trim().toLowerCase() ?? "";
  const telephone = corps.telephone?.trim() ?? "";
  const microsoft365 = corps.microsoft365?.trim() ?? "";
  const besoin = corps.besoin?.trim() ?? "";

  // ⚠ LE PIÈGE RÉPOND 201, COMME UN SUCCÈS, ET N'ÉCRIT RIEN. Un 400 apprend au
  //   robot ce qu'il doit changer ; un faux succès le laisse continuer à parler
  //   dans le vide. C'est le seul endroit du dispositif qui JETTE une demande,
  //   et il le peut parce qu'un champ invisible rempli n'est pas un signal
  //   parmi d'autres : c'est une certitude.
  if (corps.societe_complement?.trim()) {
    return Response.json({ ok: true }, { status: 201 });
  }

  if (!entreprise || !prenom || !nom || !email || !telephone) {
    return Response.json(
      {
        erreur:
          "Entreprise, prénom, nom, email professionnel et téléphone sont obligatoires.",
      },
      { status: 400 },
    );
  }

  // Les listes déroulantes sont vérifiées côté serveur : le navigateur n'est
  // pas le seul appelant possible de cette route.
  if (!EFFECTIFS.includes(effectif as (typeof EFFECTIFS)[number])) {
    return Response.json(
      { erreur: "Effectif inconnu." },
      { status: 400 },
    );
  }

  if (
    !REPONSES_MICROSOFT.includes(
      microsoft365 as (typeof REPONSES_MICROSOFT)[number],
    )
  ) {
    return Response.json(
      { erreur: "Réponse inattendue sur Microsoft 365." },
      { status: 400 },
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return Response.json(
      { erreur: "Cette adresse email ne semble pas valide." },
      { status: 400 },
    );
  }

  if (
    entreprise.length > LONGUEUR_MAX.entreprise ||
    prenom.length > LONGUEUR_MAX.prenom ||
    nom.length > LONGUEUR_MAX.nom ||
    email.length > LONGUEUR_MAX.email ||
    telephone.length > LONGUEUR_MAX.telephone ||
    besoin.length > LONGUEUR_MAX.besoin
  ) {
    return Response.json(
      { erreur: "Un des champs dépasse la longueur autorisée." },
      { status: 400 },
    );
  }

  // ⚠ ON MARQUE, ON NE JETTE PAS. Ces motifs ne refusent rien : ils sont
  //   enregistrés avec la demande, marquent l'objet du mail interne et retirent
  //   l'en-tête `Reply-To`. Un faux positif coûte un objet marqué « suspect »,
  //   jamais un prospect perdu.
  const motifs = signauxAutomatiques({
    entreprise,
    telephone,
    dureeSaisieMs: corps.dureeSaisieMs,
  });

  const demande: DemandeDemo = {
    entreprise,
    effectif,
    prenom,
    nom,
    email,
    telephone,
    microsoft365,
    besoin,
    motifs,
  };

  // Sans configuration Supabase (ex. environnement de démo), createClient lève.
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return Response.json({ erreur: MESSAGE_PANNE }, { status: 503 });
  }

  const resultat = await enregistrer(supabase, demande, request.headers);

  if (resultat === "limite") {
    // Seuils larges (10/heure, 30/jour) : un humain n'y arrive pas. On le dit
    // quand même en français lisible plutôt qu'avec un code nu.
    return Response.json(
      {
        erreur:
          `Trop de demandes envoyées depuis cette connexion. Réessayez plus ` +
          `tard, ou joignez-nous directement : ${TELEPHONE_AFFICHE} ou ${EMAIL_CONTACT}.`,
      },
      { status: 429 },
    );
  }

  if (resultat !== "ok") {
    console.error("Insertion demandes_demo :", resultat);
    return Response.json(
      { erreur: "Enregistrement impossible pour le moment. Réessayez." },
      { status: 500 },
    );
  }

  // ⚠ APRÈS L'INSERTION, ET SANS POUVOIR LA REMETTRE EN CAUSE. `notifierDemande`
  //   ne lève jamais ; le `catch` ne couvre qu'un défaut imprévu du module.
  try {
    const envois = await notifierDemande(demande);
    if (!envois.interne.ok) {
      console.error("Notification interne (démo) :", envois.interne.erreur);
    }
    // ⚠ PAS DE BRANCHE D'ERREUR SUR LA CONFIRMATION. Elle vaut `null` :
    //   suspendue, pas en panne. Voir l'en-tête de `@/lib/demo-notification`.
    if (envois.confirmation && !envois.confirmation.ok) {
      console.error("Confirmation demandeur (démo) :", envois.confirmation.erreur);
    }
  } catch (e) {
    console.error("Notification de démo :", e);
  }

  return Response.json({ ok: true }, { status: 201 });
}

/**
 * L'enregistrement, par la fonction `enregistrer_demande_demo`.
 *
 * ⚠ PLUS D'INSERT DIRECT, ET LA POLITIQUE QUI L'AUTORISAIT A ÉTÉ RETIRÉE.
 *   `demandes_demo_insert_public` disait `TO anon WITH CHECK (true)` : la clé
 *   anonyme étant publique — elle est dans le bundle du navigateur — n'importe
 *   qui pouvait écrire dans la table par PostgREST, sans passer par cette
 *   route. Toute limitation posée ici se contournait donc par un `curl`.
 *   Voir `supabase/migrations/20261009_rls_roles_et_stockage.sql`.
 *
 * ⚠ LE COMPTEUR EST DANS POSTGRES, ET IL NE PEUT PAS ÊTRE AILLEURS. Les
 *   fonctions Netlify sont sans état et démultipliées : un compteur en mémoire
 *   ne compte rien. La base est la seule mémoire partagée.
 */
async function enregistrer(
  // Le type générique du client varie avec la génération des types de base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  d: DemandeDemo,
  entetes: Headers,
): Promise<"ok" | "limite" | unknown> {
  const origine = origineRequete(entetes);
  const empreinte = empreinteOrigine(
    origine.ip,
    process.env.IP_HASH_SECRET ?? process.env.WORKER_SECRET,
  );

  // ⚠ SANS EMPREINTE, IL N'Y A PLUS AUCUN PLAFOND, ET IL FAUT QUE ÇA SE VOIE.
  //   Vérifié sur Postgres : quinze appels sans empreinte passent tous. Deux
  //   causes possibles — le secret de hachage manque, ou l'en-tête d'origine
  //   a changé. Le second est confirmé depuis le 16 septembre 2026 :
  //   `x-nf-client-connection-ip` chez Netlify. La ligne de journal reste
  //   néanmoins écrite à chaque demande, parce qu'une bascule d'hébergeur
  //   changerait l'en-tête sans rien casser de visible.
  if (!empreinte) {
    console.error(
      "demandes_demo : AUCUNE EMPREINTE D'ORIGINE, la limitation de débit est " +
        `inopérante pour cette demande. En-tête trouvé : ${origine.entete ?? "aucun"}. ` +
        `Secret de hachage : ${process.env.IP_HASH_SECRET || process.env.WORKER_SECRET ? "présent" : "MANQUANT"}.`,
    );
  } else {
    console.info(`demandes_demo : origine lue via ${origine.entete}`);
  }

  const { data, error } = await supabase.rpc("enregistrer_demande_demo", {
    p_nom: `${d.prenom} ${d.nom}`,
    p_entreprise: d.entreprise,
    p_email: d.email,
    p_telephone: d.telephone,
    p_effectif: d.effectif,
    p_microsoft_365: d.microsoft365,
    p_message: d.besoin || null,
    p_ip_hmac: empreinte,
    p_suspect: (d.motifs?.length ?? 0) > 0,
    p_motifs: d.motifs ?? [],
  });

  if (error) return error;
  if (data === "limite_heure" || data === "limite_jour") return "limite";
  if (data !== "ok") return new Error(`réponse inattendue : ${String(data)}`);
  return "ok";
}
