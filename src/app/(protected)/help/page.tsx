import Link from "next/link";
import { PageHeader, Panel, PanelHeader } from "@/components/ui";

/**
 * Guide d'onboarding / aide — page statique pédagogique.
 */
export default function HelpPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="Aide"
        description="Comment lancer votre première simulation, lire les résultats et rester dans le cadre CNIL."
      />

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="1. Préparer la société" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Rendez-vous dans{" "}
              <Link
                href="/settings/company"
                className="font-medium text-accent-text hover:underline"
              >
                Paramètres
              </Link>{" "}
              pour renseigner le nom de la société, le secteur, les contacts
              responsables et le nom du dirigeant (utilisé dans les gabarits).
            </p>
            <p>
              Choisissez le{" "}
              <strong className="font-medium text-foreground">
                mode résultats
              </strong>{" "}
              : nominatif (suivi par collaborateur) ou anonymisé (agrégats).
              Informez vos équipes via la note d&apos;information proposée, et
              cochez « employés informés » une fois la communication faite.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="2. Importer les employés" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Dans{" "}
              <Link
                href="/employees"
                className="font-medium text-accent-text hover:underline"
              >
                Employés
              </Link>
              , ajoutez manuellement ou importez un fichier (CSV / Excel) avec
              prénom, e-mail et éventuellement téléphone.
            </p>
            <p>
              Seuls les collaborateurs de{" "}
              <em>votre</em> société sont visibles et ciblables (RLS).
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="3. Autoriser le domaine d'envoi" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Pour limiter le spam et la quarantaine, autorisez le domaine
              d&apos;envoi Safentreprise côté Microsoft 365 ou Google Workspace.
              Les étapes détaillées sont dans{" "}
              <Link
                href="/settings/deliverability"
                className="font-medium text-accent-text hover:underline"
              >
                Délivrabilité
              </Link>
              .
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="4. Créer et envoyer une campagne" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Créez une campagne dans{" "}
                <Link
                  href="/campaigns"
                  className="font-medium text-accent-text hover:underline"
                >
                  Campagnes
                </Link>{" "}
                (type de fraude, canal e-mail, collaborateurs).
              </li>
              <li>
                Composez les messages à partir des{" "}
                <Link
                  href="/settings/templates"
                  className="font-medium text-accent-text hover:underline"
                >
                  modèles
                </Link>
                , prévisualisez, validez (jetons de suivi), puis envoyez.
              </li>
              <li>
                Chaque destinataire reçoit un lien de tracking et un lien de
                signalement. Un clic ouvre la page pédagogique + quiz.
              </li>
            </ol>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="5. Interpréter les résultats" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <p>Sur une campagne « envoyée », trois indicateurs principaux :</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="font-medium text-foreground">
                  Taux de clic
                </strong>{" "}
                — collaborateurs piégés (ont ouvert le lien de simulation).
              </li>
              <li>
                <strong className="font-medium text-foreground">
                  Taux de signalement
                </strong>{" "}
                — bons réflexes (prioritaire sur le clic s&apos;ils ont signalé).
              </li>
              <li>
                <strong className="font-medium text-foreground">
                  Quiz complété
                </strong>{" "}
                — part qui a terminé le parcours pédagogique.
              </li>
            </ul>
            <p>
              Vous pouvez ensuite émettre une{" "}
              <Link
                href="/certificates"
                className="font-medium text-accent-text hover:underline"
              >
                attestation PDF
              </Link>{" "}
              pour la conformité interne.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="6. Cadre légal / CNIL" />
          <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
            <p>
              Les simulations de phishing sont possibles sous conditions : finalité
              de sensibilisation, proportionnalité, information préalable des
              salariés, pas de sanction individuelle déguisée, et durée de
              conservation limitée des données.
            </p>
            <p>
              Préférez le mode anonymisé si vous n&apos;avez pas besoin d&apos;un
              suivi nominatif. Documentez l&apos;information des employés
              (modèle dans Paramètres). Safentreprise n&apos;est pas un conseil
              juridique : en cas de doute, consultez votre DPO ou un avocat.
            </p>
            <p>
              Les questions du quiz se gèrent dans{" "}
              <Link
                href="/settings/formations"
                className="font-medium text-accent-text hover:underline"
              >
                Formations
              </Link>
              .
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
