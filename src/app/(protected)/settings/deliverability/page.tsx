import { PageHeader, Panel, PanelHeader } from "@/components/ui";

/**
 * Instructions pour autoriser le domaine d'envoi des simulations
 * (Microsoft 365 et Google Workspace).
 */
export default function DeliverabilityPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="Délivrabilité"
        description="Pour que les messages de simulation arrivent en boîte de réception — et non en spam — autorisez le domaine d'envoi Safentreprise."
      />

      <Panel>
        <PanelHeader
          title="Pourquoi autoriser le domaine ?"
          description="Les simulations partent d'un domaine dédié Safentreprise (configuré plus tard), tout en affichant le nom d'un expéditeur imité (dirigeant, fournisseur…). Sans allowlist, les filtres anti-spam peuvent bloquer ou mettre en quarantaine ces messages."
        />
        <div className="space-y-3 px-6 py-5 text-[13.5px] leading-relaxed text-muted">
          <p>
            Domaine d&apos;envoi à autoriser (placeholder — à remplacer lors de
            la configuration SMTP)&nbsp;:{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
              mail.safentreprise.com
            </code>
          </p>
          <p>
            Adresse technique d&apos;expédition&nbsp;:{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
              simulations@mail.safentreprise.com
            </code>
          </p>
        </div>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Microsoft 365 — liste d'expéditeurs autorisés" />
        <ol className="list-decimal space-y-3 px-6 py-5 pl-10 text-[13.5px] leading-relaxed text-muted">
          <li>
            Connectez-vous au{" "}
            <strong className="font-medium text-foreground">
              Centre d&apos;administration Microsoft 365
            </strong>{" "}
            avec un compte administrateur.
          </li>
          <li>
            Ouvrez{" "}
            <strong className="font-medium text-foreground">
              Exchange
            </strong>{" "}
            →{" "}
            <strong className="font-medium text-foreground">
              Flux de courrier
            </strong>{" "}
            →{" "}
            <strong className="font-medium text-foreground">Règles</strong>.
          </li>
          <li>
            Créez une règle&nbsp;: «&nbsp;Si le message est reçu de…&nbsp;» →
            domaine{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-[12.5px] text-foreground">
              mail.safentreprise.com
            </code>
            .
          </li>
          <li>
            Action&nbsp;:{" "}
            <strong className="font-medium text-foreground">
              Définir le SCL à -1
            </strong>{" "}
            (contourne le filtrage spam) ou «&nbsp;Modifier le niveau de
            confiance du spam&nbsp;».
          </li>
          <li>
            Alternative via{" "}
            <strong className="font-medium text-foreground">
              Protection contre les menaces
            </strong>{" "}
            → Anti-spam → Liste d&apos;autorisation → ajoutez le domaine
            d&apos;envoi.
          </li>
          <li>
            Propager les changements (jusqu&apos;à 30 minutes) puis testez avec
            une campagne brouillon sur un compte interne.
          </li>
        </ol>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Google Workspace — liste d'expéditeurs autorisés" />
        <ol className="list-decimal space-y-3 px-6 py-5 pl-10 text-[13.5px] leading-relaxed text-muted">
          <li>
            Ouvrez la{" "}
            <strong className="font-medium text-foreground">
              console d&apos;administration Google
            </strong>{" "}
            (admin.google.com).
          </li>
          <li>
            Allez dans{" "}
            <strong className="font-medium text-foreground">
              Applications
            </strong>{" "}
            →{" "}
            <strong className="font-medium text-foreground">
              Google Workspace
            </strong>{" "}
            →{" "}
            <strong className="font-medium text-foreground">Gmail</strong> →{" "}
            <strong className="font-medium text-foreground">
              Conformité
            </strong>{" "}
            ou{" "}
            <strong className="font-medium text-foreground">
              Spam, phishing et logiciels malveillants
            </strong>
            .
          </li>
          <li>
            Section{" "}
            <strong className="font-medium text-foreground">
              Liste d&apos;autorisation des e-mails
            </strong>{" "}
            (Email allowlist)&nbsp;: ajoutez{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-[12.5px] text-foreground">
              mail.safentreprise.com
            </code>
            .
          </li>
          <li>
            Option complémentaire&nbsp;: créez une règle de routage / conformité
            qui marque les messages provenant de ce domaine comme internes ou
            qui contourne le dossier Spam.
          </li>
          <li>
            Enregistrez, attendez la propagation, puis validez avec un compte
            Gmail Workspace de test.
          </li>
        </ol>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Bonnes pratiques" />
        <ul className="list-disc space-y-2 px-6 py-5 pl-10 text-[13.5px] leading-relaxed text-muted">
          <li>
            Informez vos collaborateurs que des simulations consenties peuvent
            arriver — sans révéler les dates exactes.
          </li>
          <li>
            Ne placez jamais le domaine Safentreprise en liste noire côté
            firewall ou passerelle (Mimecast, Proofpoint, etc.).
          </li>
          <li>
            L&apos;envoi réel n&apos;est pas encore activé dans l&apos;application&nbsp;:
            cette page prépare uniquement la configuration IT.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
