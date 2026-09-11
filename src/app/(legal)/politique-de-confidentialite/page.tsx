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
    "Traitement des données personnelles par Safentreprise : rôles de responsable de traitement et de sous-traitant, surveillance des messages Microsoft 365, données conservées et durées, sous-traitants et exercice des droits.",
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
          Dernière mise à jour : 8 septembre 2026
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
          l’entreprise cliente, traitées uniquement sur instruction de celle-ci :
          les campagnes de sensibilisation d’une part, la surveillance des
          messages Microsoft 365 d’autre part. Dans ces deux cas, l’entreprise
          cliente est le responsable de traitement ; elle détermine les
          finalités et les moyens, et assume les obligations correspondantes.
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
          Safentreprise traite pour le compte de l’entreprise cliente les
          données de ses collaborateurs, au titre de deux services distincts.
        </P>
        <P>
          <Fort>Campagnes de sensibilisation</Fort> — envoi de messages de
          simulation et formation :
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
        <P>
          <Fort>Surveillance des messages Microsoft 365</Fort> — analyse des
          messages reçus dans les boîtes surveillées, et annotation de ceux qui
          présentent les caractéristiques d’une fraude. Ce service lit le
          contenu des messages et modifie ceux qu’il signale. Il fait l’objet du
          point 2.5, qui détaille ce qui est lu, ce qui est conservé, combien de
          temps, et comment une modification se défait.
        </P>

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

        <H3 id="microsoft-365">2.5 Surveillance des messages Microsoft 365</H3>
        <P>
          Safentreprise se raccorde aux boîtes Microsoft 365 de l’entreprise
          cliente, examine les messages qui y arrivent, et signale ceux qui
          présentent les caractéristiques d’une fraude au président ou d’une
          fraude au fournisseur.
        </P>
        <P>
          Le traitement décrit ici relève du même régime que le reste de la
          Partie 2 : <Fort>l’entreprise cliente</Fort> en est le responsable de
          traitement, <Fort>Safentreprise</Fort> agit comme sous-traitant et ne
          traite ces données que sur son instruction.
        </P>

        <Encadre titre="Ce service modifie les messages reçus">
          Lorsqu’un message est jugé frauduleux, Safentreprise le modifie dans
          la boîte du destinataire : un avertissement est inséré en tête du
          message, et une catégorie de couleur est posée dessus. Le message
          d’origine n’est pas supprimé — il figure sous l’avertissement. Cette
          modification peut être défaite ; les conditions sont détaillées plus
          bas.
        </Encadre>

        <P>
          <Fort>Le dirigeant est prévenu par e-mail, et seulement pour les
          tentatives les plus graves.</Fort>{" "}
          Lorsque le service classe une tentative en <Fort>risque élevé</Fort>{" "}
          et qu’il a effectivement posé l’avertissement dans le message, un
          e-mail est adressé au dirigeant de l’entreprise concernée. Cet e-mail
          indique l’adresse de la boîte visée, le nom et l’adresse de
          l’expéditeur, les motifs de détection, la date, le niveau et le
          score.{" "}
          <Fort>
            Il ne contient ni l’objet ni le contenu du message.
          </Fort>{" "}
          Le dirigeant apprend qu’une tentative a visé son entreprise ; il ne
          lit pas la correspondance de ses collaborateurs — le produit ne le lui
          permet nulle part. Les tentatives de niveau modéré ou faible ne
          déclenchent aucun e-mail. Cet envoi passe par un prestataire établi
          aux États-Unis : voir le point 3.1, « Sous-traitants ultérieurs ».
        </P>
        <P>
          <Fort>
            Un rapport mensuel est également adressé au dirigeant, le 1er de
            chaque mois.
          </Fort>{" "}
          Il est <Fort>agrégé</Fort> : des décomptes — messages analysés,
          alertes par niveau, types de fraude rencontrés — et l’adresse des
          trois boîtes les plus visées. Il ne comporte ni objet, ni contenu, ni
          adresse d’expéditeur d’aucun message, et ne nomme jamais un
          collaborateur autrement que par l’adresse de sa boîte, lorsque
          celle-ci figure parmi les plus visées. Il est envoyé{" "}
          <Fort>même lorsqu’aucune tentative n’a été détectée</Fort> : c’est
          alors le compte rendu d’un mois sans incident. Cet envoi passe par le
          même prestataire établi aux États-Unis.
        </P>

        <P>
          <Fort>Comment le service est raccordé.</Fort> Un administrateur
          Microsoft 365 de l’entreprise donne son accord une fois. Le service se
          connecte ensuite avec sa propre identité applicative, jamais avec le
          compte ni le mot de passe d’un collaborateur.
        </P>
        <P>
          Cet accord ne donne <Fort>aucun accès au courrier</Fort>. Il n’ouvre
          qu’une seule autorisation : lire l’annuaire de l’organisation — les
          noms et les adresses des collaborateurs. Aucun message, dans aucune
          boîte, n’est accessible à ce stade.
        </P>
        <P>
          L’accès aux messages est ouvert dans un second temps, par
          l’entreprise elle-même : son administrateur exécute un court script
          qui accorde à Safentreprise un droit de lecture et de modification du
          courrier, <Fort>limité aux adresses qu’elle a choisies</Fort>. Ce
          droit est posé dans son propre environnement Microsoft, et elle peut
          le retirer sans nous.
        </P>

        <P>
          <Fort>Ce que cela change concrètement.</Fort>
        </P>
        <Ul>
          <Li>
            Entre l’accord de l’administrateur et l’exécution du script,
            Safentreprise <Fort>ne peut lire aucun message</Fort>. Ce n’est pas
            une règle que nous nous imposons : c’est Microsoft qui refuse.
          </Li>
          <Li>
            Une boîte qui n’a pas été choisie <Fort>n’est pas lisible</Fort>, et
            ce refus vient de Microsoft, pas de notre code. Nous le vérifions
            avant de démarrer la surveillance, en tentant réellement de lire une
            boîte que l’entreprise n’a pas retenue : tant que Microsoft ne nous
            la refuse pas, aucun message n’est analysé. La date de ce contrôle
            et la réponse exacte de Microsoft sont affichées à l’entreprise
            cliente.
          </Li>
          <Li>
            <Fort>L’autorisation de lire l’annuaire, elle, n’est pas
            limitable</Fort> — Microsoft ne permet pas de la restreindre à une
            partie de l’organisation. Elle porte donc sur l’annuaire entier :
            noms, adresses et domaines de tous les collaborateurs. Elle ne donne
            accès à aucun message.
          </Li>
        </Ul>

        <P>
          <Fort>Ce que le service demande à Microsoft, pour chaque message.</Fort>
        </P>
        <Ul>
          <Li>l’identifiant technique du message ;</Li>
          <Li>l’objet ;</Li>
          <Li>la date et l’heure de réception ;</Li>
          <Li>le nom affiché et l’adresse de l’expéditeur ;</Li>
          <Li>les destinataires ;</Li>
          <Li>le corps du message ;</Li>
          <Li>les catégories déjà posées sur le message ;</Li>
          <Li>
            l’indication qu’il s’agit ou non d’un brouillon — un brouillon
            n’est pas analysé.
          </Li>
        </Ul>

        <P>
          <Fort>Ce que le service ne demande jamais.</Fort> Les pièces jointes —
          ni leur contenu, ni leur nom — et les en-têtes techniques bruts. Ces
          éléments ne sont pas écartés après coup : ils ne sont pas demandés à
          Microsoft.
        </P>

        <P>
          <Fort>Ce qui est conservé, et combien de temps.</Fort>
        </P>
        <Tableau
          entetes={["Donnée", "Durée de conservation"]}
          lignes={[
            [
              "Corps d’un message, copié avant que le message soit modifié",
              "30 jours au maximum, et effacé immédiatement dès que la modification a été défaite",
            ],
            [
              "Résultat d’analyse d’un message signalé : objet, expéditeur, destinataire, score, motifs du signalement",
              "12 mois à compter de l’analyse",
            ],
            [
              "Résultat d’analyse d’un message non signalé : mêmes données",
              "30 jours à compter de l’analyse",
            ],
            [
              "Annuaire de l’entreprise : nom et adresse des collaborateurs",
              "Copie remplacée à chaque mise à jour ; une personne retirée de l’annuaire Microsoft en disparaît. Supprimée à la fin du contrat",
            ],
            [
              "File de traitement interne : identifiants de messages en attente d’analyse",
              "7 jours après traitement, 30 jours en cas d’échec",
            ],
            [
              "Journaux techniques des appels internes",
              "7 jours",
            ],
            [
              "Raccordement Microsoft : adresses des boîtes surveillées, identifiants techniques",
              "Durée du contrat",
            ],
            [
              "Correspondants de confiance : nom et noms de domaine des fournisseurs et partenaires, déclarés par l’entreprise cliente elle-même",
              "Durée du contrat ; modifiables et supprimables à tout moment depuis l’application",
            ],
          ]}
        />
        <P>
          <Fort>
            Les correspondants de confiance sont déclarés, jamais déduits.
          </Fort>{" "}
          Safentreprise ne parcourt pas l’historique des boîtes pour deviner
          avec qui l’entreprise travaille : cette liste est saisie ou importée
          par l’entreprise cliente. Lorsque le fichier importé contient des
          adresses électroniques,{" "}
          <Fort>
            seul le domaine en est conservé, et l’extraction se fait dans le
            navigateur
          </Fort>{" "}
          : d’une adresse <em>prenom.nom@fournisseur.fr</em>, il ne reste en
          base que <em>fournisseur.fr</em>. La partie qui précède l’arobase
          n’est ni transmise ni enregistrée.
        </P>
        <P>
          Ces suppressions sont automatiques : elles s’exécutent chaque nuit,
          sans intervention. Une seule exception, volontaire : tant qu’un
          message porte encore un avertissement qui n’a pas été retiré, la ligne
          qui le décrit est conservée, quelle que soit son ancienneté. Sans
          elle, plus rien n’indiquerait qu’un message a été modifié, ni ne
          permettrait de le remettre en état.
        </P>

        <P>
          <Fort>Le corps des messages : le point le plus sensible.</Fort> Il
          mérite d’être détaillé, parce que c’est là que se trouve le contenu
          des échanges.
        </P>
        <Ul>
          <Li>
            Pour analyser un message, le service en lit le corps sur son
            serveur. Cette lecture ne laisse aucune copie : seule la{" "}
            <Fort>longueur</Fort> du texte est enregistrée, avec le résultat de
            l’analyse.
          </Li>
          <Li>
            Une copie du corps n’est écrite en base que dans un seul cas :{" "}
            <Fort>juste avant de modifier le message</Fort>, pour pouvoir le
            remettre exactement dans son état d’origine.
          </Li>
          <Li>
            Cette copie est effacée dès que la modification est défaite, et au
            plus tard au bout de 30 jours.
          </Li>
          <Li>
            <Fort>Aucune interface ne l’affiche</Fort>, et la base la refuse à
            l’entreprise cliente comme au collaborateur : aucune règle d’accès
            ne l’autorise, et le droit de lecture leur est retiré. Elle ne sert
            qu’au programme qui remet le message en état.
          </Li>
          <Li>
            <Fort>Ce que nous ne pouvons pas prétendre.</Fort> Cette copie est
            enregistrée en clair : elle est chiffrée par l’hébergeur sur le
            disque, pas par Safentreprise. Les personnes qui exploitent le
            service disposent de la clé technique qui permet d’y accéder, et
            aucun journal ne trace ces accès. La protection tient donc à la
            purge à trente jours et au fait que rien ne l’expose — pas à une
            impossibilité technique.
          </Li>
          <Li>
            Au-delà d’un mégaoctet, la copie est refusée — et dans ce cas le
            message <Fort>n’est pas modifié du tout</Fort>. Mieux vaut un
            message non annoté qu’un message modifié sans retour possible.
          </Li>
        </Ul>

        <P>
          <Fort>Tous les messages sont analysés, pas seulement ceux qui sont
          signalés.</Fort>{" "}
          Chaque message reçu dans une boîte surveillée donne lieu à une ligne
          en base, y compris lorsque l’analyse conclut qu’il n’y a rien à
          signaler. Cette ligne contient l’objet, l’expéditeur et le
          destinataire. C’est la raison pour laquelle elle est effacée au bout
          de 30 jours, alors qu’un message signalé est conservé douze mois.
        </P>

        <P>
          <Fort>Les coordonnées bancaires.</Fort> Lorsqu’un message annonce un
          changement de compte bancaire, le motif du signalement mentionne le
          compte concerné sous forme <Fort>masquée</Fort> : seuls les quatre
          premiers et les quatre derniers caractères sont conservés. Un IBAN
          complet n’est jamais enregistré.
        </P>

        <P>
          <Fort>Qui peut voir quoi.</Fort> Chaque entreprise cliente ne voit que
          ses propres données ; ce cloisonnement est appliqué par la base de
          données elle-même, pas seulement par l’application. Le dirigeant
          client accède en lecture aux résultats d’analyse, à l’annuaire copié
          et à la liste de ses boîtes surveillées. Il n’a accès à aucun corps de
          message. Safentreprise accède à l’ensemble pour exploiter et dépanner
          le service.
        </P>

        <P>
          <Fort>La modification des messages, en détail.</Fort> Quand un message
          est signalé :
        </P>
        <Ul>
          <Li>
            un avertissement est inséré en tête du corps, encadré par deux
            repères invisibles à la lecture, qui permettent de le retrouver et
            de le retirer ;
          </Li>
          <Li>
            une catégorie de couleur est posée sur le message, visible dans la
            liste des messages ;
          </Li>
          <Li>
            un message reçu au format texte simple est converti au format HTML à
            cette occasion.
          </Li>
        </Ul>
        <P>
          <Fort>Cette modification est réversible</Fort>, par deux moyens : la
          copie du corps d’origine, tant qu’elle existe, qui permet de rétablir
          le message au caractère près ; et, à défaut, le retrait de tout ce qui
          se trouve entre les deux repères.
        </P>
        <P>
          <Fort>Une limite doit être dite clairement.</Fort> Passé 30 jours, la
          copie du corps a été effacée. Le retrait de l’avertissement reste
          possible, mais un message qui était en texte simple restera au format
          HTML. Sa mise en forme peut donc différer légèrement de l’original.
        </P>

        <P>
          <Fort>Ce qui n’est jamais fait.</Fort> Safentreprise ne supprime
          aucun message, n’en déplace aucun, n’en envoie aucun depuis les boîtes
          surveillées, et ne lit aucun message envoyé — seuls les messages
          reçus dans la boîte de réception sont examinés.
        </P>

        <P>
          <Fort>Alertes internes de bon fonctionnement.</Fort> Safentreprise
          reçoit des messages d’alerte automatiques lorsque le service
          rencontre un problème. Ces messages ne contiennent{" "}
          <Fort>que des compteurs et la nature du problème</Fort> : ni objet de
          message, ni adresse d’expéditeur, ni adresse de boîte surveillée.
        </P>

        <P>
          <Fort>Hébergement.</Fort> Toutes les données décrites ci-dessus sont
          enregistrées dans la base Supabase, <Fort>hébergée en France</Fort>{" "}
          (région AWS eu-west-3, Paris). L’analyse elle-même, qui lit le corps
          des messages, s’exécute <Fort>en Allemagne</Fort> (Netlify, région AWS
          eu-central-1, Francfort). Les messages restent chez Microsoft, dans le
          locataire de l’entreprise cliente : Safentreprise les lit, les annote,
          mais ne les déplace pas. À aucun moment le contenu d’un message ne
          sort de l’Union européenne.
        </P>

        <P>
          <Fort>Information des collaborateurs.</Fort> L’entreprise cliente est
          responsable de traitement : c’est à elle d’informer ses collaborateurs
          que leurs messages entrants sont analysés et, le cas échéant, annotés,
          et de consulter les représentants du personnel lorsque la loi
          l’impose. Safentreprise recommande que cette information soit donnée{" "}
          <Fort>avant</Fort> le premier raccordement, et fournit sur demande un
          texte type. Le dispositif est conçu pour ne rien mesurer de
          l’activité des personnes : il ne produit ni statistique par
          collaborateur, ni indicateur de comportement individuel.
        </P>
        {/* ------------------------------------------------------------------ */}

        <H2 id="partie-3">PARTIE 3 — Dispositions communes</H2>

        <H3 id="sous-traitants">3.1 Sous-traitants ultérieurs</H3>
        <Tableau
          entetes={["Prestataire", "Rôle", "Localisation des données"]}
          lignes={[
            [
              "Supabase (AWS)",
              "Base de données, authentification",
              "France (région AWS eu-west-3, Paris)",
            ],
            [
              "Netlify, Inc.",
              "Hébergement du site, exécution de l’application",
              "Allemagne (région AWS eu-central-1, Francfort)",
            ],
            [
              "Resend, Inc.",
              "Envoi des e-mails de simulation, des alertes techniques internes, des alertes de fraude et des rapports mensuels adressés au dirigeant",
              "États-Unis",
            ],
            [
              "SMS Partner",
              "Envoi des SMS de simulation, lorsque ce canal est utilisé",
              "France",
            ],
            [
              "Stripe, Inc.",
              "Traitement des paiements (le cas échéant)",
              "États-Unis / Union européenne",
            ],
          ]}
        />
        <P>
          <Fort>Microsoft.</Fort> Microsoft n’est pas un sous-traitant de
          Safentreprise. Microsoft 365 est le service de l’entreprise cliente,
          choisi par elle ; les messages y restent hébergés. Safentreprise s’y
          raccorde sur autorisation de son administrateur, dans les limites
          décrites au point 2.5.
        </P>
        <P>
          <Fort>
            Les données des entreprises clientes et de leurs collaborateurs
            restent dans l’Union européenne.
          </Fort>{" "}
          La base de données, où tout est enregistré, est hébergée{" "}
          <Fort>en France</Fort> (Supabase, région AWS eu-west-3, Paris).
          L’application qui traite ces données — et qui lit le contenu des
          messages le temps de chaque analyse — s’exécute{" "}
          <Fort>en Allemagne</Fort> (Netlify, région AWS eu-central-1,
          Francfort). Les messages eux-mêmes ne quittent pas le locataire
          Microsoft 365 de l’entreprise cliente.
        </P>
        <P>
          <Fort>Transferts hors Union européenne.</Fort> Quatre flux seulement
          sortent de l’Union européenne, et aucun ne porte le contenu d’un
          message :
        </P>
        <Ul>
          <Li>
            <Fort>Resend</Fort> — l’acheminement des messages de simulation
            envoyés aux collaborateurs dans le cadre des campagnes, et les
            alertes techniques internes, qui ne contiennent que des compteurs
            et la nature du problème rencontré ;
          </Li>
          <Li>
            <Fort>Resend, pour l’alerte de fraude.</Fort> Lorsqu’une tentative
            de <Fort>risque élevé</Fort> est détectée et signalée par une
            bannière, un e-mail prévient le dirigeant de l’entreprise
            concernée. Cet e-mail comporte l’adresse de la boîte visée, le nom
            et l’adresse de l’expéditeur du message frauduleux, les motifs de
            détection, la date, le niveau et le score. Il ne comporte{" "}
            <Fort>ni l’objet ni le contenu du message</Fort> : le produit ne
            les transmet nulle part, et ne les conserve pas. Un seul e-mail est
            envoyé par heure et par entreprise au maximum ;
          </Li>
          <Li>
            <Fort>Resend, pour le rapport mensuel.</Fort> Le 1er de chaque
            mois, un rapport de surveillance est adressé au dirigeant pour le
            mois écoulé — <Fort>y compris lorsqu’aucune tentative n’a été
            détectée</Fort>, puisqu’il sert précisément à rendre compte du
            travail accompli. Il est <Fort>agrégé</Fort> : nom de la société,
            décomptes de messages analysés et d’alertes par niveau, nombre de
            boîtes surveillées, nombre d’alertes par type de fraude, et
            l’adresse des trois boîtes les plus visées. Il ne comporte{" "}
            <Fort>
              ni objet, ni contenu, ni adresse d’expéditeur d’aucun message
            </Fort>{" "}
            ;
          </Li>
          <Li>
            <Fort>Stripe</Fort> — le traitement des paiements, le cas échéant,
            qui ne porte que sur des données de facturation.
          </Li>
        </Ul>
        <P>
          Ces transferts sont encadrés par les garanties appropriées prévues au
          chapitre V du RGPD : clauses contractuelles types de la Commission
          européenne (décision 2021/914) et, lorsque le prestataire y est
          certifié, cadre de protection des données UE–États-Unis (EU–US Data
          Privacy Framework).
        </P>
        <P>
          <Fort>Une précision utile.</Fort> Supabase et Netlify sont des
          sociétés établies aux États-Unis, alors que les données qu’elles
          traitent pour Safentreprise restent en France et en Allemagne. Les
          mêmes garanties contractuelles s’appliquent donc à elles, pour couvrir
          les accès depuis les États-Unis que leur exploitation peut supposer.
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
          <Fort>Comment l’effacement est réalisé aujourd’hui.</Fort> L’entreprise
          cliente n’a pas encore, dans son espace, de bouton permettant
          d’effacer elle-même les données d’un collaborateur. Une demande
          d’effacement est exécutée manuellement par Safentreprise, à réception,
          et dans le délai d’un mois prévu par le RGPD. Une fonction permettant
          au client de le faire seul est prévue. Ce point est indiqué ici parce
          qu’il est vrai, et non parce qu’il est satisfaisant.
        </P>
        <P>
          Deux limites tiennent à la nature du service. L’effacement ne peut
          porter sur les messages eux-mêmes, qui restent la propriété de
          l’entreprise et sont hébergés chez Microsoft. Et lorsqu’un message a
          été annoté, la ligne qui le décrit est conservée tant que
          l’annotation n’a pas été retirée : c’est la seule trace permettant de
          la défaire. Retirer l’annotation d’abord, puis effacer, lève cette
          limite.
        </P>
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
