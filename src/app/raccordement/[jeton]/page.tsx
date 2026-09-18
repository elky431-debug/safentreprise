import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ParcoursInformaticien } from "@/components/raccordement/ParcoursInformaticien";
import { LienInvalide } from "@/components/raccordement/LienInvalide";
import { Logo } from "@/components/Logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La page de l'informaticien. Aucun compte, aucune inscription.
 *
 * Référence : docs/PARCOURS-RACCORDEMENT.md, « Parcours informaticien ».
 *
 * ⚠ L'ÉTAPE VIENT DE LA BASE, JAMAIS DU NAVIGATEUR. L'informaticien fermera
 *   son onglet pendant l'heure de propagation de Microsoft, et reviendra
 *   peut-être le lendemain depuis une autre machine. Rien n'est gardé côté
 *   client : à la réouverture, la page reprend là où la base dit qu'on en est.
 *   C'était déjà la règle de `Raccordement.tsx`, et elle vaut deux fois ici.
 *
 * ⚠ AUCUNE SESSION N'EST CRÉÉE. Le jeton n'ouvre pas de cookie et ne passe pas
 *   par Supabase Auth. Tout ce qu'il permet passe par des fonctions
 *   SECURITY DEFINER qui le prennent en argument — voir la migration
 *   20260918. L'espace connecté reste inatteignable depuis cette page.
 *
 * ⚠ PAS D'INDEXATION. Un lien de raccordement n'a rien à faire dans un moteur
 *   de recherche, même expiré.
 */
export const metadata: Metadata = {
  title: "Raccordement Microsoft 365 — Safentreprise",
  robots: { index: false, follow: false },
};

type Lecture = {
  valide: boolean;
  motif: string | null;
  societe_nom: string | null;
  dirigeant_nom: string | null;
  adresses_demandees: string[] | null;
  mot_du_dirigeant: string | null;
  expire_at: string | null;
};

export default async function PageRaccordement({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  const supabase = await createClient();

  // ⚠ LA CLÉ ANONYME SUFFIT, ET C'EST LE POINT. `lire_jeton_raccordement` est
  //   SECURITY DEFINER : elle lit pour nous et ne rend que du raccordement.
  //   Aucune politique RLS n'ouvre la table des jetons à `anon`.
  const { data, error } = await supabase.rpc("lire_jeton_raccordement", {
    p_jeton: jeton,
  });

  const lecture = (Array.isArray(data) ? data[0] : data) as Lecture | undefined;

  // ⚠ UNE ERREUR TECHNIQUE N'EST PAS UN LIEN INVALIDE. Les confondre enverrait
  //   l'informaticien redemander un lien alors que le sien est bon, et le
  //   dirigeant en régénérer un pour rien. On le dit tel quel.
  if (error) {
    console.error("[raccordement] lire_jeton_raccordement :", error);
    return (
      <Coquille>
        <LienInvalide motif="erreur-technique" />
      </Coquille>
    );
  }

  if (!lecture?.valide) {
    return (
      <Coquille>
        <LienInvalide motif={lecture?.motif ?? "inconnu"} />
      </Coquille>
    );
  }

  return (
    <Coquille>
      <ParcoursInformaticien
        jeton={jeton}
        societe={lecture.societe_nom ?? ""}
        dirigeant={lecture.dirigeant_nom ?? ""}
        adresses={lecture.adresses_demandees ?? []}
        mot={lecture.mot_du_dirigeant}
        expireAt={lecture.expire_at}
      />
    </Coquille>
  );
}

/**
 * ⚠ `canevas-app` SANS `vitrine`. C'est un écran de travail pour un
 *   professionnel, pas une page qui vend : il prend la direction artistique à
 *   l'échelle de l'application. Voir docs/DIRECTION-ARTISTIQUE.md.
 */
function Coquille({ children }: { children: React.ReactNode }) {
  return (
    <div className="canevas-app flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface px-5 py-3.5">
        <div className="mx-auto max-w-[780px]">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[780px] flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}
