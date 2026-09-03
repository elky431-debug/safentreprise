/**
 * La veille : le système prévient, au lieu d'être surveillé.
 *
 * Deux vues doivent rester vides — alertes_sans_banniere et
 * abonnements_en_alerte. Cette route les consulte, et si l'une d'elles
 * renvoie des lignes, envoie un mail qui DIT le problème : pas un lien, pas
 * un code, la phrase. Si les deux sont vides, elle n'envoie rien.
 *
 * Elle décide le moins possible : c'est preparer_veille() qui constate,
 * compare à la fois précédente et tranche. La route ne fait que mettre en
 * forme, envoyer, et revenir dire si ça a marché.
 *
 * TROIS ENTRÉES :
 *
 *   POST /api/veille               le passage normal, appelé par pg_cron
 *   POST /api/veille?verifier=1    ce que Resend accepte réellement ; n'envoie rien
 *   POST /api/veille?test=1        force un envoi, même si tout va bien
 */
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Écarte les alertes trop récentes pour être un problème. */
const AGE_MINUTES = 120;

/**
 * Une ligne du mail : une source, un motif, un nombre.
 *
 * ⚠ RIEN QUI DÉSIGNE UN MESSAGE, UNE PERSONNE OU UNE BOÎTE. Ce mail part chez
 *   Resend, aux États-Unis, vers une adresse de Safentreprise — donc hors de
 *   l'entreprise cliente, qui est responsable de ces données. L'objet des
 *   messages, l'adresse des expéditeurs et celle des boîtes surveillées n'ont
 *   rien à y faire. Le détail se lit en base, avec problemes_de_veille().
 */
type Ligne = {
  source: string;
  motif: string;
  nombre: number;
};

type Preparation = {
  probleme: boolean;
  envoyer: boolean;
  motif_envoi: string;
  empreinte: string;
  empreinte_precedente: string | null;
  lignes: Ligne[];
  nb_total: number;
  nb_alertes: number;
  nb_abonnements: number;
  envois: number;
  premier_vu_at: string | null;
  dernier_envoi_at: string | null;
  echecs_consecutifs: number;
  premier_echec_at: string | null;
  derniere_erreur: string | null;
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

async function rpc<T>(nom: string, parametres: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.");
  }
  const reponse = await fetch(`${url}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parametres),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`${nom} : HTTP ${reponse.status} — ${texte.slice(0, 300)}`);
  }
  return (texte.trim() === "" ? null : JSON.parse(texte)) as T;
}

/* ==========================================================================
   Expéditeur et destinataire
   ========================================================================== */

/**
 * L'adresse d'expédition.
 *
 * ⚠ PAS de repli sur onboarding@resend.dev. Cette adresse de test ne peut
 *   écrire QU'À l'adresse du compte Resend : vers contact@safentreprise.com
 *   elle rendrait un 403. Un repli silencieux transformerait la veille en
 *   alerte qui ne part jamais — exactement ce qu'on cherche à éviter.
 */
function expediteur(): string | null {
  const brute =
    process.env.VEILLE_FROM_EMAIL?.trim() || process.env.SIMULATION_FROM_EMAIL?.trim();
  return brute || null;
}

function destinataire(): string {
  return process.env.VEILLE_DESTINATAIRE?.trim() || "contact@safentreprise.com";
}

/* ==========================================================================
   Le message
   ========================================================================== */

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sujet(p: Preparation): string {
  const morceaux: string[] = [];
  if (p.nb_alertes > 0) {
    morceaux.push(
      `${p.nb_alertes} alerte${p.nb_alertes > 1 ? "s" : ""} sans bannière`,
    );
  }
  if (p.nb_abonnements > 0) {
    morceaux.push(
      `${p.nb_abonnements} abonnement${p.nb_abonnements > 1 ? "s" : ""} en alerte`,
    );
  }
  return `[Safentreprise] ${morceaux.join(" et ")}`;
}

/**
 * Le corps en texte brut. C'est lui qui compte : il doit se suffire à
 * lui-même, lu sur un téléphone, sans cliquer nulle part.
 */
function corpsTexte(p: Preparation): string {
  const l: string[] = [];

  l.push(
    p.nb_alertes > 0 && p.nb_abonnements > 0
      ? `${p.nb_alertes} mail(s) frauduleux n'ont pas reçu leur bannière, et ${p.nb_abonnements} boîte(s) risquent de ne plus être surveillées.`
      : p.nb_alertes > 0
        ? `${p.nb_alertes} mail(s) ont été jugés frauduleux SANS que leur destinataire soit averti.`
        : `${p.nb_abonnements} abonnement(s) Microsoft Graph ne vont plus, ou plus pour longtemps : les boîtes concernées cesseront d'être surveillées.`,
  );

  const parSource = new Map<string, Ligne[]>();
  for (const ligne of p.lignes) {
    const liste = parSource.get(ligne.source) ?? [];
    liste.push(ligne);
    parSource.set(ligne.source, liste);
  }

  for (const [source, lignes] of parSource) {
    const total = lignes.reduce((somme, ligne) => somme + ligne.nombre, 0);
    l.push("", `${source.toUpperCase()} (${total})`, "-".repeat(60));
    for (const ligne of lignes) {
      l.push("", `  ${ligne.nombre} ×`, `  → ${ligne.motif}`);
    }
  }

  l.push(
    "",
    "",
    "Ce message ne nomme volontairement ni les expéditeurs, ni les objets,",
    "ni les boîtes concernées. Le détail se lit en base :",
    "    SELECT * FROM problemes_de_veille(120);",
  );

  l.push("", "", "QUE FAIRE", "-".repeat(60), "");
  if (p.nb_abonnements > 0) {
    l.push(
      "  Abonnements — un abonnement abandonné ne repart pas tout seul :",
      "    SELECT * FROM abonnements_en_alerte;",
      "    SELECT * FROM relancer_abonnement_graph();",
      "",
    );
  }
  if (p.nb_alertes > 0) {
    l.push(
      "  Alertes sans bannière — la maintenance repasse toute seule sur",
      "  celles qui sont réparables :",
      "    SELECT * FROM alertes_sans_banniere;",
      "",
    );
  }

  l.push(
    "",
    "-".repeat(60),
    `Motif de cet envoi : ${p.motif_envoi}.`,
    p.envois > 0
      ? `Ce problème vous a déjà été signalé ${p.envois} fois. Les relances s'espacent : 3 jours, puis 7, puis 14.`
      : "Première alerte sur ce problème. Les relances s'espacent : 3 jours, puis 7, puis 14.",
  );

  if (p.echecs_consecutifs > 0 && p.premier_echec_at) {
    l.push(
      "",
      `⚠ ${p.echecs_consecutifs} envoi(s) ont échoué depuis le ` +
        `${new Date(p.premier_echec_at).toLocaleString("fr-FR")} : ` +
        `vous auriez dû recevoir ce message plus tôt.`,
      `  Dernière erreur : ${p.derniere_erreur ?? "sans détail"}`,
    );
  }

  l.push("", "Aucun mail n'est envoyé quand les deux vues sont vides.");
  return l.join("\n");
}

function corpsHtml(p: Preparation): string {
  const couleur = p.nb_abonnements > 0 ? "#b91c1c" : "#c2410c";
  const lignes = p.lignes
    .map(
      (ligne) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">${echapper(ligne.source)}</div>
          <div style="font-weight:600;color:#111827;margin-top:2px">${ligne.nombre} ×</div>
          <div style="color:${couleur};margin-top:4px">${echapper(ligne.motif)}</div>
        </td>
      </tr>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:640px">
  <p style="font-size:16px;font-weight:600;color:${couleur};margin:0 0 14px">
    ${echapper(sujet(p).replace("[Safentreprise] ", ""))}
  </p>
  <p style="margin:0 0 16px">${echapper(corpsTexte(p).split("\n")[0])}</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px">${lignes}</table>
  <pre style="background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;margin-top:18px">${echapper(
    corpsTexte(p).split("QUE FAIRE")[1] ?? "",
  )}</pre>
</div>`;
}

/* ==========================================================================
   Envoi
   ========================================================================== */

async function envoyer(
  p: Preparation,
): Promise<{ ok: boolean; detail: string; from: string; to: string }> {
  const from = expediteur();
  const to = destinataire();

  if (!from) {
    return {
      ok: false,
      from: "(aucune)",
      to,
      detail:
        "Aucune adresse d'expédition : poser VEILLE_FROM_EMAIL (ou " +
        "SIMULATION_FROM_EMAIL) sur un domaine vérifié chez Resend.",
    };
  }
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, from, to, detail: "RESEND_API_KEY absente." };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: `Veille Safentreprise <${from}>`,
      to,
      subject: sujet(p),
      text: corpsTexte(p),
      html: corpsHtml(p),
    });
    if (error) return { ok: false, from, to, detail: error.message };
    return { ok: true, from, to, detail: data?.id ?? "envoyé" };
  } catch (erreur) {
    return { ok: false, from, to, detail: messageDe(erreur) };
  }
}

/* ==========================================================================
   ?verifier=1 — ce que Resend accepte RÉELLEMENT
   ========================================================================== */

/**
 * Interroge le compte Resend au lieu de supposer. Le point qui piège :
 * l'adresse d'expédition doit être sur un domaine dont le statut est
 * « verified », sans quoi l'envoi part en 403 sans que rien d'autre ne le
 * signale.
 */
async function verifier(): Promise<Response> {
  const from = expediteur();
  const to = destinataire();
  const controles: { controle: string; etat: "ok" | "échec"; detail: string }[] = [];
  const ajouter = (controle: string, etat: "ok" | "échec", detail: string) =>
    controles.push({ controle, etat, detail });

  ajouter(
    "destinataire",
    "ok",
    `${to}${process.env.VEILLE_DESTINATAIRE ? "" : " (défaut du code)"}`,
  );
  ajouter(
    "expéditeur",
    from ? "ok" : "échec",
    from ??
      "AUCUNE — poser VEILLE_FROM_EMAIL ou SIMULATION_FROM_EMAIL sur Netlify.",
  );

  if (from?.endsWith("@resend.dev")) {
    ajouter(
      "adresse de test Resend",
      "échec",
      `${from} est l'adresse de test partagée : elle ne peut écrire QU'À ` +
        `l'adresse du compte Resend. Vers ${to}, l'envoi rendra un 403.`,
    );
  }

  if (!process.env.RESEND_API_KEY) {
    ajouter("RESEND_API_KEY", "échec", "absente de l'environnement.");
    return Response.json({ verification: controles }, { status: 500 });
  }
  ajouter("RESEND_API_KEY", "ok", "présente");

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.domains.list();
    if (error) {
      ajouter("domaines Resend", "échec", error.message);
    } else {
      const domaines = data?.data ?? [];
      const verifies = domaines.filter((d) => d.status === "verified");
      ajouter(
        "domaines Resend",
        verifies.length > 0 ? "ok" : "échec",
        domaines.length === 0
          ? "aucun domaine sur ce compte : seul l'envoi de test est possible."
          : domaines.map((d) => `${d.name} (${d.status})`).join(", "),
      );

      const domaineDeFrom = from?.split("@")[1]?.toLowerCase();
      const porteur = verifies.find(
        (d) =>
          d.name.toLowerCase() === domaineDeFrom ||
          domaineDeFrom?.endsWith(`.${d.name.toLowerCase()}`),
      );
      ajouter(
        "l'expéditeur est-il envoyable",
        porteur ? "ok" : "échec",
        porteur
          ? `${from} : le domaine ${porteur.name} est vérifié.`
          : `${from ?? "(aucune)"} n'est sur aucun domaine vérifié — l'envoi ` +
            `échouera. Vérifier un domaine sur resend.com/domains, puis poser ` +
            `VEILLE_FROM_EMAIL dessus.`,
      );
    }
  } catch (erreur) {
    ajouter("domaines Resend", "échec", messageDe(erreur));
  }

  try {
    const [etat] = await rpc<Record<string, unknown>[]>("etat_veille", {});
    ajouter(
      "état de la veille",
      etat?.muette ? "échec" : "ok",
      JSON.stringify(etat ?? {}),
    );
  } catch (erreur) {
    ajouter("état de la veille", "échec", messageDe(erreur));
  }

  const echecs = controles.filter((c) => c.etat === "échec").length;
  return Response.json(
    { verification: controles, echecs, envoi: "aucun — ?verifier=1 n'envoie rien" },
    { status: echecs > 0 ? 500 : 200 },
  );
}

/* ==========================================================================
   Le passage
   ========================================================================== */

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
  if (!autorise(request)) return new Response("non autorisé", { status: 401 });

  const parametres = new URL(request.url).searchParams;
  if (parametres.has("verifier")) return verifier();

  const [preparation] = await rpc<Preparation[]>("preparer_veille", {
    p_age_minutes: AGE_MINUTES,
  });

  if (!preparation) {
    return Response.json({ erreur: "preparer_veille n'a rien renvoyé." }, { status: 500 });
  }

  // ?test=1 — pour vérifier que l'alerte part, sans attendre une vraie panne.
  // L'envoi de test N'EST PAS enregistré comme un envoi : il ne doit ni
  // consommer une relance, ni faire croire qu'un vrai problème a été signalé.
  if (parametres.has("test")) {
    const p: Preparation = preparation.probleme
      ? preparation
      : {
          ...preparation,
          probleme: true,
          nb_total: 1,
          nb_alertes: 1,
          nb_abonnements: 0,
          motif_envoi: "ESSAI demandé à la main — aucun problème réel en cours",
          lignes: [
            {
              source: "essai",
              nombre: 1,
              motif:
                "Si vous lisez ce message, la veille sait vous joindre. " +
                "Les deux vues de contrôle sont vides en ce moment.",
            },
          ],
        };
    const resultat = await envoyer(p);
    return Response.json(
      {
        essai: true,
        ...resultat,
        enregistre: false,
        note: preparation.probleme
          ? "Un vrai problème est en cours : l'essai en a envoyé le contenu réel, " +
            "sans l'enregistrer. Le passage horaire suivant l'enverra à nouveau."
          : "Aucun problème réel : contenu d'essai.",
      },
      { status: resultat.ok ? 200 : 500 },
    );
  }

  if (!preparation.envoyer) {
    return Response.json({
      probleme: preparation.probleme,
      nb_total: preparation.nb_total,
      envoi: "aucun",
      motif: preparation.motif_envoi,
    });
  }

  const resultat = await envoyer(preparation);

  // L'échec est enregistré, pas avalé : il sera réessayé au passage suivant,
  // et il finira par déclencher le secours si personne n'y remédie.
  const marque = await rpc<string>("marquer_veille_envoyee", {
    p_empreinte: preparation.empreinte,
    p_ok: resultat.ok,
    p_erreur: resultat.ok ? null : resultat.detail,
  });

  if (!resultat.ok) {
    console.error("[veille] envoi impossible :", resultat.detail);
  }

  return Response.json(
    {
      probleme: true,
      nb_total: preparation.nb_total,
      nb_alertes: preparation.nb_alertes,
      nb_abonnements: preparation.nb_abonnements,
      motif: preparation.motif_envoi,
      envoi: resultat.ok ? "envoyé" : "ÉCHEC",
      detail: resultat.detail,
      from: resultat.from,
      to: resultat.to,
      enregistrement: marque,
    },
    { status: resultat.ok ? 200 : 500 },
  );
}

export async function GET(request: Request) {
  return POST(request);
}
