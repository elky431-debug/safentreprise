"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resumeCampagne } from "@/lib/campaigns";
import type { Campaign, Company, Supplier } from "@/lib/types";
import {
  Alert,
  Field,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import {
  IconArrowRight,
  IconCheck,
  IconMail,
  IconRefresh,
  IconSms,
} from "@/components/icons";
import { StatutBadge } from "@/components/campaigns/StatutBadge";
import {
  MessageMockup,
  type MessageApercu,
} from "@/components/campaigns/MessageMockup";

type Props = {
  campaign: Campaign;
  company: Company;
  supplier: Supplier | null;
  /** Liste des fournisseurs de la société (pour rattacher si manquant). */
  suppliers: Supplier[];
  initialMessages: MessageApercu[];
};

/**
 * Aperçu et édition des messages finaux (un par collaborateur),
 * puis validation → statut « prête » + token_unique.
 */
export function CampaignPreview({
  campaign,
  company,
  supplier: supplierInitial,
  suppliers: suppliersInitial,
  initialMessages,
}: Props) {
  const router = useRouter();

  const [messages, setMessages] = useState(initialMessages);
  const [statut, setStatut] = useState(campaign.statut);
  const [supplier, setSupplier] = useState(supplierInitial);
  const [suppliers, setSuppliers] = useState(suppliersInitial);
  const [supplierId, setSupplierId] = useState(supplierInitial?.id ?? "");
  const [nouveauFournisseur, setNouveauFournisseur] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [composition, setComposition] = useState(false);
  const [validation, setValidation] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [liaison, setLiaison] = useState(false);

  const figee = statut === "envoyee";
  const besoinFournisseur =
    campaign.type_fraude === "fournisseur" ||
    campaign.type_fraude === "les_deux";
  const fournisseurManquant = besoinFournisseur && !supplier;

  async function rattacherFournisseur() {
    setError(null);
    setSuccess(null);

    let id = supplierId;
    const supabase = createClient();
    setLiaison(true);

    try {
      if (!id && nouveauFournisseur.trim()) {
        const { data, error: err } = await supabase
          .from("suppliers")
          .insert({
            company_id: company.id,
            nom: nouveauFournisseur.trim(),
          })
          .select("*")
          .single<Supplier>();

        if (err || !data) {
          setError(err?.message ?? "Impossible de créer le fournisseur.");
          return;
        }
        id = data.id;
        setSuppliers((prev) => [...prev, data]);
        setSupplier(data);
        setSupplierId(data.id);
        setNouveauFournisseur("");
      }

      if (!id) {
        setError("Choisissez ou créez un fournisseur.");
        return;
      }

      const { error: errCamp } = await supabase
        .from("campaigns")
        .update({ supplier_id: id })
        .eq("id", campaign.id);

      if (errCamp) {
        setError("Le fournisseur n'a pas pu être rattaché à la campagne.");
        return;
      }

      const choisi =
        suppliers.find((s) => s.id === id) ??
        (await supabase
          .from("suppliers")
          .select("*")
          .eq("id", id)
          .maybeSingle<Supplier>()
          .then(({ data }) => data));
      if (choisi) setSupplier(choisi);
      setSuccess("Fournisseur rattaché. Vous pouvez composer les messages.");
      router.refresh();
    } finally {
      setLiaison(false);
    }
  }

  async function recomposer() {
    setError(null);
    setSuccess(null);
    setComposition(true);

    try {
      const reponse = await fetch(`/api/campaigns/${campaign.id}/compose`, {
        method: "POST",
      });
      const corps = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setError(corps?.erreur ?? "La composition a échoué.");
        return;
      }

      const supabase = createClient();
      const { data: cibles } = await supabase
        .from("campaign_targets")
        .select(
          "id, message_final_html, objet_final, employees(prenom, email, telephone)",
        )
        .eq("campaign_id", campaign.id);

      const typeFraude =
        campaign.type_fraude === "fournisseur" ? "fournisseur" : "president";

      setMessages(
        (cibles ?? []).flatMap((cible) => {
          const raw = cible.employees as unknown;
          const emp = Array.isArray(raw)
            ? (raw[0] as {
                prenom: string;
                email: string;
                telephone: string | null;
              } | undefined)
            : (raw as {
                prenom: string;
                email: string;
                telephone: string | null;
              } | null);

          if (!emp || !cible.message_final_html) return [];

          const canal =
            campaign.canal === "sms"
              ? ("sms" as const)
              : campaign.canal === "email"
                ? ("email" as const)
                : cible.objet_final ||
                    /<\/?[a-z]/i.test(cible.message_final_html)
                  ? ("email" as const)
                  : ("sms" as const);

          return [
            {
              id: cible.id,
              canal,
              type_fraude: typeFraude as "president" | "fournisseur",
              objet_final: cible.objet_final,
              message_final_html: cible.message_final_html,
              prenom: emp.prenom,
              email: emp.email,
              telephone: emp.telephone,
            },
          ];
        }),
      );

      setStatut("brouillon");
      setSuccess(
        `${corps.composees} message(s) composé(s). Relisez-les avant de valider.`,
      );
      router.refresh();
    } catch {
      setError("Le serveur n'a pas répondu. Réessayez.");
    } finally {
      setComposition(false);
    }
  }

  async function enregistrerMessage(
    id: string,
    champs: { objet_final: string | null; message_final_html: string },
  ) {
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: erreur } = await supabase
      .from("campaign_targets")
      .update(champs)
      .eq("id", id);

    if (erreur) {
      setError("La modification n'a pas pu être enregistrée.");
      return false;
    }

    // Une modification manuelle invalide le statut « prête »
    if (statut === "prete") {
      await supabase
        .from("campaigns")
        .update({ statut: "brouillon" })
        .eq("id", campaign.id);
      setStatut("brouillon");
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...champs } : m)),
    );
    setSuccess("Message enregistré.");
    router.refresh();
    return true;
  }

  async function validerCampagne() {
    setError(null);
    setSuccess(null);
    setValidation(true);

    try {
      const reponse = await fetch(`/api/campaigns/${campaign.id}/validate`, {
        method: "POST",
      });
      const corps = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setError(corps?.erreur ?? "La validation a échoué.");
        return;
      }

      setStatut("prete");
      setSuccess(
        corps?.nonAttribuees > 0
          ? `Campagne prête. ${corps.nonAttribuees} collaborateur(s) sans message composé.`
          : "Campagne prête. Vous pouvez maintenant l'envoyer.",
      );
      router.refresh();
    } catch {
      setError("Le serveur n'a pas répondu. Réessayez.");
    } finally {
      setValidation(false);
    }
  }

  async function envoyerCampagne() {
    const confirme = window.confirm(
      "Envoyer les emails de simulation aux collaborateurs ciblés ?\n\n" +
        "Cette action est définitive pour cette campagne.",
    );
    if (!confirme) return;

    setError(null);
    setSuccess(null);
    setEnvoi(true);

    try {
      const reponse = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: "POST",
      });
      const corps = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        const detailEchec =
          Array.isArray(corps?.details) &&
          corps.details.find((d: { ok: boolean }) => !d.ok)?.detail;
        setError(
          corps?.erreur ??
            detailEchec ??
            "L'envoi a échoué.",
        );
        // Reste en prête si rien n'est parti
        if (corps?.envoyes === 0) setStatut("prete");
        return;
      }

      setStatut("envoyee");
      setSuccess(
        `Campagne envoyée : ${corps.envoyes} email(s) OK` +
          (corps.echecs > 0 ? `, ${corps.echecs} échec(s)` : "") +
          (corps.smsIgnores > 0
            ? `, ${corps.smsIgnores} SMS ignoré(s) (non implémenté)`
            : "") +
          ".",
      );
      router.refresh();
    } catch {
      setError("Le serveur n'a pas répondu. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="w-full">
      <header className="mb-9">
        <Link
          href="/campaigns"
          className="text-[12.5px] text-muted transition-colors hover:text-foreground"
        >
          ← Campagnes
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
          {campaign.nom}
          <StatutBadge statut={statut} />
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {resumeCampagne(campaign.type_fraude, campaign.canal)}
          {supplier ? ` · ${supplier.nom}` : ""} · {messages.length}{" "}
          message(s)
        </p>
      </header>

      {(error || success) && (
        <div className="mb-6 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>
      )}

      {fournisseurManquant && (
        <Panel className="mb-6">
          <PanelHeader
            title="Fournisseur manquant"
            description="Ce scénario imite un fournisseur. Rattachez-en un avant de composer les messages."
          />
          <div className="space-y-4 px-6 py-5">
            {suppliers.length > 0 && (
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                  Fournisseur existant
                </span>
                <select
                  className={inputClass}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <Field
                  label="Ou nouveau fournisseur"
                  value={nouveauFournisseur}
                  onChange={(e) => setNouveauFournisseur(e.target.value)}
                  placeholder="Ex. Dupont Logistique"
                />
              </div>
              <button
                type="button"
                disabled={liaison || figee}
                onClick={() => void rattacherFournisseur()}
                className={buttonPrimary}
              >
                {liaison ? "Enregistrement…" : "Rattacher"}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center rounded-[10px] border border-dashed border-border-strong px-6 py-16 text-center">
          <p className="text-[13.5px] font-medium text-foreground">
            Aucun message composé
          </p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
            {fournisseurManquant
              ? "Rattachez d'abord un fournisseur ci-dessus, puis composez."
              : "Les gabarits HTML sont personnalisés avec votre logo, votre charte et le prénom de chaque collaborateur."}
          </p>
          <button
            type="button"
            disabled={composition || figee || fournisseurManquant}
            onClick={() => void recomposer()}
            className={`${buttonPrimary} mt-5`}
          >
            {composition ? "Composition…" : "Composer les messages"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title="Messages personnalisés"
              description="Aperçu fidèle — un rendu par collaborateur. Modifiez le texte avant validation."
              action={
                <button
                  type="button"
                  disabled={composition || figee}
                  onClick={() => void recomposer()}
                  className={buttonSecondary}
                >
                  <IconRefresh />
                  {composition ? "Composition…" : "Recomposer"}
                </button>
              }
            />
            <div className="space-y-4 px-5 py-5">
              {messages.map((message) => (
                <MessageMockup
                  key={message.id}
                  message={message}
                  nomDirigeant={company.nom_dirigeant}
                  nomFournisseur={supplier?.nom ?? null}
                  modifiable={!figee}
                  onSave={(champs) => enregistrerMessage(message.id, champs)}
                />
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Collaborateurs ciblés"
              action={
                <span className="tabular rounded-[5px] border border-border bg-surface-2 px-2 py-1 text-[12px] text-muted">
                  {messages.length}
                </span>
              }
            />
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {messages.map((cible) => (
                <li
                  key={cible.id}
                  className="flex items-center gap-4 px-5 py-2.5"
                >
                  <span className="flex-1 text-[13.5px] text-foreground">
                    {cible.prenom}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[12.5px] text-muted">
                    <IconMail className="h-3.5 w-3.5" />
                    {cible.email}
                  </span>
                  <span className="tabular flex w-40 items-center justify-end gap-1.5 text-[12.5px] text-faint">
                    {cible.telephone ? (
                      <>
                        <IconSms className="h-3.5 w-3.5" />
                        {cible.telephone}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-[12.5px] leading-relaxed text-faint">
              {statut === "envoyee"
                ? "Campagne envoyée. Les clics et quiz sont suivis via le lien de tracking."
                : statut === "prete"
                  ? "La campagne est prête. L'envoi utilise Resend et injecte le lien de suivi."
                  : "La validation génère un jeton de suivi par cible. Aucun message n'est envoyé à ce stade."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {statut === "envoyee" ? (
                <>
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium text-success">
                    <IconCheck />
                    Campagne envoyée
                  </span>
                  <button
                    type="button"
                    disabled={envoi || composition}
                    onClick={() => void envoyerCampagne()}
                    className={buttonSecondary}
                    title="Réessayer si aucun email n'était vraiment parti"
                  >
                    {envoi ? "Envoi…" : "Réessayer l'envoi"}
                  </button>
                </>
              ) : statut === "prete" ? (
                <>
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium text-success">
                    <IconCheck />
                    Campagne prête
                  </span>
                  <button
                    type="button"
                    disabled={envoi || composition}
                    onClick={() => void envoyerCampagne()}
                    className={buttonPrimary}
                  >
                    {envoi ? "Envoi…" : "Envoyer la campagne"}
                    <IconArrowRight />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={validation || figee || composition}
                  onClick={() => void validerCampagne()}
                  className={buttonPrimary}
                >
                  {validation ? "Validation…" : "Valider la campagne"}
                  <IconArrowRight />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
