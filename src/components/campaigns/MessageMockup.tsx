"use client";

import { useEffect, useRef, useState } from "react";
import type { CanalMessage, TypeFraude } from "@/lib/types";
import { nomExpediteur } from "@/lib/templates/inject";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import { IconMail, IconPencil, IconSms } from "@/components/icons";

export type MessageApercu = {
  id: string;
  canal: CanalMessage;
  type_fraude: TypeFraude;
  objet_final: string | null;
  message_final_html: string;
  prenom: string;
  email: string;
  telephone: string | null;
};

type Props = {
  message: MessageApercu;
  nomDirigeant: string;
  nomFournisseur: string | null;
  modifiable: boolean;
  onSave: (champs: {
    objet_final: string | null;
    message_final_html: string;
  }) => Promise<boolean>;
};

/**
 * Aperçu fidèle d'un message final : iframe HTML pour l'email,
 * bulle pour le SMS. Édition possible avant validation.
 */
export function MessageMockup({
  message,
  nomDirigeant,
  nomFournisseur,
  modifiable,
  onSave,
}: Props) {
  const [edition, setEdition] = useState(false);
  const [objet, setObjet] = useState(message.objet_final ?? "");
  const [contenu, setContenu] = useState(message.message_final_html);
  const [enregistrement, setEnregistrement] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const estEmail = message.canal === "email";
  const expediteur = nomExpediteur(
    message.type_fraude,
    nomDirigeant,
    nomFournisseur,
  );

  useEffect(() => {
    setObjet(message.objet_final ?? "");
    setContenu(message.message_final_html);
  }, [message.objet_final, message.message_final_html]);

  // Ajuste la hauteur de l'iframe au contenu rendu
  useEffect(() => {
    if (edition || !estEmail) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    function ajuster() {
      const doc = iframe?.contentDocument;
      if (!doc?.body) return;
      const h = doc.body.scrollHeight;
      iframe!.style.height = `${Math.max(h + 16, 220)}px`;
    }

    iframe.addEventListener("load", ajuster);
    // Petit délai si le contenu est déjà chargé
    const t = window.setTimeout(ajuster, 50);
    return () => {
      iframe.removeEventListener("load", ajuster);
      window.clearTimeout(t);
    };
  }, [contenu, edition, estEmail]);

  async function handleSave() {
    setEnregistrement(true);
    const reussi = await onSave({
      objet_final: estEmail ? objet.trim() : null,
      message_final_html: contenu.trim(),
    });
    setEnregistrement(false);
    if (reussi) setEdition(false);
  }

  function handleCancel() {
    setObjet(message.objet_final ?? "");
    setContenu(message.message_final_html);
    setEdition(false);
  }

  if (edition) {
    return (
      <div className="rounded-[8px] border border-accent-line bg-surface-2/40 p-4">
        <p className="mb-3 text-[12.5px] text-muted">
          Destinataire : {message.prenom} ({message.email})
        </p>
        <div className="space-y-3">
          {estEmail && (
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
              {estEmail ? "HTML du message" : "Texte du SMS"}
            </span>
            <textarea
              rows={estEmail ? 14 : 5}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              className={`${inputClass} h-auto resize-y py-2.5 font-mono text-[12.5px] leading-relaxed`}
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={handleCancel} className={buttonSecondary}>
            Annuler
          </button>
          <button
            type="button"
            disabled={enregistrement || contenu.trim().length === 0}
            onClick={() => void handleSave()}
            className={buttonPrimary}
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-[8px] border border-border bg-surface-2/40">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2 text-[12px] text-faint">
          <span className="text-muted">
            {estEmail ? (
              <IconMail className="h-4 w-4" />
            ) : (
              <IconSms className="h-4 w-4" />
            )}
          </span>
          {message.prenom}
          <span className="text-border">·</span>
          <span className="font-mono">{message.email}</span>
        </span>

        {modifiable && (
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-foreground"
          >
            <IconPencil className="h-3.5 w-3.5" />
            Modifier
          </button>
        )}
      </div>

      {estEmail ? (
        <div className="px-4 py-4">
          <dl className="space-y-1 border-b border-border pb-3">
            <Entete label="De" valeur={expediteur} />
            <Entete label="À" valeur={`${message.prenom} <${message.email}>`} />
            <Entete label="Objet" valeur={message.objet_final ?? ""} accent />
          </dl>
          <div className="mt-3 overflow-hidden rounded-md border border-border bg-white">
            <iframe
              ref={iframeRef}
              title={`Aperçu email — ${message.prenom}`}
              srcDoc={message.message_final_html}
              sandbox=""
              className="w-full border-0 bg-white"
              style={{ minHeight: 220 }}
            />
          </div>
          <p className="mt-2 text-[11px] text-faint">
            L&apos;envoi partira d&apos;un domaine Safentreprise dédié ; seul le
            nom d&apos;expéditeur ci-dessus est imité.
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="text-[12px] text-faint">
            De : {expediteur} · vers {message.telephone ?? "—"}
          </p>
          <p className="mt-2.5 max-w-sm whitespace-pre-line rounded-[12px] rounded-bl-[3px] bg-surface-3 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground">
            {message.message_final_html}
          </p>
        </div>
      )}
    </div>
  );
}

function Entete({
  label,
  valeur,
  accent = false,
}: {
  label: string;
  valeur: string;
  accent?: boolean;
}) {
  return (
    <div className="flex gap-2 text-[12.5px]">
      <dt className="w-12 shrink-0 text-faint">{label}</dt>
      <dd
        className={
          accent ? "font-medium text-foreground" : "font-mono text-muted"
        }
      >
        {valeur}
      </dd>
    </div>
  );
}
