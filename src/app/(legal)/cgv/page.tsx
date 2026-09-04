import type { Metadata } from "next";
import Link from "next/link";
import { Fort, H2, H3, Li, P, Ul } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Conditions générales de vente et d’utilisation — Safentreprise",
  description:
    "Conditions générales de vente et d’utilisation de la plateforme Safentreprise : objet, durée, prix, responsabilité, données personnelles et droit applicable.",
  robots: { index: true, follow: true },
};

/** Lien interne dans le corps du texte juridique. */
function LienInterne({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export default function CgvPage() {
  return (
    <article>
      <header className="border-b border-border pb-8">
        <h1 className="text-[clamp(1.9rem,4vw,2.5rem)] font-extrabold leading-tight tracking-[-0.035em] text-foreground">
          Conditions générales de vente et d’utilisation
        </h1>
        <p className="mt-3 text-[13.5px] text-faint">
          Version 1.1 — en vigueur au 4 septembre 2026
        </p>
      </header>

      <div className="pt-10">
        <H2 id="article-1">Article 1 — Objet et champ d’application</H2>
        <P>
          Les présentes conditions générales (ci-après « CGV ») régissent la
          fourniture par{" "}
          <Fort>
            El Fahim Yacine, entrepreneur individuel (EI) exerçant sous le nom
            commercial Safentreprise
          </Fort>
          , immatriculé au Registre National des Entreprises sous le numéro
          SIREN 999 661 887, dont le siège est situé 43 rue des Chantiers,
          78000 Versailles (ci-après « le Prestataire »), de la plateforme
          logicielle Safentreprise et des prestations associées, au bénéfice de
          toute personne morale agissant à des fins professionnelles (ci-après
          « le Client »).
        </P>
        <P>
          Le service est destiné <Fort>exclusivement aux professionnels</Fort>.
          Il n’est pas proposé aux consommateurs au sens du Code de la
          consommation.
        </P>
        <P>
          Toute commande emporte acceptation pleine et entière des présentes
          CGV, qui prévalent sur tout document contraire émanant du Client,
          notamment ses conditions générales d’achat, quelles qu’en soient les
          stipulations.
        </P>

        <H2 id="article-2">Article 2 — Définitions</H2>
        <P>
          <Fort>Plateforme</Fort> : la solution logicielle en ligne
          Safentreprise, accessible par navigateur.
        </P>
        <P>
          <Fort>Surveillance</Fort> : l’analyse automatisée des messages reçus
          dans les Boîtes raccordées et, le cas échéant, l’ajout d’un
          avertissement sur les messages présentant les caractéristiques d’une
          fraude.
        </P>
        <P>
          <Fort>Boîtes raccordées</Fort> : les boîtes aux lettres Microsoft 365
          du Client que celui-ci a expressément désignées comme relevant de la
          Surveillance.
        </P>
        <P>
          <Fort>Collaborateurs</Fort> : les personnes physiques employées par le
          Client ou agissant pour son compte, dont les données sont traitées
          dans le cadre du Service.
        </P>
        <P>
          <Fort>Campagne</Fort> : une opération de simulation d’une tentative de
          fraude adressée aux Collaborateurs à des fins de sensibilisation.
        </P>
        <P>
          <Fort>Audit initial</Fort> : la prestation de diagnostic réalisée au
          démarrage, telle que décrite à l’article 4.
        </P>
        <P>
          <Fort>Service</Fort> : l’ensemble constitué de la Plateforme, des
          Campagnes, des contenus de formation et des prestations associées.
        </P>

        <H2 id="article-3">Article 3 — Documents contractuels</H2>
        <P>
          Le contrat est constitué, par ordre de priorité décroissante :
        </P>
        <ol className="mt-4 space-y-2.5 text-[15px] leading-[1.75] text-muted">
          <li className="relative pl-7">
            <span className="absolute left-0 top-0 font-mono text-[13px] text-accent-text">
              1.
            </span>
            Le devis ou bon de commande signé par le Client
          </li>
          <li className="relative pl-7">
            <span className="absolute left-0 top-0 font-mono text-[13px] text-accent-text">
              2.
            </span>
            Les présentes CGV
          </li>
          <li className="relative pl-7">
            <span className="absolute left-0 top-0 font-mono text-[13px] text-accent-text">
              3.
            </span>
            La Politique de confidentialité et de protection des données
          </li>
        </ol>
        <P>En cas de contradiction, le document de rang supérieur prévaut.</P>

        <H2 id="article-4">Article 4 — Description du Service</H2>

        <H3 id="article-4-1">4.1 Audit initial</H3>
        <P>
          L’Audit initial comprend la cartographie du niveau d’exposition du
          Client, une campagne de simulation de référence, un rapport de
          diagnostic, un plan de réduction du risque, un kit de conformité, le
          paramétrage de la Plateforme et une session de restitution.
        </P>
        <P>
          Il est réalisé dans un délai de trente (30) jours ouvrés à compter de
          la mise à disposition par le Client de l’ensemble des éléments
          nécessaires.
        </P>

        <H3 id="article-4-2">4.2 Abonnement</H3>
        <P>
          L’Abonnement donne accès, pendant sa durée, à la Plateforme, à la
          Surveillance décrite au point 4.3, aux Campagnes récurrentes, aux
          modules de formation, au score de risque, aux tableaux de bord et aux
          attestations.
        </P>
        <P>
          Le périmètre de l’offre souscrite (Essentiel, Business ou Entreprise)
          est déterminé par l’effectif du Client à la date de la commande.
        </P>

        <H3 id="article-4-3">4.3 Surveillance des messages Microsoft 365</H3>
        <P>
          <Fort>Raccordement.</Fort> La Surveillance suppose qu’un
          administrateur Microsoft 365 du Client autorise l’application
          Safentreprise à accéder aux boîtes de son organisation. Cette
          autorisation est donnée par le Client, sur son propre environnement
          Microsoft, et peut être retirée par lui à tout moment. Son retrait
          interrompt la Surveillance.
        </P>
        <P>
          <Fort>Choix des Boîtes.</Fort> Le Client désigne les Boîtes
          raccordées. La Surveillance ne porte que sur elles, et uniquement sur
          les messages <Fort>reçus</Fort> dans leur boîte de réception. Les
          messages envoyés ne sont pas analysés.
        </P>
        <P>
          <Fort>Restriction préalable.</Fort> Les autorisations délivrées par
          Microsoft portent, par construction, sur l’ensemble des boîtes du
          Client. Le Client doit donc restreindre l’accès de l’application aux
          seules Boîtes raccordées, au moyen du script que le Prestataire lui
          fournit. <Fort>Tant que cette restriction n’a pas été constatée par
          le Prestataire, aucun message n’est analysé et la Surveillance ne
          démarre pas.</Fort>
        </P>
        <P>
          <Fort>Ce qui est examiné.</Fort> Pour chaque message reçu dans une
          Boîte raccordée, le Service examine l’expéditeur, l’objet, les
          destinataires, la date de réception et le corps du message. Les pièces
          jointes ne sont ni téléchargées, ni examinées, ni conservées.
        </P>
        <P>
          <Fort>Modification des messages signalés.</Fort> Lorsqu’un message
          présente les caractéristiques d’une fraude, le Service{" "}
          <Fort>modifie ce message dans la boîte du destinataire</Fort> : un
          avertissement est inséré en tête du corps et une catégorie de couleur
          est posée. Le message d’origine n’est ni supprimé ni déplacé ; il
          figure sous l’avertissement. Un message reçu au format texte simple
          est converti au format HTML à cette occasion.
        </P>
        <P>
          <Fort>Réversibilité.</Fort> Cette modification peut être défaite, par
          deux moyens : la copie du corps d’origine, conservée trente (30) jours
          au plus, qui permet de rétablir le message à l’identique ; et, à
          défaut, le retrait de l’avertissement, encadré par des repères
          techniques prévus à cet effet.{" "}
          <Fort>
            Au-delà de trente jours, un message reçu au format texte simple
            conserve le format HTML issu de la conversion, sa mise en forme
            pouvant différer de l’original.
          </Fort>
        </P>
        <P>
          <Fort>Limites de la détection.</Fort> La Surveillance repose sur des
          règles d’analyse automatisées. Elle peut signaler un message légitime
          (faux positif) ou ne pas signaler un message frauduleux (faux
          négatif). Elle ne constitue ni un antivirus, ni un filtre
          anti-pourriel, ni un dispositif de contrôle de l’activité des
          Collaborateurs, et ne produit aucun indicateur individuel de
          comportement.
        </P>

        <H3 id="article-4-4">4.4 Évolutions</H3>
        <P>
          Le Prestataire peut faire évoluer les fonctionnalités du Service. Il
          s’interdit toute évolution qui réduirait substantiellement les
          fonctionnalités essentielles souscrites, sauf accord du Client ou
          obligation légale ou technique impérieuse.
        </P>

        <H2 id="article-5">Article 5 — Commande et prise d’effet</H2>
        <P>
          Le contrat prend effet à la date de signature du devis par le Client.
        </P>
        <P>
          L’accès à la Plateforme est ouvert après encaissement du règlement de
          l’Audit initial et communication par le Client des informations
          nécessaires au paramétrage.
        </P>

        <H2 id="article-6">Article 6 — Durée, reconduction et résiliation</H2>

        <H3 id="article-6-1">6.1 Durée</H3>
        <P>
          L’Abonnement est souscrit pour une durée ferme de{" "}
          <Fort>douze (12) mois</Fort> à compter de l’ouverture de l’accès.
        </P>

        <H3 id="article-6-2">6.2 Reconduction</H3>
        <P>
          Il est reconduit tacitement par périodes successives de douze (12)
          mois, sauf dénonciation par l’une des parties notifiée par écrit au
          moins <Fort>deux (2) mois</Fort> avant l’échéance.
        </P>

        <H3 id="article-6-3">6.3 Résiliation pour manquement</H3>
        <P>
          Chaque partie peut résilier le contrat de plein droit en cas de
          manquement grave de l’autre partie à ses obligations, non réparé dans
          un délai de trente (30) jours suivant une mise en demeure restée
          infructueuse.
        </P>
        <P>
          En cas de résiliation aux torts du Client, les sommes dues au titre de
          la période en cours restent exigibles et ne donnent lieu à aucun
          remboursement.
        </P>

        <H3 id="article-6-4">6.4 Absence de droit de rétractation</H3>
        <P>
          Le Client agissant à titre professionnel, aucun droit de rétractation
          n’est applicable.
        </P>

        <H2 id="article-7">Article 7 — Prix, facturation et paiement</H2>

        <H3 id="article-7-1">7.1 Prix</H3>
        <P>
          Les prix sont ceux figurant au devis accepté. Ils sont exprimés en
          euros et hors taxes.
        </P>
        <P>
          TVA non applicable, article 293 B du Code général des impôts. En cas
          de sortie du régime de franchise en base, la TVA au taux en vigueur
          s’ajoutera de plein droit aux prix convenus.
        </P>

        <H3 id="article-7-2">7.2 Modalités</H3>
        <P>
          L’Audit initial est payable{" "}
          <Fort>à la commande, par virement bancaire</Fort>.
        </P>
        <P>
          L’Abonnement est payable{" "}
          <Fort>annuellement d’avance, par prélèvement SEPA</Fort> via le
          prestataire de paiement Stripe. Le Client fournit à cet effet un
          mandat de prélèvement valide et s’engage à en maintenir la validité
          pendant toute la durée du contrat.
        </P>
        <P>
          Un paiement mensuel de l’Abonnement peut être accordé, moyennant une
          majoration de quinze pour cent (15 %).
        </P>

        <H3 id="article-7-3">7.3 Retard de paiement</H3>
        <P>
          Toute somme non réglée à échéance entraîne de plein droit, sans mise
          en demeure préalable :
        </P>
        <Ul>
          <Li>
            des pénalités de retard au taux de{" "}
            <Fort>trois fois le taux d’intérêt légal</Fort> en vigueur ;
          </Li>
          <Li>
            une indemnité forfaitaire pour frais de recouvrement de{" "}
            <Fort>quarante (40) euros</Fort>, conformément aux articles L.441-10
            et D.441-5 du Code de commerce, sans préjudice d’une indemnisation
            complémentaire sur justificatifs ;
          </Li>
          <Li>
            la faculté pour le Prestataire de suspendre l’accès au Service dans
            les conditions de l’article 12.
          </Li>
        </Ul>

        <H3 id="article-7-4">7.4 Révision</H3>
        <P>
          Les prix peuvent être révisés à chaque échéance annuelle, sous réserve
          d’une information écrite du Client au moins{" "}
          <Fort>trois (3) mois</Fort> avant la date de reconduction. À défaut
          d’acceptation, le Client peut résilier à l’échéance sans pénalité.
        </P>

        <H3 id="article-7-5">7.5 Variation d’effectif</H3>
        <P>
          Le passage à une offre supérieure du fait d’une évolution de
          l’effectif du Client prend effet à la date anniversaire du contrat.
        </P>

        {/* ====================================================================
            ⚠ ARTICLE 8 — À FAIRE VALIDER PAR UN JURISTE. TEXTE NON MODIFIÉ.

            Cet article a été rédigé pour un produit de simulation de phishing.
            Le Service modifie désormais le courrier reçu des Collaborateurs,
            de façon potentiellement définitive au-delà de trente jours, et
            promet de détecter la fraude. La formulation de l'obligation de
            moyens n'a pas été revue à l'aune de ce risque : elle peut être
            insuffisante, et je ne suis pas en mesure d'en juger.

            Voir docs/CGV-A-VALIDER.md
            ==================================================================== */}
        <H2 id="article-8">Article 8 — Nature de l’engagement</H2>
        <P>
          Le Service a pour objet de réduire l’exposition du Client au risque de
          fraude par la sensibilisation, la formation et la détection de
          tentatives d’usurpation. Il ne constitue ni une garantie contre la
          fraude, ni un dispositif de sécurité infaillible.
        </P>
        <P>
          Le Prestataire s’engage à exécuter le Service avec le soin et la
          diligence d’un professionnel de son secteur.{" "}
          <Fort>
            Il est tenu d’une obligation de moyens et non d’une obligation de
            résultat.
          </Fort>{" "}
          Il ne garantit ni l’absence de tentative de fraude visant le Client,
          ni l’absence de succès d’une telle tentative, ni l’atteinte d’un
          niveau déterminé de vigilance des Collaborateurs.
        </P>
        <P>
          Le Client reconnaît expressément que l’efficacité du dispositif dépend
          de facteurs qu’il maîtrise seul, notamment le comportement individuel
          de ses Collaborateurs, ses procédures internes de validation des
          paiements et de vérification des coordonnées bancaires, ses
          délégations de signature, ainsi que les suites qu’il donne aux
          recommandations issues des rapports.
        </P>
        <P>
          <Fort>
            En conséquence, la responsabilité du Prestataire ne saurait être
            engagée à raison d’une fraude subie par le Client, quelle qu’en soit
            l’origine
          </Fort>
          , et notamment lorsqu’elle résulte du comportement d’un Collaborateur,
          d’une défaillance des procédures internes du Client, ou d’un mode
          opératoire non couvert par le Service.
        </P>
        <P>
          Le Prestataire s’engage à mettre en œuvre les mesures techniques et
          organisationnelles décrites dans la Politique de confidentialité, et à
          informer le Client dans les meilleurs délais de tout incident
          significatif affectant le Service.
        </P>

        <H2 id="article-9">Article 9 — Obligations du Client</H2>
        <P>Le Client est seul responsable :</P>
        <P>
          <Fort>De l’information préalable de ses Collaborateurs.</Fort> Le
          Client garantit avoir informé ses Collaborateurs de l’existence du
          dispositif de sensibilisation, préalablement à toute Campagne, et{" "}
          <Fort>
            de la Surveillance de leurs messages entrants, préalablement au
            raccordement de leur Boîte
          </Fort>
          , en précisant que les messages signalés seront modifiés dans leur
          boîte. Cette information est due conformément aux articles 12 et 13 du
          RGPD et à l’article L.1222-4 du Code du travail. Le Client garantit
          également avoir procédé, le cas échéant, à l’information et à la
          consultation de son comité social et économique. Le Prestataire
          fournit sur demande un texte type ; sa transmission ne décharge pas le
          Client de cette obligation.
        </P>
        <P>
          <Fort>Du raccordement Microsoft 365.</Fort> Le Client garantit que
          l’autorisation d’accès est donnée par une personne habilitée à
          engager son organisation, et qu’il dispose des droits nécessaires sur
          les Boîtes qu’il désigne.
        </P>
        <P>
          <Fort>De la restriction des accès.</Fort> Le Client fait exécuter, par
          son administrateur Microsoft, la restriction limitant l’accès de
          l’application aux seules Boîtes raccordées. Il reconnaît qu’en
          l’absence de cette restriction, les autorisations délivrées par
          Microsoft portent sur l’ensemble des boîtes de son organisation, et
          que la Surveillance ne démarre pas tant que le Prestataire n’a pas
          constaté cette restriction.
        </P>
        <P>
          <Fort>De la vérification des messages signalés.</Fort> Un
          avertissement posé par le Service est une alerte, non une décision. Le
          Client demeure seul responsable des suites qu’il donne à un message
          signalé comme à un message non signalé, notamment de la vérification
          de toute demande de virement ou de changement de coordonnées
          bancaires par un canal indépendant du message reçu.
        </P>
        <P>
          <Fort>De sa qualité de responsable de traitement</Fort> au sens du
          RGPD s’agissant des données de ses Collaborateurs, et du respect des
          obligations en découlant.
        </P>
        <P>
          <Fort>De l’exactitude des données</Fort> qu’il communique, notamment
          la liste et les coordonnées de ses Collaborateurs.
        </P>
        <P>
          <Fort>De la sécurité des accès</Fort> attribués à ses utilisateurs, de
          la confidentialité des identifiants et de tout usage effectué au moyen
          de ceux-ci.
        </P>
        <P>
          <Fort>Des suites données aux résultats.</Fort> Le Client détermine
          seul l’usage qu’il fait des scores et rapports, notamment le caractère
          nominatif ou anonymisé de leur exploitation, et assume les
          conséquences de ce choix à l’égard de ses Collaborateurs.
        </P>
        <P>
          Le Client s’interdit d’utiliser le Service à des fins autres que la
          sensibilisation et la protection de ses propres Collaborateurs, et
          notamment d’adresser des Campagnes à des personnes extérieures à son
          organisation.
        </P>
        <P>
          <Fort>
            Le Client garantit le Prestataire contre toute réclamation, action
            ou condamnation résultant d’un manquement à l’une des obligations du
            présent article
          </Fort>
          , notamment de toute action engagée par un Collaborateur qui n’aurait
          pas été préalablement informé.
        </P>

        <H2 id="article-10">Article 10 — Disponibilité</H2>
        <P>
          Le Prestataire met en œuvre les moyens raisonnables pour assurer
          l’accessibilité de la Plateforme, sans garantie de disponibilité
          continue.
        </P>
        <P>
          L’accès peut être interrompu pour maintenance, mise à jour, ou en
          raison de faits extérieurs, notamment une défaillance des prestataires
          d’hébergement, d’acheminement de messages ou de réseau.
        </P>
        <P>
          Aucun engagement de niveau de service (SLA) n’est souscrit en
          l’absence de stipulation expresse au devis.
        </P>

        {/* ====================================================================
            ⚠ ARTICLE 11 — À FAIRE VALIDER PAR UN JURISTE. TEXTE NON MODIFIÉ.

            Le plafond de responsabilité a été calibré pour de la simulation de
            phishing. Le Service peut aujourd'hui dégrader durablement le
            courrier professionnel d'un tiers — un fournisseur légitime marqué
            à tort — et un faux négatif peut coûter au Client le montant d'un
            virement frauduleux. Ni le plafond ni les exclusions n'ont été
            revus pour ces deux risques.

            Voir docs/CGV-A-VALIDER.md
            ==================================================================== */}
        <H2 id="article-11">Article 11 — Limitation de responsabilité</H2>

        <H3 id="article-11-1">11.1 Étendue</H3>
        <P>
          La responsabilité du Prestataire ne peut être engagée qu’en cas de
          faute prouvée et pour les seuls dommages directs et prévisibles.
        </P>

        <H3 id="article-11-2">11.2 Exclusions</H3>
        <P>
          Sont expressément exclus de toute indemnisation les dommages
          indirects, et notamment : pertes financières résultant d’une fraude
          effectivement subie, pertes d’exploitation, pertes de chiffre
          d’affaires, de marge, de clientèle, de données, atteinte à l’image ou
          à la réputation, préjudice commercial, ainsi que les réclamations de
          tiers.
        </P>

        <H3 id="article-11-3">11.3 Plafond</H3>
        <P>
          En tout état de cause, la responsabilité totale et cumulée du
          Prestataire, toutes causes confondues, est{" "}
          <Fort>
            plafonnée au montant hors taxes des sommes effectivement versées par
            le Client au cours des douze (12) mois précédant le fait générateur
          </Fort>
          .
        </P>

        <H3 id="article-11-4">11.4 Limites légales</H3>
        <P>
          Les stipulations du présent article ne s’appliquent pas en cas de
          faute lourde ou dolosive du Prestataire, ni dans les cas où la loi
          interdit une telle limitation.
        </P>

        <H3 id="article-11-5">11.5 Prescription</H3>
        <P>
          Toute action fondée sur le contrat doit être engagée dans un délai de{" "}
          <Fort>douze (12) mois</Fort> à compter de la survenance du fait
          générateur, à peine de forclusion.
        </P>

        <H2 id="article-12">Article 12 — Suspension</H2>
        <P>
          Le Prestataire peut suspendre l’accès au Service, après notification
          écrite restée sans effet pendant quinze (15) jours :
        </P>
        <Ul>
          <Li>en cas de non-paiement d’une somme échue ;</Li>
          <Li>
            en cas d’usage du Service contraire aux présentes CGV ou à la
            réglementation ;
          </Li>
          <Li>
            en cas de risque avéré pour la sécurité de la Plateforme ou des
            autres clients.
          </Li>
        </Ul>
        <P>La suspension ne suspend pas l’exigibilité des sommes dues.</P>

        <H2 id="article-13">Article 13 — Force majeure</H2>
        <P>
          Aucune partie ne peut être tenue responsable d’un manquement résultant
          d’un événement de force majeure au sens de l’article 1218 du Code
          civil.
        </P>
        <P>
          Si l’événement se prolonge au-delà de soixante (60) jours, chaque
          partie peut résilier le contrat par notification écrite, sans
          indemnité.
        </P>

        <H2 id="article-14">Article 14 — Propriété intellectuelle</H2>
        <P>
          La Plateforme, le code source, les contenus pédagogiques,
          les gabarits de Campagne, les interfaces, la documentation et la
          marque Safentreprise demeurent la propriété exclusive du Prestataire.
        </P>
        <P>
          Le Client bénéficie, pendant la durée du contrat, d’un{" "}
          <Fort>
            droit d’usage personnel, non exclusif, non cessible et non
            transférable
          </Fort>
          , limité à ses besoins internes.
        </P>
        <P>
          Le Client s’interdit toute reproduction, adaptation, décompilation,
          ingénierie inverse, extraction de la base de données, ainsi que toute
          mise à disposition du Service au bénéfice d’un tiers.
        </P>
        <P>Les données transmises par le Client demeurent sa propriété.</P>

        {/* ====================================================================
            ⚠ ARTICLE 15 — À FAIRE VALIDER PAR UN JURISTE. TEXTE NON MODIFIÉ.

            Il affirme que la Politique de confidentialité « vaut accord de
            sous-traitance au sens de l'article 28 du RGPD ». C'est une
            qualification juridique, pas un fait technique : l'article 28 exige
            des clauses précises (durée, nature, sous-traitants ultérieurs,
            assistance, sort des données en fin de contrat, audit) dont la
            présence dans la Politique n'a pas été vérifiée par un juriste.
            L'AIPD conclut d'ailleurs que le contrat de sous-traitance manque.

            Voir docs/CGV-A-VALIDER.md
            ==================================================================== */}
        <H2 id="article-15">Article 15 — Données personnelles</H2>
        <P>
          Le traitement des données personnelles est régi par la{" "}
          <LienInterne href="/politique-de-confidentialite">
            Politique de confidentialité
          </LienInterne>
          , qui fait partie intégrante du contrat et qui vaut accord de
          sous-traitance au sens de l’article 28 du RGPD.
        </P>
        <P>
          Le Client agit en qualité de responsable de traitement s’agissant des
          données de ses Collaborateurs ; le Prestataire agit en qualité de
          sous-traitant et ne traite ces données que sur instruction documentée
          du Client.
        </P>

        <H2 id="article-16">Article 16 — Confidentialité</H2>
        <P>
          Chaque partie s’engage à préserver la confidentialité des informations
          reçues de l’autre à l’occasion de l’exécution du contrat, pendant
          toute sa durée et <Fort>trois (3) ans</Fort> après son terme.
        </P>
        <P>
          Sont exclues les informations publiques, celles déjà connues de la
          partie réceptrice, et celles dont la divulgation est requise par la
          loi ou une autorité compétente.
        </P>

        <H2 id="article-17">Article 17 — Références commerciales</H2>
        <P>
          Sauf opposition écrite du Client, le Prestataire est autorisé à
          mentionner le nom et le logo du Client parmi ses références
          commerciales, à l’exclusion de toute donnée relative aux résultats des
          Campagnes ou au niveau de risque, qui demeurent strictement
          confidentiels.
        </P>

        <H2 id="article-18">Article 18 — Fin du contrat et réversibilité</H2>
        <P>À l’expiration du contrat, l’accès à la Plateforme est clos.</P>
        <P>
          Le Client dispose d’un délai de <Fort>trente (30) jours</Fort> pour
          demander l’export de ses données dans un format structuré et
          couramment utilisé. Passé ce délai, les données sont supprimées, sous
          réserve des obligations légales de conservation.
        </P>

        <H2 id="article-19">Article 19 — Modification des CGV</H2>
        <P>
          Le Prestataire peut modifier les présentes CGV. Les Clients en cours
          de contrat en sont informés au moins <Fort>deux (2) mois</Fort> avant
          l’entrée en vigueur des nouvelles conditions.
        </P>
        <P>
          À défaut d’acceptation, le Client peut résilier le contrat à la date
          d’effet de la modification, sans pénalité et avec remboursement au
          prorata des sommes versées d’avance.
        </P>

        <H2 id="article-20">Article 20 — Stipulations diverses</H2>
        <P>
          <Fort>Cession.</Fort> Le contrat ne peut être cédé par le Client sans
          accord écrit préalable du Prestataire.
        </P>
        <P>
          <Fort>Sous-traitance.</Fort> Le Prestataire peut recourir à des
          sous-traitants techniques ; il demeure responsable de leur exécution.
        </P>
        <P>
          <Fort>Nullité partielle.</Fort> Si une stipulation est jugée nulle ou
          inapplicable, les autres demeurent en vigueur.
        </P>
        <P>
          <Fort>Non-renonciation.</Fort> Le fait de ne pas se prévaloir d’un
          manquement ne vaut pas renonciation à s’en prévaloir ultérieurement.
        </P>
        <P>
          <Fort>Indépendance.</Fort> Les parties sont des contractants
          indépendants ; le contrat ne crée aucune société, mandat ou lien de
          subordination.
        </P>

        <H2 id="article-21">Article 21 — Droit applicable et juridiction</H2>
        <P>
          Les présentes CGV sont soumises au <Fort>droit français</Fort>.
        </P>
        <P>
          En cas de litige, les parties s’efforcent de trouver une solution
          amiable. À défaut d’accord dans un délai de trente (30) jours,{" "}
          <Fort>
            compétence exclusive est attribuée au Tribunal de commerce de
            Versailles
          </Fort>
          , y compris en cas de pluralité de défendeurs ou d’appel en garantie.
        </P>
        <P>
          Le Client agissant à titre professionnel, le dispositif de médiation
          de la consommation n’est pas applicable.
        </P>

        {/* Mention de pied de document, reprise du contrat signé. */}
        <footer className="mt-16 border-t border-border pt-6">
          <p className="text-[13px] leading-[1.7] text-faint">
            Safentreprise — El Fahim Yacine (EI) — 43 rue des Chantiers,
            78000 Versailles — SIREN 999 661 887 —{" "}
            <a
              href="mailto:contact@safentreprise.com"
              className="underline decoration-border underline-offset-[3px] transition-colors hover:text-foreground"
            >
              contact@safentreprise.com
            </a>
          </p>
        </footer>
      </div>
    </article>
  );
}
