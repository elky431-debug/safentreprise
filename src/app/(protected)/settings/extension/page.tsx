import { createClient } from "@/lib/supabase/server";
import { ExtensionActivation } from "@/components/settings/ExtensionActivation";
import { PageHeader, Panel, PanelHeader } from "@/components/ui";
import { urlProduction } from "@/lib/extension/config";
import type { Company } from "@/lib/types";

/** Les trois gestes que l'employé effectue une seule fois. */
const ETAPES = [
  {
    n: "01",
    titre: "Installer l'extension",
    texte:
      "Depuis le Chrome Web Store, chaque collaborateur ajoute « Safentreprise Guard » à son navigateur. L'installation prend une dizaine de secondes.",
  },
  {
    n: "02",
    titre: "Coller le code d'activation",
    texte:
      "À la première ouverture, l'extension demande un code. Le collaborateur colle celui de votre société, affiché ci-dessus.",
  },
  {
    n: "03",
    titre: "C'est actif",
    texte:
      "L'extension analyse désormais les messages entrants et affiche une bannière sur les tentatives d'usurpation. Les alertes remontent dans votre onglet Menaces.",
  },
];

/** Page d'activation de l'extension Safentreprise Guard. */
export default async function ExtensionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle<Company>();

  if (!company) {
    return null;
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Extension"
        description="Safentreprise Guard analyse les emails de vos collaborateurs et les prévient avant qu'ils n'agissent sur un message frauduleux."
      />

      <ExtensionActivation codeInitial={company.code_activation} />

      <Panel className="mt-6">
        <PanelHeader
          title="Comment vos collaborateurs l'activent"
          description="Trois étapes, une seule fois par poste."
        />

        <ol className="grid gap-px overflow-hidden bg-border md:grid-cols-3">
          {ETAPES.map((etape) => (
            <li key={etape.n} className="bg-surface px-6 py-6">
              <span className="font-mono text-[12px] text-accent-text">
                {etape.n}
              </span>
              <h3 className="mt-3 text-[15px] font-bold text-foreground">
                {etape.titre}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {etape.texte}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Ce qui remonte — et ce qui ne remonte pas"
          description="L'extension ne transmet aucun contenu de message."
        />

        <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
          <div>
            <p className="text-[12.5px] font-semibold text-foreground">
              Transmis
            </p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
              <li>Nom et adresse de l&apos;expéditeur</li>
              <li>Nom signé dans le message</li>
              <li>Objet du message</li>
              <li>Niveau de risque, score et signaux relevés</li>
              <li>Adresse du collaborateur alerté, date de détection</li>
            </ul>
          </div>

          <div>
            <p className="text-[12.5px] font-semibold text-foreground">
              Jamais transmis
            </p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
              <li>Le corps du message, même partiellement</li>
              <li>Les pièces jointes</li>
              <li>Les en-têtes techniques bruts</li>
              <li>Les messages jugés sans risque</li>
            </ul>
          </div>
        </div>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Pour votre intégrateur"
          description="Points d'entrée appelés par l'extension. Le code d'activation voyage dans le corps de la requête, jamais dans l'URL."
        />

        <dl className="space-y-4 px-6 py-5 text-[13px]">
          <div>
            <dt className="text-muted">Vérification du code</dt>
            <dd className="mt-1.5 break-all font-mono text-[12.5px] text-foreground">
              POST {urlProduction("verifierCode")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Remontée d&apos;une menace</dt>
            <dd className="mt-1.5 break-all font-mono text-[12.5px] text-foreground">
              POST {urlProduction("menace")}
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
