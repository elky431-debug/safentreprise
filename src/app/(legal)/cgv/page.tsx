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
          Version 1.0 — en vigueur au 19 août 2026
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
          Safentreprise, accessible par navigateur, ainsi que l’extension
          navigateur associée.
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
          L’Abonnement donne accès, pendant sa durée, à la Plateforme, à
          l’extension navigateur, aux Campagnes récurrentes, aux modules de
          formation, au score de risque, aux tableaux de bord et aux
          attestations.
        </P>
        <P>
          Le périmètre de l’offre souscrite (Essentiel, Business ou Entreprise)
          est déterminé par l’effectif du Client à la date de la commande.
        </P>

        <H3 id="article-4-3">4.3 Évolutions</H3>
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

        <H2 id="article-8">
          Article 8 — Obligations et engagements du Prestataire
        </H2>
        <P>
          Le Prestataire s’engage à exécuter le Service avec le soin et la
          diligence d’un professionnel de son secteur.
        </P>
        <P>
          <Fort>
            Le Prestataire est tenu d’une obligation de moyens et non d’une
            obligation de résultat.
          </Fort>{" "}
          Il ne garantit ni l’absence de tentative de fraude visant le Client,
          ni l’absence de succès d’une telle tentative, ni l’atteinte d’un
          niveau déterminé de vigilance des Collaborateurs.
        </P>
        <P>
          Il s’engage à mettre en œuvre les mesures techniques et
          organisationnelles décrites dans la Politique de confidentialité, et à
          informer le Client dans les meilleurs délais de tout incident
          significatif affectant le Service.
        </P>

        <H2 id="article-9">Article 9 — Obligations du Client</H2>
        <P>Le Client est seul responsable :</P>
        <P>
          <Fort>De l’information préalable de ses Collaborateurs.</Fort> Le
          Client garantit avoir informé ses Collaborateurs de l’existence du
          dispositif de sensibilisation, préalablement à toute Campagne,
          conformément aux articles 12 et 13 du RGPD et à l’article L.1222-4 du
          Code du travail. Il garantit également avoir procédé, le cas échéant,
          à l’information et à la consultation de son comité social et
          économique.
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
          La Plateforme, l’extension, le code source, les contenus pédagogiques,
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
