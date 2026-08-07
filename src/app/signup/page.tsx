"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Field, buttonPrimary } from "@/components/ui";

/** Page d'inscription dirigeant (email + mot de passe). */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Si la confirmation email est désactivée, la session est immédiate
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setMessage(
      "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous."
    );
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Réservé aux dirigeants et responsables administratifs de l'entreprise."
      footer={
        <>
          Vous avez déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-accent-text hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}

        <Field
          label="Email professionnel"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@entreprise.fr"
          autoComplete="email"
        />

        <Field
          label="Mot de passe"
          hint="8 caractères minimum"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading}
          className={`${buttonPrimary} mt-2 h-10 w-full`}
        >
          {loading ? "Création…" : "Créer mon compte"}
        </button>

        <p className="pt-1 text-[12px] leading-relaxed text-faint">
          Vous configurerez votre société à l&apos;étape suivante.
        </p>
      </form>
    </AuthShell>
  );
}
