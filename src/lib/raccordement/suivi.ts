/** Ce que le dirigeant voit de son raccordement. Partagé serveur/client. */
export type Suivi = {
  jeton: string;
  destinataire_nom: string | null;
  destinataire_email: string | null;
  adresses_demandees: string[];
  envoye_at: string | null;
  ouvert_at: string | null;
  expire_at: string | null;
  termine_at: string | null;
  accord_donne: boolean;
  tenant_id: string | null;
  tenant_confirme_at: string | null;
  restriction_verifiee_at: string | null;
  boites_choisies: number;
  boites_actives: number;
  blocages_ouverts: number;
  dernier_blocage_motif: string | null;
  dernier_blocage_at: string | null;
};

export type Phase =
  /** Le lien est parti, personne ne l'a ouvert. */
  | "envoye"
  /** Ouvert, mais l'accord Microsoft n'est pas donné. */
  | "ouvert"
  /** Accord donné, périmètre pas encore fixé. */
  | "accord"
  /** Périmètre fixé, restriction pas encore constatée — la propagation. */
  | "restriction"
  /** Tout est en place. */
  | "actif"
  /** L'informaticien a signalé un blocage. */
  | "bloque";

/**
 * ⚠ LE BLOCAGE DOMINE TOUT LE RESTE. Un raccordement peut être « en attente de
 *   restriction » ET bloqué : c'est le blocage qu'il faut montrer, sinon le
 *   dirigeant attend une propagation qui ne viendra jamais.
 */
export function phaseDe(s: Suivi): Phase {
  if (s.blocages_ouverts > 0) return "bloque";
  if (s.restriction_verifiee_at && s.boites_actives > 0) return "actif";
  if (s.boites_choisies > 0) return "restriction";
  if (s.accord_donne) return "accord";
  if (s.ouvert_at) return "ouvert";
  return "envoye";
}

/**
 * Ce qu'on attend, en une phrase sans jargon.
 *
 * ⚠ TOUJOURS DIRE QUI DOIT AGIR. « En attente » sans sujet laisse le dirigeant
 *   se demander si c'est à lui de faire quelque chose — et, la plupart du
 *   temps, attendre pour rien.
 */
export function ceQuOnAttend(s: Suivi): string {
  switch (phaseDe(s)) {
    case "bloque":
      return "Votre informaticien a signalé un blocage. Nous sommes prévenus et nous le rappelons.";
    case "actif":
      return "Rien : la surveillance fonctionne.";
    case "restriction":
      return "Microsoft propage la restriction. Environ une heure. Ni vous ni votre informaticien n’avez à intervenir.";
    case "accord":
      return "Votre informaticien doit choisir les boîtes à surveiller, puis exécuter le script.";
    case "ouvert":
      return "Votre informaticien a ouvert le lien. Il doit maintenant donner l’accord Microsoft.";
    case "envoye":
      return "Votre informaticien n’a pas encore ouvert le lien.";
  }
}

/**
 * ⚠ IL N'Y A PAS DE COMPTE À REBOURS, ET C'EST DÉLIBÉRÉ. La première version en
 *   affichait un, calculé depuis `ouvert_at`. Vu à l'écran : l'informaticien
 *   peut avoir ouvert le lien lundi et exécuté le script jeudi — la page
 *   annonçait alors « 4 320 minutes écoulées » pour une propagation d'une
 *   heure. Un chiffre faux est pire que pas de chiffre : il fait conclure à
 *   une panne là où tout va bien.
 *
 *   ⚠ CE QU'IL FAUDRAIT POUR EN AFFICHER UN JUSTE : dater l'exécution du
 *     script, c'est-à-dire le moment où le périmètre est posé. Rien ne
 *     l'horodate aujourd'hui — `boites_surveillees.created_at` marque la
 *     PREMIÈRE sélection, pas la dernière, et donnerait un chiffre faux dès
 *     qu'un périmètre est modifié. C'est la même famille de trou que
 *     `visible_at` pour la bannière : le tenter sans la mesure redonnerait un
 *     nombre qui ment.
 *
 *   D'ici là, l'écran dit « environ une heure », ce qui est vrai.
 */
export function minutesDePropagation(): null {
  return null;
}
