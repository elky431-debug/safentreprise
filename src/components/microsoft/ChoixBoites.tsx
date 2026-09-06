"use client";

/**
 * Étape 2 : quelles boîtes Safentreprise a le droit de lire.
 *
 * ⚠ CET ÉCRAN N'EST PAS LA PROTECTION. Cocher une case n'empêche techniquement
 *   rien : les autorisations délivrées par Microsoft portent sur toutes les
 *   boîtes du locataire tant que l'étape 3 n'a pas été faite. On le dit ici
 *   plutôt que de laisser croire le contraire.
 */
import { useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconRefresh } from "@/components/icons";
import { Encadre, Etiquette } from "./commun";

type Boite = {
  graph_user_id: string;
  upn: string;
  nom: string;
  partagee: boolean;
  choisie: boolean;
};

type Props = {
  tenantUid: string;
  /** La boîte de contrôle : elle doit rester hors surveillance. */
  temoinUpn: string | null;
  /** Rechargement des données serveur une fois la sélection enregistrée. */
  onEnregistre: () => void;
  /** Affiché quand le client revient modifier une sélection déjà faite. */
  retour?: () => void;
};

export function ChoixBoites({
  tenantUid,
  temoinUpn,
  onEnregistre,
  retour,
}: Props) {
  const [boites, setBoites] = useState<Boite[] | null>(null);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  /** Incrémenté pour redemander la liste. Le chargement n'est jamais armé
   *  depuis l'effet lui-même : c'est le geste du client qui l'arme. */
  const [cle, setCle] = useState(0);

  useEffect(() => {
    let annule = false;

    void (async () => {
      try {
        const reponse = await fetch(
          `/api/microsoft/boites?tenant=${encodeURIComponent(tenantUid)}`,
          { cache: "no-store" },
        );
        const corps = await reponse.json();
        if (annule) return;

        if (!reponse.ok) {
          setErreur(corps.erreur ?? "La liste des boîtes n'a pas pu être lue.");
          setDetail(corps.detail ?? null);
          setBoites(null);
          return;
        }

        const liste = (corps.boites ?? []) as Boite[];
        setBoites(liste);
        setCochees(
          new Set(liste.filter((b) => b.choisie).map((b) => b.graph_user_id)),
        );
      } catch (e) {
        if (annule) return;
        setErreur("La liste des boîtes n'a pas pu être lue.");
        setDetail(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    // Le client peut quitter la page pendant la lecture de l'annuaire : elle
    // dure plusieurs secondes, et Microsoft y met parfois des reprises.
    return () => {
      annule = true;
    };
  }, [tenantUid, cle]);

  function recharger() {
    setChargement(true);
    setErreur(null);
    setDetail(null);
    setCle((k) => k + 1);
  }

  function basculer(id: string) {
    setCochees((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  }

  async function enregistrer() {
    if (!boites) return;
    setEnvoi(true);
    setErreur(null);
    setDetail(null);
    try {
      const reponse = await fetch(
        `/api/microsoft/boites?tenant=${encodeURIComponent(tenantUid)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            boites: boites
              .filter((b) => cochees.has(b.graph_user_id))
              .map((b) => ({ graph_user_id: b.graph_user_id, upn: b.upn })),
          }),
        },
      );
      const corps = await reponse.json();

      if (!reponse.ok) {
        setErreur(corps.erreur ?? "L'enregistrement a été refusé.");
        return;
      }
      onEnregistre();
    } catch (e) {
      setErreur("L'enregistrement a échoué.");
      setDetail(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  const temoin = temoinUpn?.toLowerCase() ?? null;
  const selection = boites?.filter((b) => cochees.has(b.graph_user_id)) ?? [];

  return (
    <div className="space-y-4">
      <Encadre ton="info" titre="Ce que vous choisissez ici">
        Safentreprise lira les messages qui arrivent dans les boîtes cochées,
        pour y repérer les tentatives de fraude au président et au fournisseur.
        Les autres boîtes ne seront pas lues.{" "}
        <strong className="font-medium text-foreground">
          Cette liste seule ne suffit pas
        </strong>{" "}
        : à l&apos;étape suivante, votre administrateur exécutera un court script
        qui empêche techniquement Safentreprise d&apos;atteindre les autres.
        Tant que ce n&apos;est pas fait et vérifié, aucun message n&apos;est
        analysé.
      </Encadre>

      {erreur && (
        <Encadre ton="danger" titre="La liste n'a pas pu être obtenue">
          <p>{erreur}</p>
          {detail && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11.5px] text-muted">
              {detail}
            </pre>
          )}
          <button
            type="button"
            onClick={recharger}
            className={`${buttonSecondary} mt-3`}
          >
            <IconRefresh />
            Réessayer
          </button>
        </Encadre>
      )}

      {chargement && (
        <p className="px-1 py-8 text-center text-[13px] text-muted">
          Lecture de votre annuaire Microsoft…
        </p>
      )}

      {boites && boites.length === 0 && !chargement && (
        <Encadre ton="attention" titre="Aucune boîte trouvée">
          Microsoft n&apos;a rendu aucune boîte pour ce locataire. Si vous venez
          d&apos;accorder l&apos;autorisation, patientez une minute et
          réessayez.
        </Encadre>
      )}

      {boites && boites.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h3 className="text-[14px] font-semibold text-foreground">
                  Boîtes de votre organisation
                </h3>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {boites.length} boîte{boites.length > 1 ? "s" : ""} — {" "}
                  {selection.length} cochée{selection.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={recharger}
                className={buttonSecondary}
              >
                <IconRefresh />
                Actualiser
              </button>
            </div>

            <ul className="divide-y divide-border">
              {boites.map((b) => {
                const estTemoin = temoin !== null && b.upn.toLowerCase() === temoin;
                const coche = cochees.has(b.graph_user_id);

                return (
                  <li key={b.graph_user_id}>
                    <label
                      className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                        estTemoin
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-surface-2/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={coche && !estTemoin}
                        disabled={estTemoin}
                        onChange={() => basculer(b.graph_user_id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {b.nom}
                          </span>
                          {b.partagee && (
                            <Etiquette ton="info">Boîte partagée</Etiquette>
                          )}
                          {estTemoin && (
                            <Etiquette ton="attention">Boîte de contrôle</Etiquette>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[12px] text-muted">
                          {b.upn}
                        </span>
                        {estTemoin && (
                          <span className="mt-1 block text-[12px] leading-snug text-muted">
                            Cette boîte sert à vérifier que la restriction
                            fonctionne : Microsoft doit continuer à nous la
                            refuser. Elle ne peut donc pas être surveillée.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <Encadre ton="neutre">
            Les boîtes partagées — <span className="font-mono">compta@</span>,{" "}
            <span className="font-mono">facturation@</span>,{" "}
            <span className="font-mono">achats@</span> — sont les cibles
            habituelles de la fraude au fournisseur. Elles apparaissent dans
            cette liste comme les autres.
          </Encadre>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={envoi || selection.length === 0}
              onClick={() => void enregistrer()}
              className={buttonPrimary}
            >
              {envoi ? "Enregistrement…" : "Enregistrer la sélection"}
            </button>

            {retour && (
              <button type="button" onClick={retour} className={buttonSecondary}>
                Annuler
              </button>
            )}

            {selection.length === 0 && (
              <span className="text-[12.5px] text-muted">
                Cochez au moins une boîte.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
