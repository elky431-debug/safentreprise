"use client";

/**
 * I3 — le périmètre : résoudre les adresses nommées par le dirigeant.
 *
 * ⚠ LE DIRIGEANT A NOMMÉ DES ADRESSES, IL N'A PAS COCHÉ UNE LISTE. La liste
 *   vient de Graph, donc n'existe qu'APRÈS l'accord — c'est la contrainte de
 *   séquence qui a décidé de tout le découpage (voir le document). Cet écran
 *   est l'endroit où les deux se rencontrent : ce que le dirigeant a demandé,
 *   et ce que l'annuaire contient vraiment.
 *
 * ⚠ UNE ADRESSE INTROUVABLE N'EST PAS UNE ERREUR DE L'INFORMATICIEN. C'est
 *   presque toujours une faute de frappe du dirigeant, ou un alias. On le dit
 *   comme ça, et on propose la correction plutôt que de faire échouer l'étape.
 */
import { useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconArrowRight, IconRefresh } from "@/components/icons";
import { Encadre, Etiquette } from "@/components/microsoft/commun";
import type { EtatJeton } from "./ParcoursInformaticien";

type Boite = {
  graph_user_id: string;
  upn: string;
  nom: string;
  partagee: boolean;
};

export function EcranPerimetre({
  jeton,
  adresses,
  etat,
  onEnregistre,
}: {
  jeton: string;
  adresses: string[];
  etat: EtatJeton;
  onEnregistre: () => void;
}) {
  const [annuaire, setAnnuaire] = useState<Boite[] | null>(null);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [temoin, setTemoin] = useState<string | null>(etat.temoin_upn);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/raccordement/annuaire?jeton=${encodeURIComponent(jeton)}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const liste = (await r.json()) as Boite[];
        if (!vivant) return;
        setAnnuaire(liste);

        // Pré-cocher ce que le dirigeant a nommé, en comparant sans la casse.
        const voulues = new Set(adresses.map((a) => a.trim().toLowerCase()));
        setChoisies(
          new Set(
            liste
              .filter((b) => voulues.has(b.upn.toLowerCase()))
              .map((b) => b.graph_user_id),
          ),
        );
      } catch (e) {
        if (vivant) setErreur(e instanceof Error ? e.message : "erreur inconnue");
      }
    })();
    return () => {
      vivant = false;
    };
  }, [jeton, adresses]);

  if (erreur && !annuaire) {
    return (
      <Encadre ton="attention" titre="Nous n’avons pas pu lire votre annuaire">
        <p>{erreur}</p>
        <p className="mt-2">
          L’autorisation vient peut-être d’être donnée et Microsoft ne l’a pas
          encore propagée. Attendez une minute puis réessayez.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${buttonSecondary} mt-2.5`}
        >
          <IconRefresh className="h-4 w-4" />
          Réessayer
        </button>
      </Encadre>
    );
  }

  if (!annuaire) return <p className="texte-second">Lecture de l’annuaire…</p>;

  const parUpn = new Map(annuaire.map((b) => [b.upn.toLowerCase(), b]));
  const introuvables = adresses.filter(
    (a) => !parUpn.has(a.trim().toLowerCase()),
  );

  function basculer(id: string) {
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/raccordement/perimetre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jeton,
          graph_user_ids: [...choisies],
          temoin_upn: temoin,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { erreur?: string };
        throw new Error(j.erreur ?? `HTTP ${r.status}`);
      }
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      setEnvoi(false);
    }
  }

  // ⚠ LE TÉMOIN NE PEUT PAS ÊTRE UNE BOÎTE SURVEILLÉE. C'est lui qui prouve
  //   que la restriction tient : on tentera de le lire et on DOIT échouer. Le
  //   choisir parmi les boîtes surveillées rendrait la preuve impossible.
  const candidatsTemoin = annuaire.filter(
    (b) => !choisies.has(b.graph_user_id) && !b.partagee,
  );
  const temoinValide = temoin && candidatsTemoin.some((b) => b.upn === temoin);

  return (
    <div className="space-y-5">
      <header>
        <p className="texte-second">Étape 2 sur 3</p>
        <h2 className="titre-section mt-0.5 text-foreground">
          Le périmètre des boîtes surveillées
        </h2>
      </header>

      {introuvables.length > 0 && (
        <Encadre
          ton="attention"
          titre={
            introuvables.length === 1
              ? "Une adresse demandée n’existe pas dans votre annuaire"
              : `${introuvables.length} adresses demandées n’existent pas dans votre annuaire`
          }
        >
          <ul className="space-y-0.5">
            {introuvables.map((a) => (
              <li key={a} className="adresse">
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            C’est presque toujours une faute de frappe ou un alias. Cochez la
            bonne boîte ci-dessous — il n’y a rien à corriger côté dirigeant.
          </p>
        </Encadre>
      )}

      <section className="rounded-[16px] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {annuaire.map((b) => {
            const demandee = adresses.some(
              (a) => a.trim().toLowerCase() === b.upn.toLowerCase(),
            );
            return (
              <li key={b.graph_user_id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={choisies.has(b.graph_user_id)}
                    onChange={() => basculer(b.graph_user_id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-foreground">
                      {b.nom}
                    </span>
                    <span className="adresse block text-muted">{b.upn}</span>
                  </span>
                  {demandee && <Etiquette ton="info">demandée</Etiquette>}
                  {b.partagee && <Etiquette ton="neutre">partagée</Etiquette>}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-[16px] border border-border bg-surface px-5 py-4">
        <p className="titre-bloc text-foreground">La boîte témoin</p>
        <p className="texte-courant mt-1.5 text-muted">
          Choisissez une boîte qui ne sera <strong>pas</strong> surveillée. À
          l’étape suivante, nous tenterons de la lire&nbsp;: nous devons
          échouer. C’est cet échec qui prouve que la restriction fonctionne.
        </p>
        <select
          value={temoin ?? ""}
          onChange={(e) => setTemoin(e.target.value || null)}
          className="mt-3 h-10 w-full rounded-[12px] border border-border bg-surface px-3 text-[13.5px] text-foreground"
        >
          <option value="">— choisir une boîte —</option>
          {candidatsTemoin.map((b) => (
            <option key={b.graph_user_id} value={b.upn}>
              {b.upn}
            </option>
          ))}
        </select>
      </section>

      {erreur && (
        <Encadre ton="attention" titre="L’enregistrement n’est pas passé">
          <p>{erreur}</p>
        </Encadre>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={envoi || choisies.size === 0 || !temoinValide}
          className={buttonPrimary}
        >
          {envoi ? "Enregistrement…" : "Continuer"}
          <IconArrowRight className="h-4 w-4" />
        </button>
        {/* ⚠ ON DIT POURQUOI LE BOUTON EST ÉTEINT. Un bouton désactivé sans
            explication est un cul-de-sac silencieux. */}
        {choisies.size === 0 && (
          <span className="texte-second">
            Cochez au moins une boîte à surveiller.
          </span>
        )}
        {choisies.size > 0 && !temoinValide && (
          <span className="texte-second">
            Choisissez une boîte témoin, hors surveillance.
          </span>
        )}
      </div>
    </div>
  );
}
