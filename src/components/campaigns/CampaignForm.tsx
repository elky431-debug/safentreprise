"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CANAL_LABELS,
  COULEUR_MARQUE_DEFAUT,
  TYPE_FRAUDE_DESCRIPTIONS,
  TYPE_FRAUDE_LABELS,
  signatureParDefaut,
} from "@/lib/campaigns";
import type {
  Branding,
  CanalMessage,
  Employee,
  Supplier,
  TypeFraude,
} from "@/lib/types";
import {
  Alert,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import { IconMail, IconSms, IconUpload, IconUsers } from "@/components/icons";

type Etape = "infos" | "fournisseur" | "marque" | "cibles";

type Props = {
  companyId: string;
  nomEntreprise: string;
  nomDirigeant: string;
  employees: Employee[];
  brandingInitial: Branding | null;
  suppliersInitial: Supplier[];
};

/**
 * Assistant de création de campagne :
 * infos → (fournisseur) → marque → cibles → composition des gabarits.
 */
export function CampaignForm({
  companyId,
  nomEntreprise,
  nomDirigeant,
  employees,
  brandingInitial,
  suppliersInitial,
}: Props) {
  const router = useRouter();

  const [etape, setEtape] = useState<Etape>("infos");
  const [nom, setNom] = useState("");
  const [typeFraude, setTypeFraude] = useState<TypeFraude>("president");
  const [canal, setCanal] = useState<CanalMessage>("email");

  const [suppliers, setSuppliers] = useState(suppliersInitial);
  const [supplierId, setSupplierId] = useState<string | null>(
    suppliersInitial[0]?.id ?? null,
  );
  const [nouveauFournisseur, setNouveauFournisseur] = useState("");
  const [ajoutFournisseur, setAjoutFournisseur] = useState(false);

  const [logoUrl, setLogoUrl] = useState(brandingInitial?.logo_url ?? "");
  const [couleur, setCouleur] = useState(
    brandingInitial?.couleur_principale ?? COULEUR_MARQUE_DEFAUT,
  );
  const [signatureHtml, setSignatureHtml] = useState(
    brandingInitial?.signature_html ??
      signatureParDefaut(nomDirigeant, nomEntreprise),
  );
  const [uploadLogo, setUploadLogo] = useState(false);

  const [cibles, setCibles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soumission, setSoumission] = useState<
    "attente" | "creation" | "composition"
  >("attente");

  const enCours = soumission !== "attente";
  const sansTelephone = employees.filter((e) => !e.telephone).length;

  const etapesVisibles = useMemo(() => {
    const base: Etape[] = ["infos"];
    if (typeFraude === "fournisseur") base.push("fournisseur");
    base.push("marque", "cibles");
    return base;
  }, [typeFraude]);

  const indexEtape = etapesVisibles.indexOf(etape);

  function basculerCible(id: string) {
    setCibles((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  function allerSuivant() {
    setError(null);

    if (etape === "infos") {
      if (!nom.trim()) {
        setError("Indiquez un nom de campagne.");
        return;
      }
      setEtape(typeFraude === "fournisseur" ? "fournisseur" : "marque");
      return;
    }

    if (etape === "fournisseur") {
      if (!supplierId) {
        setError("Choisissez ou créez un fournisseur.");
        return;
      }
      setEtape("marque");
      return;
    }

    if (etape === "marque") {
      if (!/^#[0-9A-Fa-f]{6}$/.test(couleur.trim())) {
        setError("La couleur doit être un code hexadécimal (#0e8593).");
        return;
      }
      setEtape("cibles");
    }
  }

  function allerPrecedent() {
    setError(null);
    const idx = etapesVisibles.indexOf(etape);
    if (idx > 0) setEtape(etapesVisibles[idx - 1]);
  }

  async function creerFournisseur() {
    const nomF = nouveauFournisseur.trim();
    if (!nomF) {
      setError("Indiquez le nom du fournisseur.");
      return;
    }

    setAjoutFournisseur(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("suppliers")
      .insert({ company_id: companyId, nom: nomF })
      .select("*")
      .single<Supplier>();

    setAjoutFournisseur(false);

    if (err || !data) {
      setError(err?.message ?? "Le fournisseur n'a pas pu être créé.");
      return;
    }

    setSuppliers((prev) => [...prev, data]);
    setSupplierId(data.id);
    setNouveauFournisseur("");
  }

  async function onLogoChange(file: File | null) {
    if (!file) return;
    setError(null);
    setUploadLogo(true);

    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const chemin = `${companyId}/logo-${Date.now()}.${ext}`;

    const { error: errUpload } = await supabase.storage
      .from("branding")
      .upload(chemin, file, { upsert: true, contentType: file.type });

    if (errUpload) {
      setUploadLogo(false);
      setError(
        errUpload.message.includes("Bucket")
          ? "Bucket Storage « branding » introuvable. Exécutez npm run db:apply."
          : errUpload.message,
      );
      return;
    }

    const { data } = supabase.storage.from("branding").getPublicUrl(chemin);
    setLogoUrl(data.publicUrl);
    setUploadLogo(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (cibles.length === 0) {
      setError("Sélectionnez au moins un collaborateur à cibler.");
      return;
    }

    if (canal === "sms") {
      const ok = cibles.some((id) => {
        const emp = employees.find((e) => e.id === id);
        return Boolean(emp?.telephone);
      });
      if (!ok) {
        setError(
          "Aucun collaborateur sélectionné n'a de téléphone pour le canal SMS.",
        );
        return;
      }
    }

    const supabase = createClient();
    setSoumission("creation");

    // 1. Enregistre / met à jour la charte
    const { error: errBranding } = await supabase.from("branding").upsert(
      {
        company_id: companyId,
        logo_url: logoUrl.trim() || null,
        couleur_principale: couleur.trim(),
        signature_html: signatureHtml.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );

    if (errBranding) {
      setSoumission("attente");
      setError("La charte n'a pas pu être enregistrée.");
      return;
    }

    // 2. Crée la campagne
    const { data: campagne, error: erreurCampagne } = await supabase
      .from("campaigns")
      .insert({
        company_id: companyId,
        nom: nom.trim(),
        type_fraude: typeFraude,
        canal,
        statut: "brouillon",
        supplier_id: typeFraude === "fournisseur" ? supplierId : null,
      })
      .select("id")
      .single();

    if (erreurCampagne || !campagne) {
      setSoumission("attente");
      setError(
        erreurCampagne?.message ?? "La campagne n'a pas pu être créée.",
      );
      return;
    }

    // 3. Cibles
    const { error: erreurCibles } = await supabase.from("campaign_targets").insert(
      cibles.map((employeeId) => ({
        campaign_id: campagne.id,
        employee_id: employeeId,
      })),
    );

    if (erreurCibles) {
      setSoumission("attente");
      setError("Les collaborateurs ciblés n'ont pas pu être enregistrés.");
      return;
    }

    // 4. Composition depuis les gabarits (serveur, sans IA)
    setSoumission("composition");

    try {
      const reponse = await fetch(`/api/campaigns/${campagne.id}/compose`, {
        method: "POST",
      });

      if (!reponse.ok) {
        const { erreur } = await reponse.json().catch(() => ({ erreur: null }));
        setSoumission("attente");
        setError(erreur ?? "La composition des messages a échoué.");
        // La campagne existe : on peut ouvrir l'aperçu pour réessayer
        router.push(`/campaigns/${campagne.id}`);
        return;
      }
    } catch {
      setSoumission("attente");
      setError("Le serveur n'a pas répondu.");
      router.push(`/campaigns/${campagne.id}`);
      return;
    }

    router.push(`/campaigns/${campagne.id}`);
  }

  /* ------------------------------------------------------------------------ */

  if (employees.length === 0) {
    return (
      <div className="w-full">
        <PageHeader title="Nouvelle campagne" />
        <div className="panel-relief flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-accent-soft text-accent-text">
            <IconUsers />
          </span>
          <p className="mt-4 text-[14.5px] font-medium text-foreground">
            Aucun collaborateur à cibler
          </p>
          <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">
            Importez d&apos;abord votre base de collaborateurs.
          </p>
          <Link href="/employees" className={`${buttonPrimary} mt-6`}>
            Ajouter des collaborateurs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        if (etape !== "cibles") {
          e.preventDefault();
          allerSuivant();
          return;
        }
        void handleSubmit(e);
      }}
      className="w-full"
    >
      <PageHeader
        title="Nouvelle campagne"
        description="Personnalisez un gabarit HTML avec votre charte et vos données — sans génération automatique."
      />

      {/* Indicateur d'étapes */}
      <ol className="mb-6 flex flex-wrap gap-2">
        {etapesVisibles.map((e, i) => (
          <li
            key={e}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
              i === indexEtape
                ? "bg-accent-soft text-accent-text"
                : i < indexEtape
                  ? "bg-surface-2 text-foreground"
                  : "bg-surface-2/50 text-faint"
            }`}
          >
            {i + 1}.{" "}
            {e === "infos"
              ? "Scénario"
              : e === "fournisseur"
                ? "Fournisseur"
                : e === "marque"
                  ? "Marque"
                  : "Cibles"}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {etape === "infos" && (
        <>
          <Panel>
            <PanelHeader title="Intitulé" />
            <div className="px-6 py-5 sm:max-w-md">
              <Field
                label="Nom de la campagne"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Test comptabilité — septembre"
              />
            </div>
          </Panel>

          <Panel className="mt-6">
            <PanelHeader
              title="Type de fraude"
              description="Un seul scénario par campagne, pour un message cohérent."
            />
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              {(["president", "fournisseur"] as TypeFraude[]).map((type) => (
                <ChoixRadio
                  key={type}
                  name="type"
                  coche={typeFraude === type}
                  onChange={() => setTypeFraude(type)}
                  titre={TYPE_FRAUDE_LABELS[type]}
                  description={TYPE_FRAUDE_DESCRIPTIONS[type]}
                />
              ))}
            </div>
          </Panel>

          <Panel className="mt-6">
            <PanelHeader title="Canal" />
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              {(["email", "sms"] as CanalMessage[]).map((c) => (
                <ChoixRadio
                  key={c}
                  name="canal"
                  coche={canal === c}
                  onChange={() => setCanal(c)}
                  titre={CANAL_LABELS[c]}
                  description={
                    c === "email"
                      ? "Email HTML rendu comme dans une boîte mail."
                      : `${employees.length - sansTelephone} collaborateur(s) joignable(s) par SMS.`
                  }
                  icone={c === "email" ? <IconMail /> : <IconSms />}
                />
              ))}
            </div>
          </Panel>
        </>
      )}

      {etape === "fournisseur" && (
        <Panel>
          <PanelHeader
            title="Fournisseur imité"
            description="Choisissez un fournisseur de votre liste, ou ajoutez-en un."
          />
          <div className="space-y-4 px-6 py-5">
            {suppliers.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {suppliers.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                      <input
                        type="radio"
                        name="supplier"
                        checked={supplierId === s.id}
                        onChange={() => setSupplierId(s.id)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="flex-1 text-[13.5px] text-foreground">
                        {s.nom}
                      </span>
                      {s.email_type && (
                        <span className="font-mono text-[12px] text-muted">
                          {s.email_type}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">
                Aucun fournisseur enregistré pour l&apos;instant.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <Field
                  label="Nouveau fournisseur"
                  value={nouveauFournisseur}
                  onChange={(e) => setNouveauFournisseur(e.target.value)}
                  placeholder="Ex. Société Dupont Logistique"
                />
              </div>
              <button
                type="button"
                disabled={ajoutFournisseur}
                onClick={() => void creerFournisseur()}
                className={buttonSecondary}
              >
                {ajoutFournisseur ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {etape === "marque" && (
        <Panel>
          <PanelHeader
            title="Marque"
            description={
              "Ces éléments sont injectés dans le gabarit ({logo}, {couleur}, {signature})."
            }
          />
          <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                  Logo
                </span>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 px-4 py-8 transition-colors hover:border-accent-line">
                  <IconUpload />
                  <span className="text-[13px] text-muted">
                    {uploadLogo
                      ? "Envoi…"
                      : "PNG, JPG ou WebP — max 2 Mo"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    disabled={uploadLogo}
                    onChange={(e) =>
                      void onLogoChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {logoUrl && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-10 max-w-[120px] object-contain"
                    />
                    <button
                      type="button"
                      className="text-[12.5px] text-muted hover:text-foreground"
                      onClick={() => setLogoUrl("")}
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                  Couleur principale
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={couleur}
                    onChange={(e) => setCouleur(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <input
                    className={inputClass}
                    value={couleur}
                    onChange={(e) => setCouleur(e.target.value)}
                    placeholder="#0e8593"
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                Signature HTML
              </span>
              <textarea
                rows={10}
                value={signatureHtml}
                onChange={(e) => setSignatureHtml(e.target.value)}
                className={`${inputClass} h-auto resize-y py-2.5 font-mono text-[12.5px] leading-relaxed`}
              />
              <span className="mt-1.5 block text-[11.5px] text-faint">
                HTML libre (nom, titre, téléphone…). Injecté via {"{signature}"}.
              </span>
            </label>
          </div>
        </Panel>
      )}

      {etape === "cibles" && (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Collaborateurs ciblés"
            action={
              <div className="flex items-center gap-2">
                <span className="tabular rounded-[5px] border border-border bg-surface-2 px-2 py-1 text-[12px] text-muted">
                  {cibles.length} / {employees.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCibles(
                      cibles.length === employees.length
                        ? []
                        : employees.map((e) => e.id),
                    )
                  }
                  className={buttonSecondary}
                >
                  {cibles.length === employees.length
                    ? "Tout décocher"
                    : "Tout cocher"}
                </button>
              </div>
            }
          />
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {employees.map((employee) => (
              <li key={employee.id}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/50">
                  <input
                    type="checkbox"
                    checked={cibles.includes(employee.id)}
                    onChange={() => basculerCible(employee.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 text-[13.5px] text-foreground">
                    {employee.prenom}
                  </span>
                  <span className="truncate font-mono text-[12.5px] text-muted">
                    {employee.email}
                  </span>
                  <span className="tabular w-32 text-right text-[12.5px] text-faint">
                    {employee.telephone || "pas de téléphone"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          {indexEtape > 0 ? (
            <button
              type="button"
              onClick={allerPrecedent}
              disabled={enCours}
              className={buttonSecondary}
            >
              Retour
            </button>
          ) : (
            <Link href="/campaigns" className={buttonSecondary}>
              Annuler
            </Link>
          )}
        </div>
        <button type="submit" disabled={enCours} className={buttonPrimary}>
          {soumission === "creation"
            ? "Création…"
            : soumission === "composition"
              ? "Composition des messages…"
              : etape === "cibles"
                ? "Composer les messages"
                : "Continuer"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function ChoixRadio({
  name,
  coche,
  onChange,
  titre,
  description,
  icone,
}: {
  name: string;
  coche: boolean;
  onChange: () => void;
  titre: string;
  description: string;
  icone?: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-4 transition-colors ${
        coche
          ? "border-accent-line bg-accent-soft"
          : "border-border bg-surface-2/40 hover:border-border-strong"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={coche}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
          {icone && <span className="text-muted">{icone}</span>}
          {titre}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
          {description}
        </span>
      </span>
    </label>
  );
}
