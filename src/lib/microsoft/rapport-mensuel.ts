/**
 * Rapport mensuel au dirigeant — la couche d'envoi.
 *
 * Le contenu vit dans `rapport-mensuel-html`, module sans importation donc
 * testable hors de Next. Ici : à qui, depuis quelle adresse, et que faire
 * quand ça rate.
 *
 * ⚠ MÊME DESTINATAIRE QUE L'ALERTE, MÊME FONCTION. `destinataires_alerte`
 *   est la source unique : le jour où une société aura plusieurs
 *   destinataires, les deux flux en hériteront ensemble. Une seconde fonction
 *   « destinataires_rapport » aurait fini par diverger de la première.
 *
 * ⚠ CE FLUX SORT DE L'UNION EUROPÉENNE, comme l'alerte. Il est décrit dans
 *   l'AIPD, le registre des sous-traitants et la politique de
 *   confidentialité, et journalisé à chaque envoi. Toute donnée ajoutée au
 *   rapport doit l'être dans ces documents le même jour.
 *
 * ⚠ AUCUNE FONCTION DE CE FICHIER NE LÈVE. Un rapport qui ne part pas est un
 *   incident de communication, pas un incident de sécurité : il ne doit
 *   jamais interrompre le traitement des messages.
 */
import { envoyerEmail, type ResultatEnvoiEmail } from "@/lib/send/email";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";
import { EMAIL_CONTACT, TELEPHONE_AFFICHE } from "@/lib/contact";
import {
  htmlRapport,
  rapportFictif,
  rapportFictifCalme,
  sujetRapport,
  texteRapport,
  type ContexteRapport,
  type DonneesRapport,
} from "@/lib/microsoft/rapport-mensuel-html";

export {
  rapportFictif,
  rapportFictifCalme,
  type DonneesRapport,
};

/**
 * ⚠ `ALERTE_FROM_EMAIL` EN PREMIER, VOLONTAIREMENT. Le rapport et l'alerte
 *   partent de la même adresse tant que `RAPPORT_FROM_EMAIL` n'est pas posée :
 *   une seule adresse à vérifier chez Resend pour mettre les deux en service.
 */
const VARIABLES_EXPEDITEUR = [
  "RAPPORT_FROM_EMAIL",
  "ALERTE_FROM_EMAIL",
  "VEILLE_FROM_EMAIL",
  "DEMO_FROM_EMAIL",
];

function contexteRapport(): ContexteRapport {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return {
    telephone: TELEPHONE_AFFICHE,
    email: EMAIL_CONTACT,
    lienMenaces: base ? `${base}/menaces` : "votre tableau de bord Safentreprise",
  };
}

export type ResultatRapport = {
  destinataires: number;
  envoyes: number;
  erreur?: string;
};

/**
 * Envoie le rapport à chaque destinataire. Ne lève jamais.
 *
 * ⚠ « ENVOYÉ » VEUT DIRE « AU MOINS UN DESTINATAIRE SERVI ». Une société sans
 *   adresse joignable compte comme un échec : la ligne reste en attente et le
 *   contrôle du worker la signale, au lieu de la marquer partie.
 */
export async function envoyerRapportMensuel(
  destinataires: string[],
  donnees: DonneesRapport,
): Promise<ResultatRapport> {
  if (destinataires.length === 0) {
    return {
      destinataires: 0,
      envoyes: 0,
      erreur: "aucun destinataire pour cette société",
    };
  }

  const from = expediteurVerifie(VARIABLES_EXPEDITEUR);
  if (!from) {
    return {
      destinataires: destinataires.length,
      envoyes: 0,
      erreur: erreurExpediteur(VARIABLES_EXPEDITEUR),
    };
  }

  const c = contexteRapport();
  const sujet = sujetRapport(donnees);
  const html = htmlRapport(donnees, c);
  const texte = texteRapport(donnees, c);

  let envoyes = 0;
  const erreurs: string[] = [];

  for (const destinataire of destinataires) {
    const r: ResultatEnvoiEmail = await envoyerEmail({
      from: `Safentreprise <${from}>`,
      to: destinataire,
      subject: sujet,
      html,
      // ⚠ LES DEUX PARTIES, PAS SEULEMENT LE HTML. Un email sans partie texte
      //   est noté plus sévèrement par les filtres, et certains clients
      //   n'affichent que celle-ci.
      text: texte,
      replyTo: EMAIL_CONTACT,
    });
    if (r.ok) envoyes += 1;
    else erreurs.push(r.erreur);
  }

  return {
    destinataires: destinataires.length,
    envoyes,
    erreur: envoyes === 0 ? erreurs.join(" | ").slice(0, 300) : undefined,
  };
}
