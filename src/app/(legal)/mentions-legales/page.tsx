import type { Metadata } from "next";
import Link from "next/link";
import {
  Coordonnees,
  Fort,
  H2,
  LienExterne,
  P,
} from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Mentions légales — Safentreprise",
  description:
    "Éditeur, hébergement, propriété intellectuelle et responsabilité de la plateforme Safentreprise, service de sensibilisation à la fraude au virement.",
  robots: { index: true, follow: true },
};

export default function MentionsLegalesPage() {
  return (
    <article>
      <header className="border-b border-border pb-8">
        <h1 className="text-[clamp(1.9rem,4vw,2.5rem)] font-extrabold leading-tight tracking-[-0.035em] text-foreground">
          Mentions légales
        </h1>
        <p className="mt-3 text-[13.5px] text-faint">
          Dernière mise à jour : 18 août 2026
        </p>
      </header>

      <div className="pt-10">
        <H2 id="editeur">1. Éditeur du site</H2>
        <P>Le site safentreprise.com est édité par :</P>
        <P>
          <Fort>El Fahim Yacine</Fort>, entrepreneur individuel exerçant sous le
          nom commercial <Fort>Safentreprise</Fort>
        </P>

        <Coordonnees>
          <p>Adresse : 43 rue des Chantiers, 78000 Versailles, France</p>
          <p>SIREN : 999 661 887</p>
          <p>SIRET (établissement principal) : 999 661 887 00011</p>
          <p>
            Immatriculation au Registre National des Entreprises (RNE) :
            12 janvier 2026
          </p>
          <p>
            TVA : TVA non applicable, article 293 B du Code général des impôts
            (franchise en base)
          </p>
          <p>
            Adresse électronique :{" "}
            <a
              href="mailto:contact@safentreprise.com"
              className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
            >
              contact@safentreprise.com
            </a>
          </p>
          <p>Téléphone : +33 6 37 11 40 68</p>
        </Coordonnees>

        <P>
          Directeur de la publication : <Fort>Yacine El Fahim</Fort>
        </P>

        <H2 id="hebergement">2. Hébergement</H2>

        <Coordonnees>
          <p>
            <span className="font-medium text-foreground">
              Site web et application
            </span>
            <br />
            Netlify, Inc. — [ADRESSE_NETLIFY_A_VERIFIER]
            <br />
            <LienExterne href="https://www.netlify.com">
              https://www.netlify.com
            </LienExterne>
          </p>

          <p className="mt-4">
            <span className="font-medium text-foreground">Base de données</span>
            <br />
            Supabase — infrastructure hébergée dans l&apos;Union européenne
            (Amazon Web Services, région Europe)
            <br />
            <LienExterne href="https://supabase.com">
              https://supabase.com
            </LienExterne>
          </p>

          <p className="mt-4">
            <span className="font-medium text-foreground">
              Service d&apos;envoi d&apos;e-mails
            </span>
            <br />
            Resend, Inc. — États-Unis
            <br />
            <LienExterne href="https://resend.com">
              https://resend.com
            </LienExterne>
          </p>

          <p className="mt-4">
            <span className="font-medium text-foreground">
              Messagerie professionnelle
            </span>
            <br />
            Zoho Corporation — données hébergées dans l&apos;Union européenne
            <br />
            <LienExterne href="https://www.zoho.com">
              https://www.zoho.com
            </LienExterne>
          </p>
        </Coordonnees>

        <H2 id="propriete-intellectuelle">3. Propriété intellectuelle</H2>
        <P>
          L’ensemble des éléments composant le site et la plateforme
          Safentreprise — structure, code source, textes, contenus pédagogiques,
          gabarits de campagnes, interfaces, graphismes, logos, base de données —
          est protégé par le droit de la propriété intellectuelle et demeure la
          propriété exclusive de l’éditeur.
        </P>
        <P>
          Toute reproduction, représentation, adaptation, extraction ou
          réutilisation, totale ou partielle, par quelque procédé que ce soit et
          sur quelque support que ce soit, sans autorisation écrite préalable de
          l’éditeur, est interdite et constituerait une contrefaçon sanctionnée
          par les articles L.335-2 et suivants du Code de la propriété
          intellectuelle.
        </P>
        <P>
          L’accès à la plateforme dans le cadre d’un abonnement confère un droit
          d’usage personnel, non exclusif et non cessible, limité à la durée de
          l’abonnement.
        </P>
        <P>
          Les marques et logos de tiers éventuellement reproduits dans les
          contenus pédagogiques ou les gabarits de simulation le sont à des fins
          strictement illustratives et pédagogiques, sans intention de créer une
          confusion ni de porter atteinte aux droits de leurs titulaires.
        </P>

        <H2 id="nature-du-service">4. Nature du service</H2>
        <P>
          Safentreprise est une plateforme logicielle en ligne (SaaS), complétée
          par une extension pour navigateur, destinée à sensibiliser et protéger
          les entreprises contre les tentatives de fraude et les risques de
          cybersécurité.
        </P>
        <P>
          Le service comprend notamment la simulation de campagnes de test
          auprès des collaborateurs de l’entreprise cliente, le suivi des
          interactions, la formation, ainsi que la production de rapports et
          d’attestations.
        </P>
        <P>
          Ces simulations sont réalisées à la demande et sous la responsabilité
          de l’entreprise cliente, laquelle demeure seule responsable de
          l’information préalable de ses collaborateurs et du respect des
          obligations qui lui incombent en droit du travail et en matière de
          protection des données personnelles.
        </P>
        <P>
          Les attestations et rapports délivrés par la plateforme constituent
          des éléments de preuve de la réalisation d’actions de sensibilisation.
          Ils ne valent ni certification, ni audit de sécurité, ni garantie
          d’absence de risque.
        </P>

        <H2 id="responsabilite">5. Limitation de responsabilité</H2>
        <P>
          L’éditeur met en œuvre les moyens raisonnables pour assurer
          l’exactitude des informations diffusées et la disponibilité du
          service, sans garantie d’exhaustivité ni de continuité absolue.
        </P>
        <P>
          L’éditeur ne saurait être tenu responsable des dommages résultant
          d’une utilisation du service non conforme à sa destination ou aux
          conditions générales, d’une indisponibilité temporaire liée à la
          maintenance ou à un fait extérieur, ou de la survenance d’une fraude
          réelle affectant l’entreprise cliente, le service ayant une finalité
          de sensibilisation et de réduction du risque, et non de garantie
          contre celui-ci.
        </P>

        <H2 id="donnees-personnelles">6. Données personnelles</H2>
        <P>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link
            href="/politique-de-confidentialite"
            className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
          >
            Politique de confidentialité
          </Link>
          .
        </P>

        <H2 id="liens-hypertextes">7. Liens hypertextes</H2>
        <P>
          Le site peut contenir des liens vers des sites tiers. L’éditeur
          n’exerce aucun contrôle sur leur contenu et décline toute
          responsabilité à leur égard.
        </P>

        <H2 id="droit-applicable">8. Droit applicable</H2>
        <P>
          Les présentes mentions légales sont soumises au droit français. En cas
          de litige, et à défaut de résolution amiable, compétence est attribuée
          aux tribunaux compétents dans les conditions du droit commun.
        </P>
        <P>
          Le service étant destiné exclusivement aux professionnels, le
          dispositif de médiation de la consommation prévu aux articles L.611-1
          et suivants du Code de la consommation n’est pas applicable.
        </P>
      </div>
    </article>
  );
}
