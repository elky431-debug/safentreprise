import type { Metadata } from "next";
import {
  Coordonnees,
  Encadre,
  Fort,
  H2,
  H3,
  Li,
  LienExterne,
  P,
  Tableau,
  Ul,
} from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Safentreprise",
  description:
    "Traitement des données personnelles par Safentreprise : rôles de responsable de traitement et de sous-traitant, finalités, durées de conservation, sous-traitants et exercice des droits.",
  robots: { index: true, follow: true },
};

export default function PolitiqueConfidentialitePage() {
  return (
    <article>
      <header className="border-b border-border pb-8">
        <h1 className="text-[clamp(1.75rem,3.6vw,2.35rem)] font-extrabold leading-tight tracking-[-0.035em] text-foreground">
          Politique de confidentialité et de protection des données personnelles
        </h1>
        <p className="mt-3 text-[13.5px] text-faint">
          Dernière mise à jour : 18 août 2026
        </p>
      </header>

      <div className="pt-10">
        <H2 id="preambule">Préambule — deux rôles distincts</H2>
        <P>
          Safentreprise intervient à deux titres différents au sens du Règlement
          (UE) 2016/679 (RGPD). Cette distinction détermine les responsabilités
          de chacun.
        </P>
        <P>
          <Fort>Responsable de traitement</Fort> — pour les données que
          Safentreprise collecte pour son propre compte : visiteurs du site,
          prospects, comptes des utilisateurs de la plateforme, facturation.
        </P>
        <P>
          <Fort>Sous-traitant</Fort> — pour les données des collaborateurs de
          l’entreprise cliente, traitées uniquement sur instruction de celle-ci
          dans le cadre des campagnes de sensibilisation. Dans ce cas,
          l’entreprise cliente est le responsable de traitement ; elle détermine
          les finalités et les moyens, et assume les obligations
          correspondantes.
        </P>

        {/* ------------------------------------------------------------------ */}

        <H2 id="partie-1">PARTIE 1 — Safentreprise responsable de traitement</H2>

        <H3 id="identite">1.1 Identité du responsable</H3>
        <Coordonnees>
          <p>
            El Fahim Yacine, entrepreneur individuel exerçant sous le nom
            commercial Safentreprise
          </p>
          <p>43 rue des Chantiers, 78000 Versailles, France</p>
          <p>SIREN 999 661 887</p>
          <p>
            Contact :{" "}
            <a
              href="mailto:contact@safentreprise.com"
              className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
            >
              contact@safentreprise.com
            </a>
          </p>
        </Coordonnees>
        <P>
          Compte tenu de la nature et du volume des traitements, la désignation
          d’un délégué à la protection des données (DPO) n’est pas obligatoire.
          Toute question relative aux données personnelles peut être adressée à
          l’adresse ci-dessus.
        </P>

        <H3 id="traitements">1.2 Traitements réalisés</H3>
        <Tableau
          entetes={[
            "Traitement",
            "Données concernées",
            "Base légale",
            "Durée de conservation",
          ]}
          lignes={[
            [
              "Gestion des comptes utilisateurs",
              "Nom, prénom, e-mail, téléphone, entreprise, fonction, identifiants",
              "Exécution du contrat (art. 6.1.b)",
              "Durée du contrat + 3 ans",
            ],
            [
              "Prospection commerciale B2B",
              "Nom, e-mail professionnel, entreprise, fonction",
              "Intérêt légitime (art. 6.1.f)",
              "3 ans à compter du dernier contact",
            ],
            [
              "Facturation et comptabilité",
              "Identité, coordonnées, données de facturation",
              "Obligation légale (art. 6.1.c)",
              "10 ans (art. L.123-22 C. com.)",
            ],
            [
              "Auto-évaluation du risque",
              "Réponses au questionnaire, scores par axe",
              "Exécution du contrat (art. 6.1.b)",
              "Durée du contrat + 1 an",
            ],
            [
              "Support et correspondance",
              "Contenu des échanges, coordonnées",
              "Intérêt légitime (art. 6.1.f)",
              "3 ans",
            ],
            [
              "Mesure d’audience du site",
              "Données de navigation",
              "Consentement (art. 6.1.a) ou exemption CNIL",
              "13 mois maximum",
            ],
          ]}
        />

        <H3 id="destinataires">1.3 Destinataires</H3>
        <P>
          Les données ne font l’objet d’aucune cession, location ni revente à
          des tiers.
        </P>
        <P>
          Elles sont accessibles à l’éditeur et, dans la stricte limite de leurs
          prestations, aux sous-traitants techniques listés au point 3.1.
        </P>

        <H3 id="cookies">1.4 Cookies et traceurs</H3>
        <P>
          Le site utilise des cookies strictement nécessaires à son
          fonctionnement (session, authentification, sécurité), qui ne
          requièrent pas de consentement.
        </P>
        <P>
          Tout cookie de mesure d’audience ou de suivi non exempté fait l’objet
          d’un recueil préalable du consentement, révocable à tout moment. En
          l’absence de consentement, aucun traceur non essentiel n’est déposé.
        </P>

        {/* ------------------------------------------------------------------ */}

        <H2 id="partie-2">PARTIE 2 — Safentreprise sous-traitant</H2>

        <H3 id="perimetre">2.1 Périmètre</H3>
        <P>
          Dans le cadre des campagnes de sensibilisation, Safentreprise traite
          pour le compte de l’entreprise cliente les données de ses
          collaborateurs :
        </P>
        <Ul>
          <Li>
            <Fort>Identité</Fort> : prénom, nom, adresse e-mail professionnelle,
            éventuellement numéro de téléphone professionnel
          </Li>
          <Li>
            <Fort>Données d’interaction</Fort> : réception du message de
            simulation, ouverture, clic, signalement, absence d’action
          </Li>
          <Li>
            <Fort>Données pédagogiques</Fort> : participation au module de
            formation, réponses au quiz, score obtenu
          </Li>
          <Li>
            <Fort>Score de risque individuel</Fort>, calculé à partir des
            comportements observés
          </Li>
        </Ul>

        <H3 id="instructions">2.2 Instructions et finalité</H3>
        <P>
          Ces données sont traitées exclusivement sur instruction documentée de
          l’entreprise cliente, aux seules fins de sensibilisation, de formation
          et de mesure du niveau d’exposition au risque de fraude.
        </P>
        <P>
          Elles ne sont utilisées à aucune autre fin, notamment pas à des fins
          de prospection, de profilage commercial ni d’entraînement de modèles
          d’intelligence artificielle.
        </P>

        <H3 id="obligations-client">2.3 Obligations de l’entreprise cliente</H3>
        <P>
          L’entreprise cliente, en sa qualité de responsable de traitement,
          garantit :
        </P>
        <Ul>
          <Li>
            avoir informé préalablement ses collaborateurs de l’existence du
            dispositif de sensibilisation, conformément aux articles 12 et 13 du
            RGPD et à l’article L.1222-4 du Code du travail, qui interdit de
            collecter des informations sur un salarié par un dispositif qui ne
            lui a pas été porté à connaissance ;
          </Li>
          <Li>
            avoir procédé, le cas échéant, à l’information et à la consultation
            du comité social et économique (CSE) préalablement à la mise en
            place du dispositif, conformément à l’article L.2312-38 du Code du
            travail ;
          </Li>
          <Li>
            avoir inscrit le traitement à son registre des activités de
            traitement ;
          </Li>
          <Li>
            avoir apprécié la nécessité d’une analyse d’impact (AIPD) au regard
            des critères de la CNIL ;
          </Li>
          <Li>
            déterminer si les résultats sont exploités de manière nominative ou
            anonymisée, et en assumer les conséquences.
          </Li>
        </Ul>

        <Encadre titre="Point d’attention">
          Un dispositif de simulation dont les collaborateurs n’ont pas été
          informés au préalable expose l’employeur à un risque juridique
          sérieux : les résultats seraient inopposables au salarié, et le
          dispositif pourrait être qualifié de moyen de surveillance illicite.
          L’information préalable ne réduit pas l’efficacité pédagogique du
          dispositif, dès lors que ni la date, ni la forme, ni le contenu des
          campagnes ne sont communiqués.
        </Encadre>

        <H3 id="engagements">2.4 Engagements de Safentreprise</H3>
        <P>
          Conformément à l’article 28 du RGPD, Safentreprise s’engage à :
        </P>
        <Ul>
          <Li>
            traiter les données uniquement sur instruction documentée du client ;
          </Li>
          <Li>
            garantir la confidentialité des données et n’y donner accès qu’aux
            personnes strictement habilitées ;
          </Li>
          <Li>
            mettre en œuvre les mesures techniques et organisationnelles
            décrites au point 3.2 ;
          </Li>
          <Li>
            ne recourir à aucun sous-traitant ultérieur non listé au point 3.1
            sans information préalable du client, ce dernier disposant d’un
            droit d’objection ;
          </Li>
          <Li>
            assister le client dans la réponse aux demandes d’exercice de droits
            et, le cas échéant, dans la réalisation d’une analyse d’impact ;
          </Li>
          <Li>
            notifier au client toute violation de données dans les 48 heures
            suivant sa découverte, avec les éléments permettant au client de
            remplir son obligation de notification à la CNIL dans le délai de
            72 heures ;
          </Li>
          <Li>
            au terme du contrat, supprimer ou restituer l’ensemble des données
            au choix du client, et détruire les copies existantes ;
          </Li>
          <Li>
            mettre à disposition du client toute information nécessaire pour
            démontrer le respect de ses obligations.
          </Li>
        </Ul>

        {/* ------------------------------------------------------------------ */}

        <H2 id="partie-3">PARTIE 3 — Dispositions communes</H2>

        <H3 id="sous-traitants">3.1 Sous-traitants ultérieurs</H3>
        <Tableau
          entetes={["Prestataire", "Rôle", "Localisation des données"]}
          lignes={[
            [
              "Supabase (AWS)",
              "Base de données, authentification",
              "Union européenne",
            ],
            [
              "Netlify, Inc.",
              "Hébergement du site et de l’application",
              "États-Unis",
            ],
            [
              "Resend, Inc.",
              "Envoi des e-mails transactionnels et de simulation",
              "États-Unis",
            ],
            [
              "Zoho Corporation",
              "Messagerie professionnelle",
              "Union européenne",
            ],
            [
              "Stripe, Inc.",
              "Traitement des paiements (le cas échéant)",
              "États-Unis / Union européenne",
            ],
          ]}
        />
        <P>
          <Fort>Transferts hors Union européenne.</Fort> Certains prestataires
          sont établis aux États-Unis. Ces transferts sont encadrés par les
          garanties appropriées prévues au chapitre V du RGPD : clauses
          contractuelles types de la Commission européenne (décision 2021/914)
          et, lorsque le prestataire y est certifié, cadre de protection des
          données UE–États-Unis (EU–US Data Privacy Framework).
        </P>
        <P>
          Les données de la base principale sont hébergées dans l’Union
          européenne.
        </P>

        <H3 id="securite">3.2 Sécurité</H3>
        <P>Les mesures suivantes sont mises en œuvre :</P>
        <Ul>
          <Li>
            chiffrement des communications en transit (TLS) et des données au
            repos ;
          </Li>
          <Li>
            cloisonnement strict des données par entreprise cliente (isolation
            au niveau de la base de données) ;
          </Li>
          <Li>
            authentification des accès et gestion des habilitations selon le
            principe du moindre privilège ;
          </Li>
          <Li>journalisation des accès et des opérations sensibles ;</Li>
          <Li>sauvegardes régulières ;</Li>
          <Li>politique de gestion des correctifs de sécurité.</Li>
        </Ul>
        <P>
          Aucune mesure ne garantissant une sécurité absolue, ces dispositions
          constituent une obligation de moyens renforcée.
        </P>

        <H3 id="vos-droits">3.3 Vos droits</H3>
        <P>
          Toute personne concernée dispose des droits d’accès, de rectification,
          d’effacement, de limitation, d’opposition et de portabilité, ainsi que
          du droit de définir des directives relatives au sort de ses données
          après son décès.
        </P>
        <P>
          <Fort>Comment les exercer :</Fort>
        </P>
        <Ul>
          <Li>
            <Fort>Si vous êtes utilisateur du site ou client</Fort> : adressez
            votre demande à{" "}
            <a
              href="mailto:contact@safentreprise.com"
              className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
            >
              contact@safentreprise.com
            </a>
            . Une réponse vous sera apportée dans le délai d’un mois,
            prorogeable de deux mois en cas de complexité.
          </Li>
          <Li>
            <Fort>Si vous êtes collaborateur d’une entreprise cliente</Fort> :
            adressez votre demande à votre employeur, qui est le responsable de
            traitement. Safentreprise transmettra toute demande reçue
            directement à l’entreprise concernée et l’assistera dans son
            traitement.
          </Li>
        </Ul>
        <P>
          Une pièce justificative d’identité peut être demandée en cas de doute
          raisonnable sur l’identité du demandeur.
        </P>

        <H3 id="reclamation">3.4 Réclamation</H3>
        <P>
          Toute personne estimant que ses droits ne sont pas respectés peut
          introduire une réclamation auprès de la Commission nationale de
          l’informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715,
          75334 Paris Cedex 07 —{" "}
          <LienExterne href="https://www.cnil.fr">www.cnil.fr</LienExterne>.
        </P>

        <H3 id="modifications">3.5 Modifications</H3>
        <P>
          La présente politique peut être modifiée pour tenir compte de
          l’évolution du service ou de la réglementation. La version applicable
          est celle publiée sur le site à la date de la consultation. Toute
          modification substantielle est portée à la connaissance des clients.
        </P>
      </div>
    </article>
  );
}
