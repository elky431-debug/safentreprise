"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/lib/types";
import {
  Alert,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import { TYPE_FRAUDE_LABELS, CANAL_LABELS } from "@/lib/campaigns";

const VARIABLES = [
  "{logo}",
  "{entreprise}",
  "{nom_dirigeant}",
  "{nom_fournisseur}",
  "{prenom_employe}",
  "{signature}",
  "{couleur}",
  "{lien_tracking}",
  "{lien_signalement}",
];

type Props = {
  initial: MessageTemplate[];
  /** Société connectée : toute création est rattachée à elle. */
  companyId: string;
};

/**
 * Gabarits HTML/SMS.
 *
 * Deux natures cohabitent :
 * - gabarit SYSTÈME (company_id null), fourni par Safentreprise, en lecture
 *   seule pour le client ;
 * - gabarit de la SOCIÉTÉ, que le client crée en personnalisant un gabarit
 *   système, puis modifie librement.
 *
 * Personnaliser duplique le gabarit système dans la société : l'original reste
 * intact pour les autres clients, et la copie prend la priorité à la
 * composition des campagnes.
 */
export function TemplatesManager({ initial, companyId }: Props) {
  const [templates, setTemplates] = useState(initial);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Un gabarit système existe-t-il déjà en version personnalisée ? */
  function dejaPersonnalise(t: MessageTemplate): boolean {
    return templates.some(
      (x) =>
        x.company_id === companyId &&
        x.type_fraude === t.type_fraude &&
        x.canal === t.canal,
    );
  }

  function ouvrirEdition(t: MessageTemplate) {
    setEditionId(t.id);
    setObjet(t.objet ?? "");
    setContenu(t.contenu_html);
    setError(null);
    setSuccess(null);
  }

  /** Duplique un gabarit système dans la société, puis ouvre l'édition. */
  async function personnaliser(t: MessageTemplate) {
    setError(null);
    setSuccess(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("message_templates")
      .insert({
        company_id: companyId,
        type_fraude: t.type_fraude,
        canal: t.canal,
        objet: t.objet,
        contenu_html: t.contenu_html,
        actif: true,
      })
      .select("*")
      .single<MessageTemplate>();

    setSaving(false);

    if (err || !data) {
      setError(err?.message ?? "La copie n'a pas pu être créée.");
      return;
    }

    setTemplates((prev) => [...prev, data]);
    setSuccess(
      "Copie créée pour votre société. Le gabarit d'origine reste inchangé.",
    );
    ouvrirEdition(data);
  }

  async function basculerActif(t: MessageTemplate) {
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("message_templates")
      .update({ actif: !t.actif })
      .eq("id", t.id);

    if (err) {
      setError(err.message);
      return;
    }
    setTemplates((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, actif: !t.actif } : x)),
    );
  }

  async function supprimer(t: MessageTemplate) {
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: err } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", t.id);

    if (err) {
      setError(err.message);
      return;
    }

    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    setSuccess("Gabarit supprimé — le gabarit système reprend la main.");
  }

  async function enregistrer() {
    if (!editionId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: err } = await supabase
      .from("message_templates")
      .update({
        objet: objet.trim() || null,
        contenu_html: contenu,
      })
      .eq("id", editionId);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }

    setTemplates((prev) =>
      prev.map((x) =>
        x.id === editionId
          ? { ...x, objet: objet.trim() || null, contenu_html: contenu }
          : x,
      ),
    );
    setSuccess("Gabarit enregistré.");
    setEditionId(null);
  }

  const enCours = templates.find((t) => t.id === editionId);

  return (
    <div className="w-full">
      <PageHeader
        title="Modèles"
        description="Gabarits HTML et SMS utilisés pour composer les campagnes. Variables injectées à la composition."
      />

      {(error || success) && (
        <div className="mb-6 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>
      )}

      <Panel className="mb-6">
        <PanelHeader title="Variables disponibles" />
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {VARIABLES.map((v) => (
            <code
              key={v}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[12px] text-accent-text"
            >
              {v}
            </code>
          ))}
        </div>
      </Panel>

      {editionId && enCours ? (
        <Panel>
          <PanelHeader
            title={`Édition — ${TYPE_FRAUDE_LABELS[enCours.type_fraude]} · ${CANAL_LABELS[enCours.canal]}`}
            action={
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => setEditionId(null)}
              >
                Fermer
              </button>
            }
          />
          <div className="space-y-4 px-6 py-5">
            {enCours.canal === "email" && (
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                  Objet
                </span>
                <input
                  className={inputClass}
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                Contenu HTML / texte
              </span>
              <textarea
                rows={16}
                value={contenu}
                onChange={(e) => setContenu(e.target.value)}
                className={`${inputClass} h-auto resize-y py-2.5 font-mono text-[12px] leading-relaxed`}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => setEditionId(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving}
                className={buttonPrimary}
                onClick={() => void enregistrer()}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Gabarits"
            description="Les gabarits Safentreprise servent de base commune. Personnalisez-en un pour en obtenir une copie propre à votre société."
          />
          <ul className="divide-y divide-border">
            {templates.map((t) => {
              const systeme = t.company_id === null;

              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                      {TYPE_FRAUDE_LABELS[t.type_fraude]} ·{" "}
                      {CANAL_LABELS[t.canal]}
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                          systeme
                            ? "border-border-strong bg-surface-2 text-muted"
                            : "border-accent-line bg-accent-soft text-accent-text"
                        }`}
                      >
                        {systeme ? "Système" : "Votre version"}
                      </span>
                      {!t.actif && (
                        <span className="text-[11px] font-normal text-faint">
                          inactif
                        </span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-[12.5px] text-muted">
                      {t.objet ?? "(SMS — pas d'objet)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {systeme ? (
                      <button
                        type="button"
                        disabled={saving || dejaPersonnalise(t)}
                        onClick={() => void personnaliser(t)}
                        className={buttonSecondary}
                        title={
                          dejaPersonnalise(t)
                            ? "Vous avez déjà une version personnalisée de ce gabarit"
                            : undefined
                        }
                      >
                        {dejaPersonnalise(t)
                          ? "Déjà personnalisé"
                          : "Personnaliser"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void supprimer(t)}
                          className={buttonSecondary}
                        >
                          Supprimer
                        </button>
                        <button
                          type="button"
                          onClick={() => void basculerActif(t)}
                          className={buttonSecondary}
                        >
                          {t.actif ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => ouvrirEdition(t)}
                          className={buttonPrimary}
                        >
                          Éditer
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
