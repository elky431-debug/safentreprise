# Contrat de sous-traitance (article 28 RGPD) — à faire valider par un juriste

**Version 0.1 — 8 septembre 2026. Projet non relu par un professionnel du
droit.** Destiné à être annexé aux conditions générales, après relecture, en
même temps que `docs/CGV-A-VALIDER.md`.

> **Comment ce projet a été établi.** Chaque durée, chaque sous-traitant,
> chaque mesure de sécurité ci-dessous a été relevé dans le code et dans
> `docs/AIPD.md` (version 1.1), pas dans un modèle type. **Aucune mesure n'y
> est engagée que le code n'applique pas.** L'article 7 dit ce qui existe ;
> l'article 8 dit, tout aussi explicitement, ce qui n'existe pas. Les
> obligations de l'article 28 que Safentreprise n'est aujourd'hui pas en
> mesure de tenir sont rassemblées en fin de document, partie **B**.

---

## Préambule — qualification des parties

Le présent contrat complète les conditions générales de vente et
d'utilisation de Safentreprise (ci-après « les CGV ») et s'applique à tout
traitement de données à caractère personnel réalisé par Safentreprise pour le
compte du Client.

**Le Client** est le **responsable de traitement** au sens de l'article 4.7 du
Règlement (UE) 2016/679 (ci-après « le RGPD »). Il détermine les finalités et
les moyens des traitements décrits à l'article 3.

**Safentreprise** — El Fahim Yacine, entrepreneur individuel exerçant sous le
nom commercial Safentreprise, SIREN 999 661 887, 43 rue des Chantiers, 78000
Versailles — est le **sous-traitant** au sens de l'article 4.8 du RGPD.

**Microsoft n'est pas un sous-traitant de Safentreprise.** Microsoft 365 est le
service du Client, souscrit par lui, régi par le contrat qui les lie. Le rôle
de Safentreprise se limite à s'y connecter avec l'autorisation du Client.

---

## Article 1 — Objet

Le présent contrat a pour objet de définir les conditions dans lesquelles
Safentreprise traite, pour le compte du Client, les données à caractère
personnel nécessaires à l'exécution du Service, conformément à l'article 28.3
du RGPD.

En cas de contradiction entre le présent contrat et les CGV sur une question
relative à la protection des données à caractère personnel, **le présent
contrat prévaut**.

## Article 2 — Définitions

Les termes définis à l'article 2 des CGV — Plateforme, Surveillance, Boîtes
raccordées, Collaborateurs, Campagne, Service — conservent ici le même sens.
Les termes définis à l'article 4 du RGPD y conservent également le leur.

## Article 3 — Description des traitements

### 3.1 Nature et finalité

Safentreprise réalise pour le compte du Client **deux traitements distincts**.

**Traitement A — Surveillance des messages Microsoft 365.** Analyse
automatisée des messages reçus dans les Boîtes raccordées, aux seules fins de
détecter deux fraudes : la fraude au président et la fraude au fournisseur.
Lorsqu'un message présente les caractéristiques d'une de ces fraudes,
Safentreprise **modifie ce message dans la boîte du destinataire** : un
avertissement est inséré en tête du corps, et une catégorie de couleur est
posée. Le message d'origine n'est ni supprimé ni déplacé.

**Traitement B — Campagnes de sensibilisation.** Envoi aux Collaborateurs de
messages de simulation, mesure de leurs réactions, mise à disposition de
modules de formation, et calcul d'un score de risque.

Ces traitements **ne poursuivent aucune finalité de surveillance individuelle
des Collaborateurs**, de mesure de leur productivité, ni d'évaluation
disciplinaire. Safentreprise ne produit aucun indicateur de comportement
individuel au titre du Traitement A.

### 3.2 Durée

Le présent contrat produit ses effets pendant toute la durée du contrat
principal, et jusqu'à l'accomplissement complet des opérations prévues à
l'article 12.

### 3.3 Catégories de personnes concernées

- les Collaborateurs du Client, titulaires ou utilisateurs des Boîtes
  raccordées ;
- l'ensemble des personnes figurant à l'annuaire Microsoft 365 du Client (voir
  article 3.5) ;
- les tiers en relation avec le Client dont un message parvient à une Boîte
  raccordée — notamment les expéditeurs, y compris externes à l'organisation
  du Client, dont l'identité et le contenu du message sont analysés.

### 3.4 Catégories de données

Le détail figure à l'**annexe 1**, qui fait partie intégrante du présent
contrat.

**Le Client est expressément informé** que le Traitement A implique la lecture
du **corps des messages reçus**, lequel est susceptible de contenir des
données que le Client n'a ni choisies ni anticipées, y compris des données
relevant de l'article 9 du RGPD. Safentreprise ne recherche pas ces données et
ne les enregistre pas au titre de l'analyse ; elles peuvent néanmoins figurer
dans la copie temporaire prévue à l'annexe 1, ligne 1.

### 3.5 Étendue de l'accès technique

Cette description correspond à l'état du Service au 8 septembre 2026, vérifié
sur un environnement Microsoft réel.

| Autorisation | Portée effective | Ce qu'elle ouvre |
|---|---|---|
| `User.Read.All` (application) | **Tout le locataire du Client — non limitable** | Annuaire : noms, adresses, domaines. Aucun message. |
| `User.Read` (délégué) | L'utilisateur connecté | Connexion à l'espace client. |
| Rôle Exchange `Application Mail.ReadWrite` | **Les seules Boîtes raccordées** | Lecture et modification du courrier. |

Le troisième n'est pas délivré par l'autorisation d'administrateur : il est
attribué par le Client lui-même dans son environnement Exchange, au moyen d'un
script fourni par Safentreprise, et délimité par un périmètre de gestion
filtrant sur les adresses retenues. Il en résulte que :

- **tant que ce script n'a pas été exécuté, Safentreprise n'a accès à aucun
  message**, dans aucune boîte ;
- **le refus d'accès à une boîte non raccordée est prononcé par Microsoft**, et
  non par le code de Safentreprise. Ce refus est constaté avant tout démarrage
  de la Surveillance, en tentant effectivement de lire une boîte non
  raccordée ; à défaut de refus explicite, aucun message n'est analysé ;
- **l'autorisation d'annuaire n'est pas limitable** à une partie de
  l'organisation du Client — Microsoft ne le permet pas. Elle porte donc sur
  l'annuaire entier. Elle n'ouvre l'accès à aucun message.

Le Client peut retirer l'une ou l'autre de ces autorisations à tout moment,
depuis son propre environnement Microsoft et sans le concours de
Safentreprise. Ce retrait interrompt le Traitement A.

## Article 4 — Instructions documentées

Safentreprise ne traite les données à caractère personnel que sur instruction
documentée du Client, y compris en matière de transfert hors de l'Union
européenne.

Constituent les instructions documentées du Client, à l'exclusion de toute
autre :

1. les CGV et le présent contrat ;
2. les paramètres que le Client définit lui-même dans son espace : la
   désignation des Boîtes raccordées, la liste de ses Collaborateurs, le
   contenu et le calendrier de ses Campagnes, le mode nominatif ou anonymisé
   d'exploitation des résultats ;
3. toute instruction particulière adressée par écrit à
   `contact@safentreprise.com`, dont Safentreprise accuse réception.

Si Safentreprise considère qu'une instruction constitue une violation du RGPD
ou d'une autre disposition du droit de l'Union ou d'un État membre relative à
la protection des données, elle en informe immédiatement le Client et peut
suspendre l'exécution de cette instruction jusqu'à sa confirmation ou sa
modification.

Si Safentreprise est tenue de procéder à un transfert en vertu du droit de
l'Union ou d'un État membre, elle en informe le Client avant le traitement,
sauf si ce droit l'interdit pour des motifs importants d'intérêt public.

## Article 5 — Confidentialité

Safentreprise veille à ce que les personnes autorisées à traiter les données à
caractère personnel s'engagent à en respecter la confidentialité, ou soient
soumises à une obligation légale appropriée de confidentialité.

**Le Client est informé que Safentreprise est une entreprise individuelle**, et
que la seule personne autorisée à accéder aux données au titre de
l'exploitation du Service est son dirigeant, lui-même tenu au secret
professionnel et à la confidentialité. Il en résulte l'absence de séparation
des rôles et l'absence de contrôle par un tiers des opérations d'exploitation.
Cette caractéristique est structurelle et portée à la connaissance du Client
avant la signature.

Toute personne qui viendrait à intervenir dans l'exploitation du Service sera
préalablement soumise à un engagement écrit de confidentialité, et le Client
en sera informé dans les conditions de l'article 9.

## Article 6 — Sécurité (article 32 du RGPD)

Safentreprise met en œuvre les mesures techniques et organisationnelles
décrites à l'**annexe 3**, qui fait partie intégrante du présent contrat.

**L'annexe 3 comporte deux parties, d'égale valeur contractuelle** : les
mesures existantes, que Safentreprise s'engage à maintenir, et les **limites
connues**, que Safentreprise porte à la connaissance du Client et ne s'engage
pas à couvrir en l'état. Le Client déclare avoir pris connaissance des unes et
des autres avant la signature, et en avoir tenu compte dans sa propre
appréciation du risque au titre de l'article 32 du RGPD.

Toute évolution de ces mesures qui en réduirait le niveau est portée à la
connaissance du Client dans les conditions de l'article 9.

## Article 7 — Sous-traitants ultérieurs

### 7.1 Autorisation

Le Client autorise Safentreprise à faire appel aux sous-traitants ultérieurs
listés à l'**annexe 2**, laquelle précise pour chacun son identité, la
prestation confiée, les catégories de données concernées et le lieu
d'hébergement.

### 7.2 Changement — information préalable et opposition

Safentreprise informe le Client de tout projet d'ajout ou de remplacement d'un
sous-traitant ultérieur, par courrier électronique adressé à l'adresse de
contact déclarée par le Client, **au moins trente (30) jours avant** la mise en
œuvre effective.

Le Client dispose de ce délai pour s'y opposer par écrit, en motivant son
opposition. En cas d'opposition motivée, les parties recherchent une solution
dans un délai de trente (30) jours. À défaut d'accord, le Client peut résilier
le contrat principal sans indemnité, par lettre recommandée, pour la partie du
Service concernée par le changement.

### 7.3 Obligations imposées

Safentreprise impose contractuellement à ses sous-traitants ultérieurs des
obligations de protection des données équivalentes à celles du présent
contrat, et demeure **pleinement responsable devant le Client** de l'exécution
par ceux-ci de leurs obligations.

## Article 8 — Transferts hors de l'Union européenne

Les données enregistrées de manière durable — c'est-à-dire l'ensemble des
données listées à l'annexe 1 — sont hébergées **dans l'Union européenne** :
en France pour la base de données, en Allemagne pour l'exécution applicative.

**Les corps de messages ne quittent pas l'Union européenne.**

Deux sous-traitants ultérieurs sont établis hors de l'Union européenne, et
l'annexe 2 précise pour chacun d'eux la nature exacte des données transmises.
Ces transferts sont fondés sur les clauses contractuelles types de la
Commission européenne (décision d'exécution (UE) 2021/914).

> **[À VALIDER PAR LE JURISTE]** La conclusion effective de ces clauses avec
> chaque sous-traitant hors Union, l'accomplissement d'une analyse d'impact des
> transferts, et l'articulation avec le *Data Privacy Framework* n'ont pas été
> vérifiés. Voir partie B, point 7.

## Article 9 — Information du Client

Toute information due au Client au titre du présent contrat — changement de
sous-traitant ultérieur, évolution des mesures de sécurité, violation de
données, intervention d'une personne supplémentaire dans l'exploitation — est
adressée par courrier électronique à l'adresse de contact déclarée par le
Client dans son espace. Il appartient au Client de maintenir cette adresse à
jour.

## Article 10 — Assistance au titre des droits des personnes

### 10.1 Principe

Le Client est seul responsable de répondre aux demandes d'exercice de droits
émanant des personnes concernées. Safentreprise l'assiste, dans la mesure du
possible, compte tenu de la nature du traitement.

Lorsqu'une demande est adressée directement à Safentreprise, celle-ci la
transmet au Client dans un délai de **cinq (5) jours ouvrés** et n'y répond pas
elle-même.

### 10.2 Ce que le Client peut obtenir sans intervention de Safentreprise

Le dirigeant du Client accède directement, depuis son espace, en lecture :

- aux résultats d'analyse de son entreprise ;
- à l'annuaire copié ;
- à la liste de ses Boîtes raccordées, à la preuve de restriction d'accès et à
  sa date ;
- aux données de ses Campagnes.

Ce cloisonnement est appliqué par la base de données elle-même, et non
seulement par l'application.

### 10.3 Ce qui suppose une intervention manuelle de Safentreprise

**Le Client est expressément informé qu'aucune fonction ne permet aujourd'hui
d'extraire, de rectifier ou d'effacer les données d'une personne nommément
désignée.** Ces opérations sont réalisées manuellement par Safentreprise, sur
demande écrite du Client.

Safentreprise s'engage à y procéder dans un délai de **dix (10) jours ouvrés** à
compter de la demande, délai compatible avec celui d'un mois dont dispose le
Client au titre de l'article 12.3 du RGPD.

**Aucune traçabilité de ces opérations n'existe à ce jour** : ni registre des
demandes, ni journal des opérations effectuées. Voir partie B, point 3.

## Article 11 — Violations de données

### 11.1 Notification au Client

Safentreprise notifie au Client toute violation de données à caractère
personnel dont elle a connaissance, **dans les meilleurs délais et au plus tard
quarante-huit (48) heures** après en avoir pris connaissance, par les moyens
prévus à l'article 9.

La notification comporte, dans la mesure des informations disponibles : la
nature de la violation, les catégories et le nombre approximatif de personnes
et d'enregistrements concernés, les conséquences probables, et les mesures
prises ou proposées.

Il appartient au **Client seul** de procéder, le cas échéant, à la notification
à l'autorité de contrôle (article 33) et à la communication aux personnes
concernées (article 34).

### 11.2 Limite de détection — portée de l'engagement

**L'engagement de l'article 11.1 porte sur les violations dont Safentreprise a
connaissance. Le Client est informé que la capacité de détection est
limitée** : aucune journalisation des accès n'existe à ce jour. Un accès
illégitime aux données par une personne détenant une clé technique valide ne
laisserait aucune trace, et ne serait donc ni détecté, ni démontrable.

Cette limite est décisive pour l'appréciation du risque par le Client. Elle est
également mentionnée à l'annexe 3, partie 2, et dans la politique de
confidentialité. Voir partie B, point 2.

## Article 12 — Assistance en matière d'analyse d'impact

Safentreprise met à la disposition du Client, sur simple demande, l'analyse
d'impact relative à la protection des données qu'elle a menée sur son propre
produit (`docs/AIPD.md`), laquelle décrit le traitement, les données, les
durées, les mesures existantes et **les manques identifiés**.

Ce document **ne dispense pas le Client de sa propre analyse d'impact** : il en
constitue la partie technique, que le Client complète par ce qui lui est propre
— sa finalité exacte, sa base légale, l'information de ses Collaborateurs, la
consultation de ses représentants du personnel.

Safentreprise assiste le Client, dans la limite des informations dont elle
dispose, en cas de consultation préalable de l'autorité de contrôle au titre de
l'article 36 du RGPD.

## Article 13 — Sort des données en fin de contrat

Au terme du contrat principal, quelle qu'en soit la cause, Safentreprise
procède, **au choix du Client exprimé par écrit dans les trente (30) jours** :

1. à **l'effacement** de l'ensemble des données traitées pour son compte, et
   des copies existantes ; ou
2. à la **restitution** de ces données, suivie de leur effacement.

À défaut de choix exprimé dans ce délai, l'effacement est réalisé.

**Modalités effectives, portées à la connaissance du Client :**

- l'effacement est réalisé **manuellement**, dans un délai de trente (30) jours
  à compter de la demande ou de l'expiration du délai ci-dessus. La suppression
  d'un client entraîne en cascade celle des données qui s'y rattachent ;
- la restitution suppose une **extraction manuelle** : aucune fonction
  d'export n'existe à ce jour. Elle est livrée dans un format structuré
  d'usage courant, dans un délai de trente (30) jours ;
- Safentreprise ne conserve après effacement que ce qu'une obligation légale
  lui impose de conserver, notamment les documents comptables (article
  L.123-22 du Code de commerce) ;
- **les sauvegardes de la base de données**, gérées par l'hébergeur, peuvent
  contenir des données effacées jusqu'à l'expiration de leur propre cycle de
  rétention. Voir partie B, point 5.

## Article 14 — Audits et mise à disposition des informations

Safentreprise met à la disposition du Client toutes les informations
nécessaires pour démontrer le respect des obligations du présent contrat,
notamment : l'analyse d'impact mentionnée à l'article 12, la liste à jour des
sous-traitants ultérieurs, la description des mesures de sécurité et de leurs
limites.

Safentreprise permet la réalisation d'audits, y compris d'inspections, par le
Client ou par un auditeur qu'il mandate, dans les conditions suivantes :

- préavis écrit de trente (30) jours ;
- au maximum une fois par an, sauf incident de sécurité avéré ou demande d'une
  autorité de contrôle ;
- pendant les heures ouvrées, sans perturbation disproportionnée du Service ;
- l'auditeur mandaté ne doit pas être un concurrent de Safentreprise et est
  soumis à un engagement de confidentialité ;
- les frais sont supportés par le Client, sauf si l'audit révèle un manquement
  substantiel de Safentreprise.

**Safentreprise ne dispose d'aucune certification ni d'aucun rapport d'audit
indépendant** — ni ISO 27001, ni SOC 2, ni HDS. Aucune n'est promise. Le
Client en tient compte dans le choix de ses moyens de contrôle. Voir partie B,
point 4.

## Article 15 — Responsabilité

La répartition de la responsabilité entre les parties est régie par l'article
11 des CGV.

> **[À VALIDER PAR LE JURISTE]** L'articulation entre le plafond de
> responsabilité stipulé à l'article 11 des CGV et le régime de responsabilité
> de l'article 82 du RGPD — qui institue une responsabilité solidaire du
> sous-traitant envers la personne concernée, et à laquelle un plafond
> contractuel n'est pas opposable — n'a pas été vérifiée. C'est le point le
> plus exposé du présent projet. Voir partie B, point 8.

## Article 16 — Durée, modification, droit applicable

Le présent contrat entre en vigueur à la date de signature du contrat
principal et demeure en vigueur tant que Safentreprise traite des données pour
le compte du Client.

Toute modification fait l'objet d'un avenant écrit. Par exception, l'annexe 2
(sous-traitants ultérieurs) évolue selon la procédure de l'article 7.2, et
l'annexe 3 (mesures de sécurité) selon celle de l'article 6.

Le présent contrat est soumis au droit français. Les litiges relèvent des
juridictions compétentes dans les conditions prévues aux CGV.

---

# ANNEXE 1 — Données traitées et durées de conservation

Durées relevées dans le code. Les purges marquées « automatique » s'exécutent
chaque nuit sans intervention.

## Traitement A — Surveillance Microsoft 365

| Donnée | Où | Durée | Purge |
|---|---|---|---|
| Corps complet du message, copié **avant** modification (HTML ou texte, plafonné à 1 Mo) | `graph_corps_originaux` | **30 jours au maximum**, et effacé dès que la modification a été défaite | Automatique |
| Objet, nom affiché et adresse de l'expéditeur, adresse du premier destinataire, nom lu dans la signature | `graph_analyses` | **12 mois** si le message a été signalé, **30 jours** sinon | Automatique |
| Coordonnées bancaires **masquées** — quatre premiers et quatre derniers caractères seulement ; un IBAN complet n'est jamais enregistré | `graph_analyses.signaux` | idem | Automatique |
| Score, niveau de risque, motifs du signalement | `graph_analyses` | idem | Automatique |
| **Longueur** du texte analysé — le corps lui-même n'est pas conservé au titre de l'analyse | `graph_analyses` | idem | Automatique |
| Annuaire : nom et adresse de chaque personne du locataire | `annuaire_personnes` | Instantané **remplacé** à chaque rafraîchissement ; une personne retirée de l'annuaire Microsoft en disparaît | Effacé en fin de contrat (art. 13) |
| Identifiants techniques de messages en attente d'analyse | `graph_file_attente` | **7 jours** après traitement, **30 jours** en cas d'échec | Automatique |
| Adresses des Boîtes raccordées, identifiants de raccordement, preuve de restriction | `boites_surveillees`, `microsoft_tenants` | Durée du contrat | Effacé en fin de contrat (art. 13) |
| Journaux techniques des appels internes | `net._http_response` | **7 jours** | Automatique |

**Ne sont jamais demandées à Microsoft**, et ne sont donc pas « filtrées après
coup » : les **pièces jointes** — ni leur contenu, ni leur nom —, les **en-têtes
techniques bruts**, et les **messages envoyés** (seule la boîte de réception est
abonnée). Le service demande exactement huit champs.

**Une exception à la purge, volontaire :** tant qu'un message porte encore un
avertissement qui n'a pas été retiré, la ligne qui le décrit est conservée
quelle que soit son ancienneté. Sans elle, plus rien n'indiquerait qu'un
message a été modifié, ni ne permettrait de le remettre en état.

## Traitement B — Campagnes de sensibilisation

| Donnée | Durée | Purge |
|---|---|---|
| Identité des Collaborateurs : prénom, nom, adresse professionnelle, téléphone professionnel le cas échéant | Durée du contrat | **Aucune purge automatique** — effacement manuel en fin de contrat (art. 13) |
| Données d'interaction : réception, ouverture, clic, signalement, absence d'action | Durée du contrat | idem |
| Données pédagogiques : participation, réponses au quiz, score | Durée du contrat | idem |
| Score de risque individuel | Durée du contrat | idem |

---

# ANNEXE 2 — Sous-traitants ultérieurs

Liste au 8 septembre 2026.

| Sous-traitant | Prestation | Données concernées | Hébergement |
|---|---|---|---|
| **Supabase** (infrastructure AWS) | Base de données et authentification | **La totalité** des données enregistrées, corps de messages compris | **France** — AWS `eu-west-3` (Paris) |
| **Netlify** (infrastructure AWS) | Hébergement et exécution de l'application | Tout ce qui transite pendant une requête, **corps des messages compris**, **en mémoire seulement** — aucune écriture durable | **Allemagne** — AWS `eu-central-1` (Francfort) |
| **Resend** | Envoi des messages de simulation des Campagnes ; envoi des alertes techniques internes | Adresses des Collaborateurs destinataires et contenu des messages de simulation. Les alertes techniques internes sont **réduites à des compteurs et à la nature du problème** : elles ne comportent ni objet, ni adresse d'expéditeur, ni adresse de boîte | **États-Unis** |
| **SMS Partner** | Envoi des simulations par SMS, si ce canal est utilisé | Numéros de téléphone professionnels et contenu du SMS | **France** |

**Ne figure pas dans cette liste, et ne doit pas y être ajouté sans
vérification :** *Stripe*. Une colonne de statut de paiement existe en base,
mais **aucun appel à Stripe n'est effectué par le code à ce jour**. Cette ligne
sera ajoutée si et quand l'encaissement en ligne sera mis en service.

**Microsoft** n'est pas un sous-traitant de Safentreprise (voir préambule).

---

# ANNEXE 3 — Mesures de sécurité

## Partie 1 — Mesures existantes, que Safentreprise s'engage à maintenir

**Cloisonnement entre clients.** Chaque entreprise cliente ne voit que ses
propres données. Le cloisonnement est appliqué par la base de données
elle-même — sécurité au niveau des lignes active sur toutes les tables du
traitement — et non seulement par l'application.

**Restriction de l'accès au courrier.** Safentreprise ne détient aucune
autorisation Microsoft de lecture du courrier à l'échelle du locataire du
Client. L'accès aux messages provient uniquement du rôle Exchange que le
Client attribue lui-même, délimité aux Boîtes raccordées. Le refus opposé aux
autres boîtes émane de Microsoft. Ce refus est **constaté avant tout
démarrage** de la Surveillance ; à défaut, aucun message n'est analysé.

**Une boîte retirée cesse d'être analysée.** Lorsque le Client retire une
boîte de sa sélection, les notifications la concernant sont refusées à
l'entrée, sans attendre l'expiration de l'abonnement Microsoft.

**Corps des messages.** Aucune interface, dans l'espace client comme ailleurs,
n'affiche le corps d'un message conservé. La table qui les contient n'est
accessible ni au Client ni aux Collaborateurs : aucune règle d'accès ne
l'autorise, et le droit de lecture est retiré aux rôles applicatifs. Purge
automatique à trente jours, et effacement immédiat dès qu'une restauration a
réussi.

**Minimisation à la source.** Huit champs demandés à Microsoft ; les pièces
jointes, les en-têtes bruts et les messages envoyés ne sont pas demandés.
Seule la longueur du texte analysé est conservée, non le texte.

**Réversibilité des modifications.** Le corps d'origine est sauvegardé avant
toute modification. Si cette sauvegarde échoue ou dépasse un mégaoctet, **le
message n'est pas modifié du tout**. Le retrait de l'avertissement reste
possible au-delà de trente jours, par des repères techniques posés à cet effet.

**Coordonnées bancaires masquées.** Un IBAN n'est jamais enregistré en entier.

**Fonctions internes réservées.** Les fonctions qui écrivent en base sont
exécutées avec des privilèges définis et réservées au rôle de service ; elles
sont retirées aux rôles anonyme et authentifié. Les routes internes exigent un
secret partagé.

**Authenticité des notifications Microsoft.** Le secret partagé d'un
abonnement est vérifié en base, dans la même opération que la mise en file, et
comparé à la valeur enregistrée plutôt qu'à celle annoncée par l'appelant.

**Localisation.** Base de données en France, exécution en Allemagne. Un
contrôle de diagnostic échoue si la région d'exécution cesse d'être dans
l'Union européenne.

**Purges automatiques.** Exécutées chaque nuit, sans intervention humaine,
selon les durées de l'annexe 1.

## Partie 2 — Limites connues, portées à la connaissance du Client

Ces limites ont la même valeur contractuelle que la partie 1. **Safentreprise
ne s'engage pas à les couvrir en l'état.**

**Pas de chiffrement applicatif du corps des messages.** La copie conservée
avant modification est enregistrée **en clair**. Le chiffrement au repos est
celui de l'hébergeur : il protège du vol de disque, pas d'un accès à la base.

**La clé technique d'exploitation permet d'accéder à ces corps.** Elle est
détenue par Safentreprise pour faire fonctionner et dépanner le Service.
L'inaccessibilité mentionnée en partie 1 vaut à l'égard du Client, des
Collaborateurs et de l'interface — **pas à l'égard de l'exploitant**.

**Aucune journalisation des accès.** Aucune table ne trace qui a lu quoi. Un
accès illégitime serait indétectable et indémontrable. C'est la limite qui
borne l'engagement de notification de l'article 11.

**Aucune limitation de débit** sur les routes internes.

**Aucune rotation des secrets**, ni procédure écrite de renouvellement.

**Aucune sauvegarde propre ni restauration testée.** Safentreprise s'appuie
sur les sauvegardes de la plateforme d'hébergement, dont l'étendue dépend de
l'offre souscrite et **n'a pas été vérifiée**. La reprise après incident est
une hypothèse, non un fait établi.

**Aucune séparation des rôles.** Voir article 5.

**Aucune validation humaine avant modification d'un message.** Une erreur du
moteur de détection produit une modification réelle dans la boîte du
destinataire, réversible dans les conditions de la partie 1.

---

---

# PARTIE B — Ce qui doit être tranché ou construit avant signature

**Cette partie n'est pas destinée à être annexée aux CGV.** Elle s'adresse au
juriste, et au dirigeant.

## B.1 — Obligations de l'article 28 que Safentreprise ne tient pas aujourd'hui

### 1. Registre des activités de traitement du sous-traitant (article 30.2)

**N'existe pas.** L'article 30.2 impose au sous-traitant de tenir un registre
des catégories de traitements effectués pour le compte de chaque responsable.
L'annexe 1 en contient la matière, mais aucun registre formel n'est tenu, ni
tenu à jour par client.

*Ce qu'il faut faire :* établir le registre. Une journée de travail, sans
développement. **À faire avant la signature du premier client.**

### 2. Notification de violation (article 28.3.f, renvoyant à l'article 33.2)

**Tenue partiellement.** L'engagement de notifier sous 48 heures est
réalisable. Mais l'obligation suppose de *pouvoir constater* une violation, et
**aucune journalisation des accès n'existe**. Un accès illégitime par un
détenteur de clé valide ne laisserait aucune trace.

L'article 11.2 le dit explicitement plutôt que de laisser croire à une
détection qui n'existe pas. **Il faut vérifier que cette rédaction est
acceptable pour un juriste**, et qu'elle ne s'analyse pas en une limitation de
responsabilité inopposable.

*Ce qu'il faut faire :* aucune procédure écrite de notification n'existe non
plus — ni destinataire, ni délai interne, ni modèle. À rédiger. Puis
journaliser les accès, qui est un développement à part entière.

### 3. Assistance aux droits des personnes (article 28.3.e)

**Tenue manuellement seulement.** Aucune fonction n'extrait, ne rectifie ni
n'efface les données d'une personne nommée : ces opérations supposent une
requête SQL écrite à la main par l'éditeur. Le droit de rectification n'est
ouvert par aucune règle d'accès en base.

Le délai de dix jours ouvrés de l'article 10.3 est un engagement réaliste pour
un client, **mais il ne l'est plus mécaniquement pour dix**. Aucun registre des
demandes reçues n'existe.

*Ce qu'il faut faire :* décider si l'on s'engage sur ce délai en l'état, ou si
l'on construit d'abord l'effacement en libre-service. **C'est une décision de
dirigeant, pas de juriste.**

### 4. Audits et inspections (article 28.3.h)

**Tenue, mais sans aucun élément de preuve indépendant.** Ni certification, ni
rapport d'audit tiers. L'article 14 le dit et n'en promet aucun. Un client
grand compte le refusera probablement ; un client PME s'en accommodera.

### 5. Effacement et restitution en fin de contrat (article 28.3.g)

**Tenue manuellement.** L'effacement fonctionne — la suppression d'un client
entraîne celle des données rattachées. **La restitution, en revanche, suppose
une extraction qui n'existe pas** : elle serait écrite à la main, au cas par
cas.

Le délai de trente jours de l'article 13 est tenable pour un client. Le point à
trancher est celui des **sauvegardes de l'hébergeur**, dont le cycle de
rétention n'a pas été vérifié : l'article 13 le mentionne, mais la durée exacte
reste inconnue.

*Ce qu'il faut faire :* vérifier la rétention des sauvegardes dans le tableau
de bord Supabase, et inscrire la durée réelle à l'article 13.

### 6. Sécurité (article 32)

Les quatre mesures que vous avez nommées — chiffrement applicatif,
journalisation, limitation de débit, rotation des secrets — **ne figurent dans
aucun engagement** de ce projet. Elles sont au contraire déclarées absentes à
l'annexe 3, partie 2.

**Un point demande une décision.** L'annexe 3 énonce des limites qu'un client
attentif lira comme des raisons de ne pas signer. C'est voulu, et c'est ce que
vous avez demandé. Mais il faut savoir que **ce document, en l'état, est un
argument commercial contre le produit** autant qu'un contrat. La réponse n'est
pas d'adoucir le texte : c'est de fermer les manques, en commençant par la
journalisation des accès et le chiffrement des corps.

### 7. Transferts hors Union européenne (article 8 du projet)

**Non vérifié.** L'article 8 affirme que les transferts vers Resend (États-Unis)
sont fondés sur les clauses contractuelles types. **Cette affirmation n'a pas
été vérifiée** : ni la conclusion effective des clauses, ni l'analyse d'impact
des transferts, ni l'éventuelle certification *Data Privacy Framework* de
Resend.

*Ce qu'il faut faire :* récupérer l'addendum de traitement de Resend et
vérifier ce sur quoi il repose. Si rien n'est en place, **l'article 8 est
faux** et doit être réécrit ou le sous-traitant remplacé par un prestataire
européen.

### 8. Responsabilité (article 15 du projet)

**Le point le plus exposé.** L'article 15 renvoie au plafond de responsabilité
de l'article 11 des CGV. Or l'article 82 du RGPD institue une responsabilité du
sous-traitant **envers la personne concernée**, à laquelle un plafond
contractuel conclu avec le responsable n'est pas opposable.

*Ce qu'il faut faire :* faire trancher par le conseil l'articulation entre les
deux. C'est la même question que celle déjà posée sur l'article 11 des CGV, et
elle doit être traitée en une seule fois.

## B.2 — Ordre de traitement recommandé

1. **Article 8** — vérifier les transferts vers Resend. Si rien n'est en place,
   le contrat contient une affirmation fausse.
2. **Article 15** — l'articulation du plafond avec l'article 82, en même temps
   que l'article 11 des CGV.
3. **Registre article 30.2** — à établir, une journée, sans code.
4. **Procédure de notification de violation** — à rédiger.
5. **Article 13** — vérifier la rétention des sauvegardes et inscrire la durée.
6. Le reste relève du produit, pas du droit.

## B.3 — Documents en attente de relecture juridique

| Document | Fichier | État |
|---|---|---|
| Conditions générales de vente et d'utilisation | `src/app/(legal)/cgv/page.tsx` (v1.3) | Points à valider dans `docs/CGV-A-VALIDER.md` |
| Contrat de sous-traitance (article 28) | `docs/DPA-A-VALIDER.md` (le présent projet, v0.1) | **Jamais relu.** Voir partie B ci-dessus |
| Analyse d'impact (AIPD) | `docs/AIPD.md` (v1.1) | Exacte sur les faits techniques ; qualifications juridiques non validées |
| Politique de confidentialité | `src/app/(legal)/politique-de-confidentialite/page.tsx` | Publiée. Non relue par un juriste |
| Mentions légales | `src/app/(legal)/mentions-legales/page.tsx` | Publiées. Non relues par un juriste |
