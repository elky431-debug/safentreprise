"use client";

/**
 * Correspondants de confiance : liste, ajout, modification, import.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN PRODUIT. Chaque ligne déclarée arme une règle qui vaut 75
 * points — « élevé » à elle seule. Un fournisseur mal déclaré ne rate pas une
 * alerte : il en FABRIQUE une sur chaque message légitime de ce fournisseur,
 * et sur Outlook la bannière est irréversible. D'où l'insistance de cet écran
 * sur les domaines secondaires, et l'aperçu obligatoire avant tout import.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lireTableur, type Tableur } from "@/lib/parse-tableur";
import {
  construireApercu,
  devinerCorrespondance,
  domaineDe,
  estDomaineGrandPublic,
  type ApercuImport,
  type Correspondance,
} from "@/lib/correspondants";
import type { CorrespondantConfiance } from "@/lib/types";
import {
  Alert,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  buttonGhost,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import {
  IconContacts,
  IconPencil,
  IconTrash,
  IconUpload,
} from "@/components/icons";

type Props = {
  companyId: string;
  initiaux: CorrespondantConfiance[];
};

/** Étapes de l'import : le fichier, puis les colonnes, puis l'aperçu. */
type EtapeImport =
  | { phase: "repos" }
  | { phase: "colonnes"; fichier: string; tableur: Tableur; choix: Correspondance }
  | {
      phase: "apercu";
      fichier: string;
      tableur: Tableur;
      choix: Correspondance;
      apercu: ApercuImport;
    };

/** Ce que `importer_correspondants` rend pour chaque entrée. */
type ResultatImport = {
  nom: string;
  issue: "cree" | "fusionne" | "ecarte";
  motif: string | null;
  domaines_retenus: string[];
};

function tousLesDomaines(c: CorrespondantConfiance): string[] {
  return [c.domaine_principal, ...(c.domaines_secondaires ?? [])];
}

export function CorrespondantsManager({ companyId, initiaux }: Props) {
  const router = useRouter();
  const champFichier = useRef<HTMLInputElement>(null);

  const [liste, setListe] = useState(initiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Formulaire d'ajout / modification
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [principal, setPrincipal] = useState("");
  const [secondaires, setSecondaires] = useState("");

  // Suppression confirmée en deux temps, sans boîte de dialogue système.
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const [etape, setEtape] = useState<EtapeImport>({ phase: "repos" });
  const [rapport, setRapport] = useState<ResultatImport[] | null>(null);

  const nomsExistants = useMemo(() => liste.map((c) => c.nom), [liste]);

  function reinitialiserFormulaire() {
    setEnEdition(null);
    setNom("");
    setPrincipal("");
    setSecondaires("");
  }

  function annoncer(message: string) {
    setSucces(message);
    setErreur(null);
  }

  /* ----------------------------------------------------------------------
     Ajout et modification
     ---------------------------------------------------------------------- */

  /**
   * ⚠ LES DOMAINES SONT NETTOYÉS ICI, PAS SEULEMENT VALIDÉS. Un client colle
   *   volontiers « contact@delta-log.fr » dans un champ « domaine » : le
   *   refuser serait exact et pénible. On en extrait le domaine.
   */
  function preparerDomaines(): { principal: string; secondaires: string[] } | null {
    const p = domaineDe(principal);
    if (!p) {
      setErreur(
        "Le domaine principal n'est pas lisible. Attendu : delta-log.fr, " +
          "ou une adresse comme compta@delta-log.fr.",
      );
      return null;
    }
    if (estDomaineGrandPublic(p)) {
      setErreur(
        `« ${p} » est une messagerie grand public. La déclarer rendrait ` +
          `TOUT ${p} légitime, y compris pour un fraudeur qui se ferait ` +
          `passer pour ce correspondant depuis une autre adresse ${p}.`,
      );
      return null;
    }

    const s: string[] = [];
    for (const morceau of secondaires.split(/[;,\s]+/).filter(Boolean)) {
      const d = domaineDe(morceau);
      if (!d) {
        setErreur(`« ${morceau} » n'est pas un domaine lisible.`);
        return null;
      }
      if (estDomaineGrandPublic(d)) {
        setErreur(`« ${d} » est une messagerie grand public : elle ne peut pas être déclarée.`);
        return null;
      }
      if (d !== p && !s.includes(d)) s.push(d);
    }

    return { principal: p, secondaires: s };
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);

    const titre = nom.trim();
    if (!titre) {
      setErreur("Le nom du correspondant est obligatoire.");
      return;
    }
    const domaines = preparerDomaines();
    if (!domaines) return;

    setOccupe(true);
    const supabase = createClient();

    if (enEdition) {
      const { data, error } = await supabase
        .from("correspondants_confiance")
        .update({
          nom: titre,
          domaine_principal: domaines.principal,
          domaines_secondaires: domaines.secondaires,
        })
        .eq("id", enEdition)
        .select()
        .single<CorrespondantConfiance>();

      setOccupe(false);
      if (error) {
        setErreur(messageErreur(error.message));
        return;
      }
      setListe((l) => l.map((c) => (c.id === data.id ? data : c)));
      reinitialiserFormulaire();
      annoncer(`« ${data.nom} » mis à jour.`);
      return;
    }

    const { data, error } = await supabase
      .from("correspondants_confiance")
      .insert({
        company_id: companyId,
        nom: titre,
        domaine_principal: domaines.principal,
        domaines_secondaires: domaines.secondaires,
        source: "manuel",
      })
      .select()
      .single<CorrespondantConfiance>();

    setOccupe(false);
    if (error) {
      setErreur(messageErreur(error.message));
      return;
    }
    setListe((l) => [...l, data].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
    reinitialiserFormulaire();
    annoncer(`« ${data.nom} » ajouté.`);
  }

  /**
   * ⚠ LES MESSAGES DE LA BASE NE SONT PAS MONTRÉS TELS QUELS. « duplicate key
   *   value violates unique constraint » n'apprend rien à un dirigeant ; il
   *   faut lui dire ce qu'il doit faire.
   */
  function messageErreur(brut: string): string {
    if (brut.includes("correspondants_confiance_company_id_nom_normalise_key")) {
      return (
        "Ce correspondant est déjà déclaré. Modifiez la ligne existante pour " +
        "lui ajouter un domaine, plutôt que d'en créer une seconde."
      );
    }
    if (brut.includes("correspondant_domaine")) {
      return (
        "Un des domaines est refusé : messagerie grand public, ou forme " +
        "invalide."
      );
    }
    return brut;
  }

  function modifier(c: CorrespondantConfiance) {
    setEnEdition(c.id);
    setNom(c.nom);
    setPrincipal(c.domaine_principal);
    setSecondaires((c.domaines_secondaires ?? []).join(", "));
    setErreur(null);
    setSucces(null);
  }

  async function supprimer(id: string) {
    setOccupe(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("correspondants_confiance")
      .delete()
      .eq("id", id);
    setOccupe(false);
    setASupprimer(null);

    if (error) {
      setErreur(error.message);
      return;
    }
    setListe((l) => l.filter((c) => c.id !== id));
    annoncer("Correspondant supprimé.");
  }

  /* ----------------------------------------------------------------------
     Import
     ---------------------------------------------------------------------- */

  async function choisirFichier(fichier: File) {
    setErreur(null);
    setSucces(null);
    setRapport(null);
    setOccupe(true);
    try {
      const tableur = await lireTableur(fichier);
      if (tableur.entetes.length === 0 || tableur.lignes.length === 0) {
        setErreur("Fichier vide ou illisible. Attendu : un CSV ou un Excel avec une ligne d'en-têtes.");
        return;
      }
      setEtape({
        phase: "colonnes",
        fichier: fichier.name,
        tableur,
        choix: devinerCorrespondance(tableur.entetes, tableur.lignes),
      });
    } catch {
      setErreur("Fichier illisible. Utilisez un CSV ou un Excel (.xlsx).");
    } finally {
      setOccupe(false);
      if (champFichier.current) champFichier.current.value = "";
    }
  }

  function voirApercu() {
    if (etape.phase !== "colonnes") return;
    if (!etape.choix.nom || !etape.choix.domaine) {
      setErreur("Indiquez les deux colonnes avant de continuer.");
      return;
    }
    setErreur(null);
    setEtape({
      ...etape,
      phase: "apercu",
      apercu: construireApercu(etape.tableur.lignes, etape.choix, nomsExistants),
    });
  }

  async function confirmerImport() {
    if (etape.phase !== "apercu") return;
    setOccupe(true);
    setErreur(null);

    const supabase = createClient();
    // ⚠ ON ENVOIE CE QUI A ÉTÉ MONTRÉ, PAS LE FICHIER. L'aperçu a déjà écarté
    //   les messageries grand public et regroupé les doublons : envoyer les
    //   lignes brutes ferait diverger ce que le client a validé de ce qui est
    //   écrit.
    //
    // ⚠ ET C'EST CE QUI TIENT LA PROMESSE DE LA POLITIQUE DE CONFIDENTIALITÉ :
    //   « seul le domaine est conservé, l'extraction se fait dans le
    //   navigateur ». `e.domaines` ne contient que des domaines — la partie
    //   locale des adresses du fichier ne quitte jamais cette page. Envoyer le
    //   fichier au serveur pour l'y découper rendrait cette phrase fausse.
    const { data, error } = await supabase.rpc("importer_correspondants", {
      p_company_id: companyId,
      p_entrees: etape.apercu.entrees.map((e) => ({
        nom: e.nom,
        domaines: e.domaines,
      })),
    });

    setOccupe(false);
    if (error) {
      setErreur(error.message);
      return;
    }

    const resultats = (data ?? []) as ResultatImport[];
    setRapport(resultats);
    setEtape({ phase: "repos" });

    const crees = resultats.filter((r) => r.issue === "cree").length;
    const fusionnes = resultats.filter((r) => r.issue === "fusionne").length;
    annoncer(
      `${crees} correspondant(s) créé(s)` +
        (fusionnes > 0 ? `, ${fusionnes} complété(s)` : "") +
        ".",
    );
    router.refresh();

    // La liste locale est rechargée depuis le serveur : `importer_correspondants`
    // fusionne des domaines, et recalculer ici ce qu'elle a fait reviendrait à
    // réécrire sa logique une seconde fois.
    const { data: frais } = await supabase
      .from("correspondants_confiance")
      .select("*")
      .eq("company_id", companyId)
      .order("nom", { ascending: true })
      .returns<CorrespondantConfiance[]>();
    if (frais) setListe(frais);
  }

  /* ======================================================================
     Rendu
     ====================================================================== */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correspondants de confiance"
        description="Vos fournisseurs et partenaires habituels, avec leurs domaines légitimes. Un message qui se présente à leur nom depuis un autre domaine devient une alerte de risque élevé."
      />

      {erreur && <Alert tone="error">{erreur}</Alert>}
      {succes && <Alert tone="success">{succes}</Alert>}

      <Panel>
        <PanelHeader
          title="Ce que cette liste change"
          description="Safentreprise ne lit pas votre historique pour deviner vos fournisseurs : c'est vous qui les déclarez. Déclarez TOUS les domaines d'un même correspondant — un fournisseur avec un .fr et un .com en a deux — sinon la moitié de son courrier légitime sera signalée."
        />
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Formulaire                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Panel>
        <PanelHeader
          title={enEdition ? "Modifier le correspondant" : "Ajouter un correspondant"}
          action={
            enEdition ? (
              <button
                type="button"
                className={buttonGhost}
                onClick={reinitialiserFormulaire}
              >
                Annuler
              </button>
            ) : (
              <button
                type="button"
                className={buttonSecondary}
                disabled={occupe}
                onClick={() => champFichier.current?.click()}
              >
                <IconUpload className="h-4 w-4" />
                Importer une liste
              </button>
            )
          }
        />
        <form onSubmit={enregistrer} className="grid gap-4 px-6 py-5 sm:grid-cols-3">
          <Field
            label="Nom du correspondant"
            hint="obligatoire"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Delta-Log SARL"
            required
          />
          <Field
            label="Domaine principal"
            hint="obligatoire"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="delta-log.fr"
            required
          />
          <Field
            label="Domaines secondaires"
            // L'indication tient en un mot : « facultatif, séparés par des
            // virgules » repliait le libellé sur deux lignes dans la troisième
            // colonne, plus étroite que les autres. Le placeholder montre déjà
            // la virgule.
            hint="facultatif"
            value={secondaires}
            onChange={(e) => setSecondaires(e.target.value)}
            placeholder="delta-log.com, delta-log.eu"
          />
          <div className="sm:col-span-3">
            <button type="submit" className={buttonPrimary} disabled={occupe}>
              {enEdition ? "Enregistrer les modifications" : "Ajouter"}
            </button>
          </div>
        </form>

        <input
          ref={champFichier}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void choisirFichier(f);
          }}
        />
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Import — choix des colonnes                                      */}
      {/* ---------------------------------------------------------------- */}
      {etape.phase === "colonnes" && (
        <Panel>
          <PanelHeader
            title="Quelles colonnes utiliser ?"
            description={`${etape.fichier} — ${etape.tableur.lignes.length} ligne(s) lue(s). Si la colonne des domaines contient des adresses email, le domaine en sera extrait automatiquement.`}
            action={
              <button
                type="button"
                className={buttonGhost}
                onClick={() => setEtape({ phase: "repos" })}
              >
                Abandonner
              </button>
            }
          />
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <Field label="Colonne du nom">
              <select
                className={inputClass}
                value={etape.choix.nom}
                onChange={(e) =>
                  setEtape({ ...etape, choix: { ...etape.choix, nom: e.target.value } })
                }
              >
                {etape.tableur.entetes.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Colonne de l'email ou du domaine">
              <select
                className={inputClass}
                value={etape.choix.domaine}
                onChange={(e) =>
                  setEtape({
                    ...etape,
                    choix: { ...etape.choix, domaine: e.target.value },
                  })
                }
              >
                {etape.tableur.entetes.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>

            <div className="sm:col-span-2 overflow-x-auto">
              <p className="mb-2 text-[12.5px] text-muted">
                Trois premières lignes, telles qu&apos;elles seront lues :
              </p>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-faint">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2">Email ou domaine</th>
                  </tr>
                </thead>
                <tbody>
                  {etape.tableur.lignes.slice(0, 3).map((l, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-2 pr-4 text-foreground">
                        {l[etape.choix.nom] || <span className="text-faint">—</span>}
                      </td>
                      <td className="py-2 text-muted">
                        {l[etape.choix.domaine] || <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:col-span-2">
              <button type="button" className={buttonPrimary} onClick={voirApercu}>
                Voir ce qui sera importé
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Import — aperçu                                                  */}
      {/* ---------------------------------------------------------------- */}
      {etape.phase === "apercu" && (
        <Panel>
          <PanelHeader
            title="Aperçu avant enregistrement"
            description={`${etape.apercu.entrees.length} correspondant(s) seront enregistrés, dont ${etape.apercu.fusions} déjà déclaré(s) qui seront complété(s). ${etape.apercu.rejets.length} ligne(s) écartée(s).`}
            action={
              <button
                type="button"
                className={buttonGhost}
                onClick={() => setEtape({ ...etape, phase: "colonnes" })}
              >
                Changer les colonnes
              </button>
            }
          />

          {etape.apercu.grandPublic.length > 0 && (
            <div className="border-b border-border px-6 py-4">
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-foreground">
                  Messageries grand public écartées :
                </span>{" "}
                {etape.apercu.grandPublic.join(", ")}. Les déclarer rendrait
                l&apos;ensemble de ces messageries légitimes pour vos
                correspondants — un fraudeur qui se ferait passer pour l&apos;un
                d&apos;eux depuis une autre adresse du même service passerait
                sans être signalé.
              </p>
            </div>
          )}

          <div className="overflow-x-auto px-6 py-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-faint">
                  <th className="py-2 pr-4">Correspondant</th>
                  <th className="py-2 pr-4">Domaines retenus</th>
                  <th className="py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {etape.apercu.entrees.slice(0, 50).map((e) => (
                  <tr key={e.nom} className="border-b border-border align-top">
                    <td className="py-2 pr-4 font-medium text-foreground">{e.nom}</td>
                    <td className="py-2 pr-4 text-muted">
                      {e.domaines.join(", ")}
                      {e.ecartes.length > 0 && (
                        <span className="block text-[12px] text-faint">
                          écarté : {e.ecartes.map((x) => x.valeur).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-muted">
                      {e.deja ? "à compléter" : "nouveau"}
                      {e.lignes.length > 1 && (
                        <span className="block text-[12px] text-faint">
                          {e.lignes.length} lignes regroupées
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {etape.apercu.entrees.length > 50 && (
              <p className="mt-3 text-[12.5px] text-faint">
                50 premiers affichés sur {etape.apercu.entrees.length}. Tous
                seront enregistrés.
              </p>
            )}

            {etape.apercu.rejets.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-[13px] text-muted">
                  {etape.apercu.rejets.length} ligne(s) écartée(s) — voir le détail
                </summary>
                <ul className="mt-2 space-y-1 text-[12.5px] text-faint">
                  {etape.apercu.rejets.slice(0, 30).map((r, i) => (
                    <li key={i}>
                      Ligne {r.ligne} — « {r.valeur} » : {r.motif}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonPrimary}
                disabled={occupe || etape.apercu.entrees.length === 0}
                onClick={() => void confirmerImport()}
              >
                {occupe
                  ? "Enregistrement…"
                  : `Enregistrer ${etape.apercu.entrees.length} correspondant(s)`}
              </button>
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => setEtape({ phase: "repos" })}
              >
                Abandonner
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Compte rendu du dernier import                                   */}
      {/* ---------------------------------------------------------------- */}
      {rapport && rapport.some((r) => r.issue === "ecarte" || r.motif) && (
        <Panel>
          <PanelHeader
            title="Compte rendu de l'import"
            action={
              <button
                type="button"
                className={buttonGhost}
                onClick={() => setRapport(null)}
              >
                Masquer
              </button>
            }
          />
          <ul className="space-y-1 px-6 py-5 text-[13px] text-muted">
            {rapport
              .filter((r) => r.issue === "ecarte" || r.motif)
              .map((r, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{r.nom}</span> —{" "}
                  {r.issue === "ecarte" ? "écarté" : "enregistré"}
                  {r.motif ? ` (${r.motif})` : ""}
                </li>
              ))}
          </ul>
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Liste                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Panel>
        <PanelHeader
          title={`${liste.length} correspondant${liste.length > 1 ? "s" : ""} déclaré${liste.length > 1 ? "s" : ""}`}
        />
        {liste.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <IconContacts className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-3 text-[13.5px] text-muted">
              Aucun correspondant déclaré. Tant que cette liste est vide, la
              détection du faux fournisseur ne peut pas fonctionner.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {liste.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-foreground">{c.nom}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {tousLesDomaines(c).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={buttonGhost}
                    onClick={() => modifier(c)}
                    aria-label={`Modifier ${c.nom}`}
                  >
                    <IconPencil className="h-4 w-4" />
                    Modifier
                  </button>
                  {aSupprimer === c.id ? (
                    <>
                      <button
                        type="button"
                        className={buttonPrimary}
                        disabled={occupe}
                        onClick={() => void supprimer(c.id)}
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        className={buttonGhost}
                        onClick={() => setASupprimer(null)}
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={buttonGhost}
                      onClick={() => setASupprimer(c.id)}
                      aria-label={`Supprimer ${c.nom}`}
                    >
                      <IconTrash className="h-4 w-4" />
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
