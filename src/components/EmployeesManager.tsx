"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseEmployeeFile } from "@/lib/parse-employees";
import type { Employee } from "@/lib/types";
import {
  Alert,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";
import { IconTrash, IconUpload, IconUsers } from "@/components/icons";

type Props = {
  companyId: string;
  initialEmployees: Employee[];
};

/** Gestion des employés : liste, ajout manuel, import de fichier, suppression. */
export function EmployeesManager({ companyId, initialEmployees }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employees, setEmployees] = useState(initialEmployees);
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Suppression confirmée en deux temps, sans boîte de dialogue système
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("employees")
      .insert({
        company_id: companyId,
        prenom: prenom.trim(),
        email: email.trim().toLowerCase(),
        telephone: telephone.trim() || null,
      })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "Cet email est déjà enregistré pour votre société."
          : insertError.message
      );
      return;
    }

    setEmployees((prev) => [...prev, data as Employee]);
    setPrenom("");
    setEmail("");
    setTelephone("");
    setSuccess("Collaborateur ajouté.");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("employees")
      .delete()
      .eq("id", id);

    setPendingDelete(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setSuccess("Collaborateur supprimé.");
    router.refresh();
  }

  async function handleImport(file: File) {
    setError(null);
    setSuccess(null);
    setImporting(true);

    try {
      const parsed = await parseEmployeeFile(file);

      if (parsed.length === 0) {
        setError(
          "Aucune ligne exploitable. Vérifiez les colonnes : prenom, email, telephone."
        );
        return;
      }

      const supabase = createClient();
      const rows = parsed.map((p) => ({
        company_id: companyId,
        prenom: p.prenom,
        email: p.email,
        telephone: p.telephone,
      }));

      const { data, error: insertError } = await supabase
        .from("employees")
        .upsert(rows, { onConflict: "company_id,email", ignoreDuplicates: true })
        .select();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      const inserted = (data as Employee[]) ?? [];
      if (inserted.length > 0) {
        setEmployees((prev) => {
          const knownEmails = new Set(prev.map((e) => e.email));
          return [...prev, ...inserted.filter((e) => !knownEmails.has(e.email))];
        });
      }

      setSuccess(
        `${inserted.length} collaborateur(s) importé(s) sur ${parsed.length} ligne(s) lue(s).`
      );
      router.refresh();
    } catch {
      setError("Fichier illisible. Utilisez un CSV ou un Excel (.xlsx).");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleImport(file);
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Employés"
        description="Les collaborateurs enregistrés ici sont les cibles potentielles de vos simulations."
      />

      {(error || success) && (
        <div className="mb-6 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>
      )}

      {/* Ajout manuel */}
      <Panel>
        <PanelHeader title="Ajouter un collaborateur" />
        <form
          onSubmit={handleAdd}
          className="grid gap-4 px-6 py-6 sm:grid-cols-[1fr_1.4fr_1fr_auto] sm:items-end"
        >
          <Field
            label="Prénom"
            required
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            placeholder="Sophie"
          />
          <Field
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sophie@entreprise.fr"
          />
          <Field
            label="Téléphone"
            hint="Facultatif"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="06 12 34 56 78"
          />
          <button type="submit" disabled={loading} className={buttonPrimary}>
            {loading ? "Ajout…" : "Ajouter"}
          </button>
        </form>
      </Panel>

      {/* Import de fichier */}
      <Panel className="mt-6">
        <PanelHeader
          title="Import en masse"
          description="Colonnes attendues : prenom, email, telephone (facultatif). Les doublons sont ignorés."
        />
        <div className="px-6 py-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${
              dragging
                ? "border-accent-line bg-accent-soft"
                : "border-border-strong bg-surface-2/40"
            }`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-accent-text">
              <IconUpload />
            </span>
            <p className="mt-3.5 text-[13.5px] text-foreground">
              Déposez votre fichier ici
            </p>
            <p className="mt-1 text-[12.5px] text-faint">
              Formats acceptés : CSV, XLSX, XLS
            </p>

            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className={`${buttonSecondary} mt-5`}
            >
              {importing ? "Import en cours…" : "Parcourir mes fichiers"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
          </div>
        </div>
      </Panel>

      {/* Liste */}
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Collaborateurs"
          action={
            <span className="tabular rounded-[5px] border border-border bg-surface-2 px-2 py-1 text-[12px] text-muted">
              {employees.length}
            </span>
          }
        />

        {employees.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-border bg-surface-2 text-muted">
              <IconUsers />
            </span>
            <p className="mt-3.5 text-[13.5px] font-medium text-foreground">
              Aucun collaborateur enregistré
            </p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
              Ajoutez-en un manuellement ou importez votre fichier pour
              commencer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <Th>Prénom</Th>
                  <Th>Email</Th>
                  <Th>Téléphone</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface-2/50"
                  >
                    <td className="px-5 py-3 text-[13.5px] text-foreground">
                      {emp.prenom}
                    </td>
                    <td className="px-5 py-3 font-mono text-[12.5px] text-muted">
                      {emp.email}
                    </td>
                    <td className="tabular px-5 py-3 text-[13px] text-muted">
                      {emp.telephone || "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {pendingDelete === emp.id ? (
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDelete(emp.id)}
                            className="text-[13px] font-medium text-danger hover:underline"
                          >
                            Confirmer
                          </button>
                          <span className="text-faint">·</span>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="text-[13px] text-muted hover:text-foreground"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(emp.id)}
                          aria-label={`Supprimer ${emp.prenom}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-faint ${className}`}
    >
      {children}
    </th>
  );
}
