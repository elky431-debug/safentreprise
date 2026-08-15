/**
 * Réception d'une tentative détectée par l'extension Safentreprise Guard.
 *
 * POST /api/extension/menace
 * {
 *   code_activation, expediteur_nom, expediteur_email, nom_signe, objet,
 *   niveau_risque, score, signaux, employe_email, detecte_at
 * }
 *   201 → { ok: true, id }
 *   401 → code d'activation inconnu
 *
 * MÉTADONNÉES UNIQUEMENT : cette route ne lit que les champs listés ci-dessus.
 * Tout autre champ du corps de la requête — corps du message, extrait,
 * en-têtes bruts, pièce jointe — est ignoré et n'atteint jamais la base.
 */
import { createClient } from "@/lib/supabase/server";
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";
import { NIVEAUX_RISQUE } from "@/lib/extension/config";
import type { NiveauRisqueMenace } from "@/lib/types";

type Corps = {
  code_activation?: string;
  expediteur_nom?: string;
  expediteur_email?: string;
  nom_signe?: string;
  objet?: string;
  niveau_risque?: string;
  score?: number;
  signaux?: unknown;
  employe_email?: string;
  detecte_at?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Longueurs maximales : une métadonnée anormalement longue est tronquée. */
const LONGUEUR_MAX = {
  nom: 200,
  email: 320,
  objet: 300,
  signal: 120,
};

/** Coupe une chaîne et renvoie null si elle est vide. */
function texte(valeur: string | undefined, max: number): string | null {
  const propre = valeur?.trim() ?? "";
  if (!propre) return null;
  return propre.slice(0, max);
}

/**
 * Normalise les signaux : tableau de libellés courts.
 * Accepte un tableau de chaînes ; tout autre format donne un tableau vide.
 */
function normaliserSignaux(brut: unknown): string[] {
  if (!Array.isArray(brut)) return [];

  return brut
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, LONGUEUR_MAX.signal))
    .filter(Boolean)
    .slice(0, 20);
}

export async function OPTIONS() {
  return reponsePreflight();
}

export async function POST(request: Request) {
  let corps: Corps;
  try {
    corps = (await request.json()) as Corps;
  } catch {
    return reponseCors({ erreur: "JSON invalide." }, 400);
  }

  const code = corps.code_activation?.trim().toUpperCase() ?? "";
  if (!code) {
    return reponseCors({ erreur: "Code d'activation manquant." }, 400);
  }

  const expediteurEmail = corps.expediteur_email?.trim().toLowerCase() ?? "";
  if (!expediteurEmail || !EMAIL_REGEX.test(expediteurEmail)) {
    return reponseCors({ erreur: "Adresse d'expéditeur invalide." }, 400);
  }

  const niveau = corps.niveau_risque?.trim().toLowerCase() ?? "";
  if (!NIVEAUX_RISQUE.includes(niveau as NiveauRisqueMenace)) {
    return reponseCors(
      { erreur: "niveau_risque doit valoir faible, modere ou eleve." },
      400,
    );
  }

  const score = Number(corps.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return reponseCors(
      { erreur: "score doit être un entier entre 0 et 100." },
      400,
    );
  }

  // Email du destinataire : facultatif, ignoré s'il est mal formé
  const employeEmailBrut = corps.employe_email?.trim().toLowerCase() ?? "";
  const employeEmail =
    employeEmailBrut && EMAIL_REGEX.test(employeEmailBrut)
      ? employeEmailBrut.slice(0, LONGUEUR_MAX.email)
      : null;

  // Date de détection : l'horloge du poste peut être fausse, on retombe sur now()
  const detecteAt = corps.detecte_at?.trim();
  const detecteAtValide =
    detecteAt && !Number.isNaN(Date.parse(detecteAt))
      ? new Date(detecteAt).toISOString()
      : null;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reponseCors({ erreur: "Service indisponible." }, 503);
  }

  // La fonction valide le code et renvoie null s'il est inconnu.
  const { data, error } = await supabase.rpc("enregistrer_menace", {
    p_code_activation: code,
    p_expediteur_nom: texte(corps.expediteur_nom, LONGUEUR_MAX.nom),
    p_expediteur_email: expediteurEmail.slice(0, LONGUEUR_MAX.email),
    p_nom_signe: texte(corps.nom_signe, LONGUEUR_MAX.nom),
    p_objet: texte(corps.objet, LONGUEUR_MAX.objet),
    p_niveau_risque: niveau,
    p_score: Math.round(score),
    p_signaux: normaliserSignaux(corps.signaux),
    p_employe_email: employeEmail,
    p_detecte_at: detecteAtValide,
  });

  if (error) {
    console.error("enregistrer_menace :", error);
    return reponseCors({ erreur: "Enregistrement impossible." }, 500);
  }

  const id = data as string | null;
  if (!id) {
    return reponseCors({ erreur: "Code d'activation inconnu." }, 401);
  }

  return reponseCors({ ok: true, id }, 201);
}
