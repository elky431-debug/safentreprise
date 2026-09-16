/**
 * Les signaux qui distinguent une soumission automatique d'un prospect.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ ON MARQUE, ON NE JETTE PAS. Aucune fonction de ce fichier ne refuse une
 *   demande. Elles rendent des MOTIFS ; la route les enregistre avec la
 *   demande et s'en sert pour décider ce qu'elle N'ENVOIE PAS — la
 *   confirmation, l'en-tête `Reply-To`. Un faux positif coûte alors un objet
 *   d'email marqué « suspect », jamais un prospect perdu.
 *
 *   La seule exception est le piège à robots, traité dans la route : un champ
 *   caché rempli n'est pas un signal parmi d'autres, c'est une certitude.
 *
 * ⚠ CES SEUILS SONT CALÉS SUR DES DONNÉES RÉELLES, PAS SUR UNE INTUITION.
 *   Cinq soumissions du même robot, observées entre le 24 août et le
 *   16 septembre 2026, et trois saisies humaines sur la même période. Les
 *   valeurs des tests viennent de ces huit lignes. Avant de resserrer un
 *   seuil, vérifier qu'il ne touche aucun nom d'entreprise réel : à ce stade
 *   du produit, bloquer le premier vrai prospect coûte infiniment plus cher
 *   que de laisser passer du bruit.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { createHmac } from "node:crypto";

/** Un motif de suspicion, tel qu'il est stocké dans `motifs_suspicion`. */
export type Motif =
  | "casse_alternee"
  | "telephone_sans_indicatif"
  | "saisie_instantanee";

/* -------------------------------------------------------------------------- */
/*  L'empreinte d'origine                                                      */
/* -------------------------------------------------------------------------- */

/**
 * En-têtes consultés, dans l'ordre, pour l'adresse d'origine.
 *
 * ⚠ `x-nf-client-connection-ip` EST CONFIRMÉ EN PRODUCTION, LE 16 SEPTEMBRE
 *   2026. C'est bien lui que Netlify renseigne : relevé dans les logs de
 *   fonction, « demandes_demo : origine lue via x-nf-client-connection-ip ».
 *   Le code a d'abord été écrit sans pouvoir le vérifier — la documentation
 *   n'était pas joignable depuis l'environnement de développement — d'où la
 *   lecture des trois et la journalisation du nom trouvé.
 *
 * ⚠ LES DEUX REPLIS RESTENT, ET LA JOURNALISATION AUSSI. Ce n'est pas de la
 *   prudence périmée : l'en-tête dépend de l'hébergeur, et une bascule
 *   d'infrastructure le changerait sans rien casser de visible — la
 *   limitation de débit deviendrait simplement inopérante, en silence. La
 *   ligne de journal est le témoin qui le dirait.
 */
const ENTETES_IP = [
  "x-nf-client-connection-ip",
  "x-forwarded-for",
  "x-real-ip",
] as const;

export type Origine = {
  /** L'adresse brute. Ne JAMAIS l'écrire en base ni dans un log. */
  ip: string | null;
  /** L'en-tête qui a répondu, à journaliser. */
  entete: string | null;
};

/**
 * ⚠ `x-forwarded-for` PEUT PORTER UNE LISTE. « client, proxy1, proxy2 » : le
 *   client est le premier. Prendre la chaîne entière ferait une empreinte
 *   différente à chaque proxy traversé, donc un compteur qui ne compte rien.
 */
export function origineRequete(entetes: Headers): Origine {
  for (const nom of ENTETES_IP) {
    const brut = entetes.get(nom)?.trim();
    if (!brut) continue;
    const premier = brut.split(",")[0]?.trim();
    if (premier) return { ip: premier, entete: nom };
  }
  return { ip: null, entete: null };
}

/**
 * L'empreinte stockée : un HMAC-SHA256 salé, jamais l'adresse.
 *
 * ⚠ UN HMAC, PAS UN SHA256 NU. L'espace des adresses IPv4 fait 2^32 : un
 *   simple hachage se renverse par force brute en quelques heures sur une
 *   machine ordinaire. Le secret rend la table de correspondance
 *   inconstructible sans lui.
 *
 * ⚠ RENDRE `null` PLUTÔT QUE DE HACHER AVEC UN SECRET VIDE. Sans secret, le
 *   HMAC redevient un hachage public et l'adresse redevient retrouvable. Mieux
 *   vaut perdre le compteur que stocker une donnée personnelle réversible.
 */
export function empreinteOrigine(ip: string | null, secret: string | undefined): string | null {
  if (!ip) return null;
  const sel = secret?.trim();
  if (!sel) return null;
  return createHmac("sha256", sel).update(ip).digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/*  Les signaux                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Alternances minuscule ↔ majuscule À L'INTÉRIEUR d'un mot, la pire du lot.
 *
 * ⚠ MOT PAR MOT, ET SANS LA PREMIÈRE LETTRE. UNE PREMIÈRE VERSION COMPTAIT
 *   LES ALTERNANCES SUR LA CHAÎNE ENTIÈRE, ET LE TEST L'A PRISE EN DÉFAUT :
 *   « Cabinet Durand & Associés » en comptait 5 et aurait été signalé. Une
 *   majuscule en tête de mot est la casse normale du français ; chaque mot
 *   capitalisé ajoutait deux alternances, si bien que la mesure punissait les
 *   raisons sociales les plus ordinaires.
 *
 *   Ce qu'aucun humain ne produit, c'est une alternance À L'INTÉRIEUR d'un mot.
 *   On ignore donc la première lettre de chaque mot et on garde le pire score.
 *
 * ⚠ VALEURS MESURÉES SUR LES HUIT LIGNES RÉELLES. Robot : 9, 9, 11, 11, 12.
 *   Humains et raisons sociales françaises : 0 partout — `jobump`, `Etsmart`,
 *   `fff`, `Cabinet Durand & Associés`, `BNP Paribas`, `L'Oréal`, `SARL MARTIN`,
 *   `SNCF Réseau`. La séparation est franche : 0 d'un côté, 9 de l'autre.
 */
export function alternancesDeCasse(texte: string): number {
  let pire = 0;

  for (const mot of texte.split(/[^\p{L}]+/u)) {
    let n = 0;
    let precedent: "min" | "maj" | null = null;
    let premiere = true;

    for (const c of mot) {
      const casse = /\p{Ll}/u.test(c) ? "min" : /\p{Lu}/u.test(c) ? "maj" : null;
      if (casse === null) continue;
      // La majuscule initiale est la casse normale : on l'ignore.
      if (premiere) {
        premiere = false;
        precedent = null;
        continue;
      }
      if (precedent !== null && casse !== precedent) n += 1;
      precedent = casse;
    }

    if (n > pire) pire = n;
  }

  return pire;
}

/** Au-delà de ce nombre d'alternances, la chaîne n'a pas été tapée par un humain. */
export const SEUIL_ALTERNANCES = 4;

/**
 * ⚠ AUCUN NUMÉRO FRANÇAIS NE TOMBE ICI. Un numéro national s'écrit avec un `0`
 *   initial, un international avec `+33` ou `0033`. Les cinq numéros du robot
 *   font dix chiffres sans l'un ni l'autre — `9310050362`, `7651311514` — ce
 *   qui est impossible en France.
 *
 * ⚠ ET ON NE SIGNALE RIEN DÈS QU'IL Y A UN INDICATIF ÉTRANGER. Un prospect
 *   belge ou suisse écrit `+32` ou `+41` : c'est un client potentiel, pas un
 *   robot. Le signal ne porte que sur l'absence TOTALE d'indicatif.
 */
export function telephoneSansIndicatif(telephone: string): boolean {
  const nettoye = telephone.replace(/[\s.\-()/]/g, "");
  if (nettoye.startsWith("+") || nettoye.startsWith("00")) return false;
  if (nettoye.startsWith("0")) return false;
  return /^\d{9,11}$/.test(nettoye);
}

/**
 * Durée de remplissage en deçà de laquelle personne n'a pu saisir huit champs.
 *
 * ⚠ CE N'EST PAS UNE MESURE DE SÉCURITÉ, ET IL NE FAUT PAS LA PRÉSENTER COMME
 *   TELLE. La durée vient du navigateur : elle se falsifie en une ligne. Elle
 *   n'arrête qu'un robot naïf — ce qui est exactement le robot observé. La
 *   signer coûterait un aller-retour serveur pour un gain nul face à un
 *   attaquant qui, de toute façon, poste directement.
 */
export const DUREE_MINIMALE_MS = 3_000;

export type SaisieAJuger = {
  entreprise: string;
  telephone: string;
  /** Millisecondes entre l'affichage du formulaire et l'envoi, si connues. */
  dureeSaisieMs?: number | null;
};

/** Les motifs relevés, dans un ordre stable. Tableau vide = rien à signaler. */
export function signauxAutomatiques(saisie: SaisieAJuger): Motif[] {
  const motifs: Motif[] = [];

  if (alternancesDeCasse(saisie.entreprise) >= SEUIL_ALTERNANCES) {
    motifs.push("casse_alternee");
  }

  if (saisie.telephone && telephoneSansIndicatif(saisie.telephone)) {
    motifs.push("telephone_sans_indicatif");
  }

  if (
    typeof saisie.dureeSaisieMs === "number" &&
    saisie.dureeSaisieMs >= 0 &&
    saisie.dureeSaisieMs < DUREE_MINIMALE_MS
  ) {
    motifs.push("saisie_instantanee");
  }

  return motifs;
}
