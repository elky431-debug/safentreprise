# Analyse d'impact relative à la protection des données — Safentreprise

**Traitement analysé** : analyse des messages reçus dans les boîtes Microsoft 365
raccordées, et annotation de ceux qui présentent les caractéristiques d'une fraude.

| | |
|---|---|
| Version | 1.0 |
| Date | 3 septembre 2026 |
| Auteur | El Fahim Yacine — Safentreprise |
| État du code analysé | branche `claude/graph-webhook`, commit `70964e1` |
| Format | Structure du logiciel PIA de la CNIL (contexte / principes / risques / validation) |

---

## Comment lire ce document

Cette AIPD est menée par **l'éditeur** sur son propre produit. La CNIL admet
cette pratique : elle évite que chaque client refasse le même travail
d'analyse technique. **Elle ne remplace pas l'AIPD du client.** Chaque
entreprise qui raccorde ses boîtes reste responsable de traitement et doit
compléter ce document avec ce qui lui est propre : sa finalité exacte, sa base
légale, l'information de ses salariés, la consultation de ses représentants du
personnel.

Les passages marqués **[CLIENT]** sont ceux auxquels l'éditeur ne peut pas
répondre à la place de son client.

Chaque affirmation technique renvoie au fichier et à la ligne qui la fondent.
**Quand une mesure n'existe pas, le document l'écrit.** Les manques sont
rassemblés en partie 4.

---

# PARTIE 1 — CONTEXTE

## 1.1 Description du traitement

Safentreprise se raccorde aux boîtes Microsoft 365 d'une entreprise cliente.
À chaque message reçu dans une boîte surveillée, Microsoft prévient
Safentreprise. Le service lit le message, l'analyse, et enregistre un verdict.
Si le message présente les caractéristiques d'une fraude, le service **modifie
le message dans la boîte du destinataire** : il insère un avertissement en tête
et pose une catégorie de couleur.

Le cheminement réel, tel qu'il est codé :

1. Microsoft envoie une notification → `src/app/api/microsoft/webhook/route.ts`
2. La notification est vérifiée et mise en file → `graph_file_attente`
3. Un programme dépile la file toutes les minutes → `src/app/api/microsoft/worker/route.ts`
4. Il demande le message à Microsoft, l'analyse, enregistre le verdict → `graph_analyses`
5. S'il y a alerte : sauvegarde du corps d'origine, puis pose de l'avertissement
6. Des tâches de nuit renouvellent les abonnements, réparent et purgent

## 1.2 Finalité

Détecter, avant que le destinataire n'agisse, deux fraudes précises :

- **la fraude au président** — un message se faisant passer pour un dirigeant
  demande un virement urgent et confidentiel ;
- **la fraude au fournisseur** — un message annonce un changement de
  coordonnées bancaires.

Le service **n'est pas** un antivirus, un antispam, ni un outil de surveillance
des salariés. Il ne produit aucune statistique par personne, aucun indicateur
de comportement individuel. Cette absence est vérifiable : aucune table ne
regroupe de données par salarié à des fins de mesure.

## 1.3 Enjeux

**Pour l'entreprise** : une fraude au président réussie coûte en moyenne
plusieurs dizaines de milliers d'euros et n'est presque jamais récupérable.

**Pour les personnes** : le service lit le contenu de messages professionnels,
qui peuvent contenir des éléments personnels, médicaux, syndicaux ou
disciplinaires. Il modifie aussi le courrier reçu, ce qui est inhabituel et
mérite d'être expliqué aux personnes concernées.

**Pour l'éditeur** : une erreur de cloisonnement exposerait les messages d'une
entreprise à une autre. Une modification irréversible mal faite abîmerait
définitivement le courrier d'un client.

## 1.4 Données traitées

### Enregistrées en base

| Catégorie | Données précises | Table | Durée | Fondement (code) |
|---|---|---|---|---|
| **Contenu de message** | Corps complet du message, avant modification. HTML ou texte. Plafonné à 1 Mo | `graph_corps_originaux.contenu` | **30 jours**, et effacé dès que la modification est défaite | `20260902_corps_originaux.sql:24-41`, purge `:154-186` |
| **Contenu de message** | Objet du message | `graph_analyses.objet` | 12 mois si alerte, 30 jours sinon | `20260906_conservation.sql:181-230` |
| **Contenu de message** | Nom lu dans le bloc de signature | `graph_analyses.nom_signe` | idem | `20260826_graph_analyses.sql:47` |
| **Contenu de message** | Coordonnées bancaires **masquées** (4 premiers + 4 derniers caractères) | `graph_analyses.signaux` | idem | `detection-rules.js:665-676` |
| **Identifiants** | Nom affiché et adresse de l'expéditeur | `graph_analyses.expediteur_nom`, `.expediteur_email` | idem | `20260826:45-46` |
| **Identifiants** | Adresse du premier destinataire | `graph_analyses.employe_email` | idem | `worker/route.ts:573` |
| **Annuaire** | Nom et adresse de **chaque collaborateur** du locataire Microsoft | `annuaire_personnes.nom`, `.email` | Instantané remplacé à chaque rafraîchissement ; **aucune purge par ancienneté** | `20260827:89-98`, remplacement `:172-179` |
| **Techniques** | Adresses des boîtes surveillées | `boites_surveillees.upn` | Durée du contrat | `20260825:49` |
| **Techniques** | Identifiants de messages en file | `graph_file_attente.message_id`, `.resource_brut` | 7 j (traitée), 30 j (échec), jamais si en attente | `20260906:246-259` |
| **Verdict** | Score 0-100, niveau, motifs du signalement | `graph_analyses.score`, `.niveau`, `.raisons` | 12 mois si alerte, 30 jours sinon | `20260906:181-230` |
| **Trace d'action** | Catégorie posée, date de pose de l'avertissement, état, erreur | `graph_analyses.categorie`, `.banniere_posee_at`, `.action_etat` | idem, **sauf si l'avertissement est encore en place** : conservé sans limite | `20260906:203-210` |
| **Journal technique** | Corps des réponses HTTP internes, contenant des adresses de boîtes | `net._http_response` | 7 jours | `20260906:277-296` |

### Traitées en mémoire seulement, jamais écrites

| Donnée | Preuve |
|---|---|
| Le corps du message pendant l'analyse — seule sa **longueur** est enregistrée | `worker/route.ts:549-586`, champ `p_longueur_texte` |
| Le texte converti que lit le moteur de détection | idem |
| Les destinataires au-delà du premier | `worker/route.ts:573` ne prend que `[0]` |

### Jamais demandées à Microsoft

Le service demande exactement sept champs :
`id, subject, receivedDateTime, isDraft, categories, from, toRecipients, body`
(`src/lib/microsoft/graph.ts:501`).

Ne figurent donc pas dans la demande, et ne sont pas « filtrées après coup » :

- les **pièces jointes**, ni leur contenu ni leur nom ;
- les **en-têtes techniques bruts** ;
- les messages **envoyés** — seule la boîte de réception est abonnée
  (`scripts/graph-abonner.mjs:222`, ressource `mailFolders('inbox')/messages`).

### Données d'autres traitements présentes dans la même base

Hors périmètre de cette AIPD mais dans la même base, donc exposées aux mêmes
risques d'accès : `menaces_detectees` (produit d'extension abandonné, purge
12 mois), `activations_extension` (adresse professionnelle + identifiant de
poste, **aucune purge**), `demandes_demo` (nom, entreprise, e-mail, téléphone,
message libre, **aucune purge**), `score_history` (scores par entreprise, sans
donnée personnelle).

## 1.5 Destinataires

| Qui | Ce qu'il reçoit | Où |
|---|---|---|
| **Supabase** (AWS) | La totalité des données enregistrées | **France**, région AWS eu-west-3 (Paris) |
| **Netlify** | Tout ce qui transite pendant une requête, **corps des messages compris**, en mémoire seulement | **Allemagne**, région AWS eu-central-1 (Francfort) |
| **Microsoft** | Source des données. Le service y écrit les modifications | Locataire du client |
| **Resend** | Messages de simulation ; alertes techniques internes **réduites à des compteurs et à la nature du problème** | États-Unis |
| **SMS Partner** | Numéros de téléphone, si le canal SMS est utilisé | France |
| **Stripe** | Données de facturation, le cas échéant | États-Unis / UE |

**Microsoft n'est pas un sous-traitant de Safentreprise** : c'est le service du
client, choisi par lui.

Le mail d'alerte interne ne contient ni objet, ni adresse d'expéditeur, ni
adresse de boîte — l'agrégation est faite en base avant l'envoi
(`20260906_conservation.sql:70-90`), et un test vérifie qu'aucune chaîne
sensible présente en base ne s'y retrouve.

## 1.6 Supports

**Matériels** — Aucun matériel propre. Serveurs AWS loués via Supabase (Paris)
et Netlify (Francfort). Poste de travail de l'éditeur pour le développement et
l'exploitation.

**Logiciels** — Application Next.js 16 ; base PostgreSQL (Supabase) ;
ordonnanceur `pg_cron` et client HTTP `pg_net` dans la base ; moteur de
détection en JavaScript sans entrée/sortie (`src/lib/detection/detection-rules.js`) ;
API Microsoft Graph.

**Réseaux** — Internet public, HTTPS. Les appels internes déclenchés par la
base sortent vers l'application par HTTPS avec un secret partagé en en-tête
(`20260830_planification.sql:80-84`).

**Personnes** — Une seule personne côté éditeur : le dirigeant, qui est aussi
le développeur et l'exploitant. **[CLIENT]** Côté client : l'administrateur
Microsoft 365 qui autorise le raccordement, et le dirigeant qui consulte les
alertes.

**Papier** — Aucun support papier.

**Point d'attention.** L'éditeur étant une personne seule, il n'y a ni
séparation des rôles, ni double validation, ni relecture par un tiers des
opérations sensibles. C'est une caractéristique structurelle du traitement,
qui pèse sur les trois risques analysés en partie 3.

---

# PARTIE 2 — PRINCIPES FONDAMENTAUX

## 2.1 Proportionnalité et nécessité

### Finalité déterminée, explicite et légitime

**Respecté.** La finalité est étroite : détecter deux types de fraude nommés.
Elle est écrite dans la politique de confidentialité, point 2.5.

Le moteur ne cherche que cela : les détecteurs codés sont l'usurpation
d'identité, le changement de coordonnées bancaires et le typosquattage de
domaine (`detection-rules.js`, fonctions `detecterIdentite`,
`detecterChangementRib`, `detecterDomaine`). Il n'y a aucun détecteur de
productivité, d'opinion, ni de contenu privé.

### Base légale

**[CLIENT] — Point que l'éditeur ne peut pas trancher.** La base légale est
choisie par l'entreprise cliente, responsable de traitement. Les deux
candidates habituelles sont l'intérêt légitime (art. 6.1.f) et l'obligation
légale de sécurité (art. 6.1.c, combiné à l'art. 32).

Ce que l'éditeur peut fournir : la description exacte du traitement, ci-dessus,
pour nourrir le test de mise en balance.

### Minimisation

**Respecté sur les points vérifiables.**

- Sept champs demandés à Microsoft, pas un de plus (`graph.ts:501`).
- Pièces jointes et en-têtes bruts jamais demandés.
- Seule la boîte de réception est abonnée, jamais les messages envoyés.
- Le corps n'est copié **que** juste avant une modification, jamais pour
  l'analyse (`worker/route.ts` : la sauvegarde n'intervient que dans le chemin
  d'action, après un verdict d'alerte).
- Les IBAN sont tronqués avant enregistrement (`detection-rules.js:672`).
- Le mail d'alerte interne n'emporte que des compteurs.
- Le contenu du corps n'est jamais recopié dans les motifs : les mots-clés
  enregistrés proviennent d'une liste fixe, pas d'extraits libres du message
  (`detection-rules.js:1374`, fonction `motsClesPresents`).

**Non respecté sur un point, et il faut le dire.** Une ligne est enregistrée
**pour chaque message analysé**, y compris quand le verdict est « rien à
signaler » (`worker/route.ts:567`, appel inconditionnel). Cette ligne contient
l'objet, l'expéditeur et le destinataire d'un message anodin. La durée courte
retenue — 30 jours — limite l'exposition, mais ne supprime pas la collecte.
Une conception strictement minimisante n'enregistrerait rien pour un message
sans alerte, ou seulement un compteur.

### Qualité des données

**Partiellement traité.** L'annuaire est rafraîchi et une personne disparue de
l'annuaire Microsoft sort de la table (`20260827:172-179`). Un garde-fou
empêche un annuaire vide de tout effacer sur un appel Graph raté
(`20260827:171`).

**Aucun mécanisme de correction** n'existe pour le reste : ni pour un verdict
erroné, ni pour une donnée inexacte. Le seul « correctif » disponible est la
restauration du message et la suppression de la ligne, faite à la main.

### Durées de conservation

**Traité depuis la migration `20260906`.** Voir le tableau du point 1.4.

Cinq purges automatiques existent :

| Tâche | Cible | Heure (UTC) | Fichier |
|---|---|---|---|
| `purge-corps-originaux` | Corps de messages, 30 j | 03:15 | `20260902:180-184` |
| `purge-menaces-12-mois` | `menaces_detectees`, 12 mois | 03:30 | `20260821:92-96` |
| `purge-analyses` | Alertes 12 mois, analyses 30 j | 03:45 | `20260906:322-323` |
| `purge-file-graph` | File d'attente | 03:50 | `20260906:324-325` |
| `purge-reponses-http` | Journaux HTTP, 7 j | 03:55 | `20260906:326-327` |

**Une exception volontaire** : la ligne d'un message qui porte encore un
avertissement non retiré n'est jamais purgée (`20260906:203-210`). Sans elle,
plus rien n'indiquerait qu'un message a été modifié, ni ne permettrait de le
défaire. C'est un arbitrage assumé entre minimisation et réversibilité.

**Trois tables restent sans purge** : `annuaire_personnes` (par ancienneté),
`activations_extension`, `demandes_demo`.

## 2.2 Droits des personnes

### Information

**[CLIENT] — c'est au client d'informer ses salariés.** L'éditeur fournit la
politique de confidentialité (point 2.5) et, sur demande, un texte type.

**Ce qui n'existe pas** : aucun mécanisme technique ne vérifie que
l'information a été donnée avant le raccordement. Un client peut brancher ses
boîtes sans avoir prévenu personne. La colonne prévue pour tracer le
consentement administrateur, `microsoft_tenants.consenti_par`
(`20260825:26`), **n'est écrite par aucun code** — elle est vide.

### Consentement

Sans objet entre l'éditeur et les salariés : le consentement n'est pas la base
légale envisagée, et ne pourrait pas l'être valablement dans une relation de
travail. **[CLIENT]** L'autorisation qui compte techniquement est celle de
l'administrateur Microsoft 365, donnée une fois.

### Accès

**Partiellement possible.** Le dirigeant client accède en lecture aux
résultats d'analyse de son entreprise, via les politiques RLS
(`20260826:88-89`).

**Ce qui n'existe pas** : aucun écran ne permet d'extraire les données d'une
personne nommée. Une demande d'accès suppose une requête SQL manuelle de
l'éditeur.

### Rectification

**N'existe pas.** Les politiques RLS n'accordent que `SELECT` sur
`graph_analyses`, `annuaire_personnes` et `boites_surveillees`. Aucun écran, et
aucun droit en base, ne permet à un client de corriger une donnée.

### Effacement

**N'existe pas en libre-service.** Toute demande passe par une intervention
manuelle de l'éditeur. La politique de confidentialité le dit explicitement
plutôt que de laisser croire le contraire.

Deux limites tiennent à la nature du traitement :

- l'effacement ne peut pas porter sur les messages eux-mêmes, qui appartiennent
  à l'entreprise et sont hébergés chez Microsoft ;
- la ligne d'un message annoté est conservée tant que l'annotation n'a pas été
  retirée : c'est la seule trace permettant de la défaire. Il faut retirer
  l'annotation d'abord, effacer ensuite.

### Opposition

**[CLIENT]** Le droit d'opposition s'exerce auprès de l'employeur.
Techniquement, une boîte peut être retirée de la surveillance
(`boites_surveillees.actif = false`), ce qui l'exclut de toutes les fonctions
de traitement. **Aucun écran ne permet de le faire** : c'est une mise à jour
SQL manuelle.

### Sous-traitance

Safentreprise est sous-traitant. Les sous-traitants ultérieurs sont listés au
point 1.5 et dans la politique de confidentialité, point 3.1.

**Ce qui n'existe pas** : le contrat de sous-traitance au sens de l'article 28
n'est pas rédigé à ce jour. C'est un manque contractuel, pas technique, et il
doit être comblé avant la première vente.

---

# PARTIE 3 — RISQUES

Méthode CNIL : gravité et vraisemblance sont estimées sur quatre niveaux —
négligeable, limitée, importante, maximale.

## 3.1 Accès illégitime aux données

### Impacts pour les personnes

Le corps d'un message professionnel peut contenir un arrêt de travail, un
courrier d'avocat, une candidature, un conflit syndical, une négociation
salariale. Un accès illégitime à `graph_corps_originaux` exposerait ce contenu
en clair.

Un accès à `graph_analyses` exposerait, sur douze mois, qui écrit à qui, sur
quels sujets — soit une cartographie des relations professionnelles d'une
entreprise. Un accès à `annuaire_personnes` livrerait l'organigramme complet,
c'est-à-dire précisément ce dont un fraudeur a besoin.

**Gravité : importante.** Le contenu des messages relève de la vie privée et
peut révéler des données sensibles au sens de l'article 9, sans que le
traitement les recherche.

### Sources de risque

- Un attaquant externe visant la base ou l'application.
- Un client cherchant à voir les données d'un autre client.
- L'éditeur lui-même : accès technique total, sans contre-pouvoir.
- Un sous-traitant (Supabase, Netlify) — accès d'exploitation.
- Une fuite de secret : les identifiants d'exploitation ont circulé en clair
  dans des échanges de développement.

### Menaces réalistes, tirées de l'architecture

1. **Vol de la clé `service_role`.** Elle contourne toute la RLS. Elle est
   posée en variable d'environnement Netlify et lue par le worker
   (`worker/route.ts:103`). Qui l'obtient lit toute la base, tous clients
   confondus.
2. **Vol du secret worker.** Il ouvre `/api/microsoft/worker`,
   `/api/microsoft/maintenance` et `/api/veille`. Il est aussi stocké **en
   clair** dans `parametres_systeme` (`20260830:49`), aux côtés de la clé
   Resend (`20260905:448`).
3. **Défaut de cloisonnement.** Toute la séparation entre clients repose sur
   une seule fonction : `get_my_company_id()` (`supabase/schema.sql:259`),
   qui résout `auth.uid()` vers une entreprise. 54 politiques en dépendent.
   Une erreur dans cette fonction exposerait chaque client à tous les autres.
4. **Vol du secret client Azure.** Il donne accès aux boîtes Microsoft
   elles-mêmes, indépendamment de Safentreprise.
5. **Notification forgée.** Écartée : le webhook vérifie le `clientState`
   dans la même requête SQL que la mise en file, et compare avec la valeur en
   base plutôt qu'avec celle annoncée (`20260825:162-199`).

### Mesures existantes

| Mesure | Où |
|---|---|
| RLS active sur toutes les tables du traitement, cloisonnement par entreprise | `20260825:136-154`, `20260826:85-89`, `20260827:56-110` |
| `graph_corps_originaux` : **aucune politique de lecture, `REVOKE ALL`** — inaccessible par l'API à quiconque, client compris | `20260902:45-50` |
| Fonctions du worker en `SECURITY DEFINER`, réservées à `service_role`, retirées à `anon` et `authenticated` | `20260902:195-205`, `20260906:301-310` |
| `parametres_systeme` et `veille_etat` : RLS active **sans aucune politique** — donc invisibles par l'API | `20260830:38-41`, `20260905:53-56` |
| Vérification du `clientState` côté base, jamais côté notification | `20260825:162-199` |
| Secret partagé exigé sur les trois routes internes | `worker:1027`, `maintenance:808`, `veille:391` |
| Aucun fichier de secret versionné (`.gitignore` couvre `.env*`) | `.gitignore:33-35` |
| Sept champs demandés à Microsoft, pièces jointes exclues | `graph.ts:501` |
| L'exécution est en Union européenne, et le diagnostic échoue si la région ne l'est plus | `worker/route.ts`, contrôle « région d'exécution » |

### Ce qui n'existe pas

- **Aucun chiffrement applicatif** du corps des messages. La colonne `contenu`
  est du texte clair. Le chiffrement au repos est celui d'AWS, pas celui de
  Safentreprise : il protège du vol de disque, pas d'un accès à la base.
- **Aucune journalisation des accès.** Aucune table ne trace qui a lu quoi.
  Une consultation illégitime par l'éditeur ne laisserait aucune trace, et
  serait donc indétectable et indémontrable.
- **Aucune limitation de débit** sur les routes internes.
- **La comparaison des secrets n'est pas à temps constant**
  (`fourni === attendu`). Théorique sur un réseau public, mais réel.
- **Aucune rotation** des secrets, ni procédure écrite.
- **Aucune authentification à deux facteurs imposée** par le code sur les
  comptes Supabase, Netlify et Azure — c'est un réglage de compte, à vérifier
  hors code.

### Estimation

**Gravité : importante.** Contenu de messages professionnels en clair,
organigramme complet, cartographie des échanges sur douze mois.

**Vraisemblance : limitée.** Les mesures de cloisonnement sont réelles et
vérifiées, la surface exposée est étroite (trois routes, un webhook), et les
secrets ne sont pas versionnés. Mais : les identifiants d'exploitation ont
circulé en clair et n'ont pas été renouvelés, il n'existe aucune journalisation
qui permettrait de détecter un accès, et une seule personne détient tout.
Sans rotation des secrets, cette estimation serait à relever à **importante**.

## 3.2 Modification non désirée des données

### Impacts pour les personnes

**Ce risque est particulier à ce produit : le traitement modifie délibérément
le courrier reçu.** Une modification ratée abîme le message professionnel
d'une personne, dans sa propre boîte.

Trois formes :

- **Faux positif** — un message légitime, d'un vrai fournisseur, est marqué
  comme frauduleux. Le destinataire se méfie à tort, la relation commerciale
  en pâtit, et le message reste défiguré.
- **Modification non défaite** — l'avertissement ne peut plus être retiré, le
  message est altéré de façon permanente.
- **Faux négatif** — la fraude passe. L'impact n'est pas sur la personne mais
  sur l'entreprise ; il est néanmoins l'enjeu principal du produit.

### Sources de risque

- Une erreur du moteur de détection.
- Une panne au milieu d'une modification.
- L'éditeur, lors d'un déploiement ou d'une intervention manuelle.
- Un attaquant qui obtiendrait le secret worker : il pourrait déclencher des
  modifications de messages.

### Menaces réalistes

1. **Modification appliquée sans copie de sauvegarde.** Traitée : la
   sauvegarde doit réussir avant toute écriture, sinon le message n'est pas
   modifié du tout (`maintenance/route.ts`, chemin `sauvegarder_corps_graph`
   suivi d'un abandon si le retour n'est ni `sauvegarde` ni `deja-sauvegarde`).
2. **Écrasement de l'original par une version déjà annotée.** Traitée : la
   sauvegarde refuse d'écraser une copie existante et refuse un contenu qui
   porte déjà les marqueurs (`20260902:77-96`).
3. **Message trop volumineux.** Traitée : au-delà de 1 Mo la sauvegarde est
   refusée, et le message n'est pas modifié (`20260902:100-101`).
4. **Avertissement posé mais introuvable ensuite.** Traitée : après écriture,
   le message est relu ; si l'avertissement n'y est pas, le corps d'origine est
   réécrit et l'état `annulee-non-verifiable` est enregistré.
5. **Alerte sans avertissement, passée inaperçue.** Traitée : la vue
   `alertes_sans_banniere` doit rester vide, et le mail de veille prévient
   (`20260831`, `20260905`).
6. **Perte de la copie avant retrait.** Non traitée. Au-delà de 30 jours, le
   retrait par découpe fonctionne toujours, mais un message reçu en texte
   simple restera au format HTML. La mise en forme diffère de l'original.

### Mesures existantes

| Mesure | Où |
|---|---|
| Sauvegarde obligatoire avant toute écriture ; échec ⇒ message non modifié | `20260902:60-115` |
| Refus d'écraser une copie existante ou un corps déjà annoté | `20260902:77-96` |
| Relecture après écriture, et retour en arrière si l'avertissement est absent | `worker/route.ts:429-432` |
| Deux marqueurs encadrant l'avertissement, permettant la découpe | `banniere.ts`, `MARQUEUR_DEBUT` / `MARQUEUR_FIN` |
| Commande de restauration | `npm run graph:restaurer` |
| Vue `alertes_sans_banniere`, qui doit rester vide | `20260831` |
| Purge qui ne supprime jamais la ligne d'un message encore annoté | `20260906:203-210` |
| Abonnement sur `created` seulement : le service ne réagit pas à sa propre modification, donc pas de boucle | `graph.ts:319`, raisonnement `:294-297` |
| Calibrage anti-faux-positif figé par 16 cas de référence et une empreinte octet à octet | `npm run moteur:empreinte` |
| 73 vérifications sur la pose et le retrait de l'avertissement | `npm run banniere:test` |

### Ce qui n'existe pas

- **Aucune validation humaine** avant modification. La pose est automatique dès
  que le score dépasse le seuil.
- **Aucune mesure du taux de faux positifs en production.** Les 16 cas de
  référence sont des cas de test, pas des mesures réelles.
- **Aucun moyen pour le destinataire de signaler une erreur** depuis le message.
- **Aucun retrait en masse** : `graph:restaurer` traite un message à la fois.
- **La conversion texte → HTML n'est pas exactement réversible** au-delà de
  30 jours.

### Estimation

**Gravité : importante.** La modification est visible par le destinataire et
ses correspondants, elle porte sur un document professionnel, et elle peut
devenir permanente. Un faux positif sur un vrai fournisseur nuit à une relation
commerciale réelle.

**Vraisemblance : limitée.** La chaîne de réversibilité est complète et
testée, les garde-fous se déclenchent avant l'écriture plutôt qu'après, et la
non-régression du moteur est vérifiée à chaque modification. Mais la pose est
entièrement automatique, sans validation ni mesure du taux d'erreur réel en
production.

## 3.3 Disparition des données

### Impacts pour les personnes

Faible pour les personnes concernées : elles ne dépendent pas de ces données.
Les messages eux-mêmes restent chez Microsoft et ne sont jamais déplacés.

**Une exception, et elle est sérieuse.** Si la copie du corps d'origine
disparaît alors que le message est encore annoté, la remise en état exacte
devient impossible. La personne garde un message durablement modifié.

### Sources de risque

- Panne ou perte de données chez Supabase.
- Erreur d'exploitation : une purge trop large, un `DELETE` manuel.
- Une migration défectueuse.
- Une panne prolongée du service, pendant laquelle des messages frauduleux ne
  sont pas analysés.

### Menaces réalistes

1. **Purge trop large.** Une erreur dans une condition effacerait des données
   encore utiles. Réduite : les purges ont été exécutées et vérifiées sur une
   base locale avant livraison, avec des cas couvrant chaque branche.
2. **Perte de la copie du corps avant retrait.** Réelle, décrite en 3.2.
3. **Arrêt silencieux de la surveillance.** C'était le cas : un abonnement
   Microsoft est mort après dix échecs sans que rien ne le signale, et la
   boîte a cessé d'être surveillée. Traité depuis : vue `abonnements_en_alerte`,
   compteur dans le diagnostic, alerte par mail
   (`20260904`, `20260905`).
4. **Panne prolongée, messages jamais analysés.** Traitée : Microsoft
   n'insiste que 4 heures ; un rattrapage par delta compare l'état réel de la
   boîte à ce qui a été vu (`maintenance/route.ts`, fonction `rattraper`).
5. **Travail perdu dans la file.** Traitée : les lignes en attente ne sont
   jamais purgées (`20260906:252-257`).

### Mesures existantes

| Mesure | Où |
|---|---|
| Rattrapage par delta, indépendant des notifications | `maintenance/route.ts` |
| Renouvellement automatique des abonnements, 24 h avant échéance | `maintenance/route.ts:107` |
| Notifications de cycle de vie Microsoft traitées | `webhook/route.ts` |
| Vue `abonnements_en_alerte`, qui doit rester vide | `20260904` |
| Alerte par mail, avec relance espacée et voie de secours indépendante de l'application | `20260905` |
| Diagnostic complet sans rien consommer | `/api/microsoft/worker?verifier=1` |
| Purges vérifiées sur base locale avant livraison, cas par cas | tests `20260906` |
| Les lignes en attente ne sont jamais purgées | `20260906:252-257` |

### Ce qui n'existe pas

- **Aucune sauvegarde propre à Safentreprise.** Ce qui existe est la sauvegarde
  de la plateforme Supabase, dont l'étendue dépend de l'offre souscrite.
  **Non vérifié dans le code — à confirmer dans le tableau de bord Supabase.**
- **Aucune restauration n'a jamais été testée.** Une sauvegarde jamais
  restaurée n'est pas une sauvegarde vérifiée.
- **Aucun plan de reprise écrit.**
- **Aucune supervision de la place disque** ni de la croissance des tables.

### Estimation

**Gravité : limitée.** Les données perdues sont, pour l'essentiel, des
verdicts et des métadonnées, reconstituables à partir des messages qui, eux,
restent chez Microsoft. Le cas grave — copie perdue et message resté annoté —
est borné à 30 jours et laisse la découpe par marqueurs.

**Vraisemblance : limitée.** Les filets contre l'arrêt silencieux sont en
place et testés. Mais aucune restauration n'a jamais été essayée, et le
comportement réel des sauvegardes n'est pas vérifié.

## 3.4 Tableau récapitulatif

| Risque | Gravité | Vraisemblance | Ce qui pèse le plus |
|---|---|---|---|
| Accès illégitime | Importante | Limitée | Secrets ayant circulé et non renouvelés ; aucune journalisation des accès |
| Modification non désirée | Importante | Limitée | Pose automatique, sans validation ni mesure du taux d'erreur réel |
| Disparition | Limitée | Limitée | Restauration jamais testée ; sauvegardes non vérifiées |

---

# PARTIE 4 — VALIDATION

## 4.1 Mesures complémentaires recommandées

Par ordre de priorité. Aucune n'est implémentée à ce jour.

### À faire avant la première vente

1. **Renouveler tous les secrets d'exploitation.** Clé Supabase `service_role`,
   secret client Azure, secret worker, mot de passe Postgres. Ils ont circulé
   en clair. C'est la mesure la moins coûteuse et la plus efficace du document.
   *Réduit : accès illégitime.*

2. **Rédiger le contrat de sous-traitance (art. 28).** Obligation légale, et
   premier document que réclamera le DPO d'un client sérieux.

3. **Journaliser les accès aux données sensibles.** Au minimum toute lecture de
   `graph_corps_originaux` et tout appel de `corps_original_graph`. Sans cela,
   un accès illégitime est indétectable et l'éditeur ne peut pas prouver le
   contraire. *Réduit : accès illégitime.*

4. **Vérifier et documenter les sauvegardes Supabase**, puis **exécuter une
   restauration d'essai** sur un projet de test. Une sauvegarde non restaurée
   n'est pas vérifiée. *Réduit : disparition.*

5. **Activer l'authentification à deux facteurs** sur Supabase, Netlify, Azure
   et GitHub, et le noter dans ce document. *Réduit : accès illégitime.*

### À faire avant dix clients

6. **L'effacement en libre-service.** Une fonction
   `effacer_donnees_collaborateur(email)`, qui refuse les lignes portant un
   avertissement encore en place et le dit, un écran de confirmation avec
   aperçu, un reçu daté, et un registre des demandes. *Réduit : accès
   illégitime ; comble le droit à l'effacement.*

7. **Mesurer les faux positifs en production.** Un moyen, pour le client, de
   marquer une alerte comme erronée. Sans mesure, il est impossible de savoir
   si le calibrage tient sur des données réelles. *Réduit : modification non
   désirée.*

8. **Chiffrer le corps des messages en base**, avec une clé qui n'est pas dans
   la base. Un accès à la base ne suffirait plus à lire les messages.
   *Réduit : accès illégitime.*

9. **Purger `annuaire_personnes`, `activations_extension` et `demandes_demo`.**
   *Comble la limitation des durées.*

10. **Écrire l'organigramme du raccordement** : qui autorise, qui vérifie
    l'information des salariés, quelle trace en est gardée. Remplir
    `microsoft_tenants.consenti_par`, aujourd'hui vide.

### À envisager

11. **Un mode « signalement seul »** — catégorie posée, message non modifié.
    Il supprimerait entièrement le risque de modification non désirée pour les
    clients qui le préfèrent. Le code le permet déjà en partie : `GRAPH_ACTIONS`
    a un mode `off`, mais il désactive tout, catégorie comprise.

12. **Limitation de débit** sur les routes internes.

13. **Comparaison des secrets à temps constant** (`timingSafeEqual`).

## 4.2 Ce qui reste non couvert aujourd'hui

**Techniquement.**

| Manque | Conséquence |
|---|---|
| Aucune journalisation des accès | Un accès illégitime est indétectable et indémontrable |
| Corps des messages en clair en base | Un accès à la base donne accès aux messages |
| Aucune sauvegarde propre, aucune restauration testée | La reprise après incident est une hypothèse, pas un fait |
| Effacement et rectification manuels | Les droits sont exerçables, mais lentement et sans trace |
| Aucune mesure des faux positifs | Le calibrage n'est validé que sur des cas de test |
| Aucune validation avant modification | Une erreur du moteur devient une modification réelle |
| Secrets ayant circulé, non renouvelés | Le risque d'accès est plus élevé qu'il ne devrait |

**Organisationnellement.**

- Une seule personne détient tous les accès. Ni séparation des rôles, ni
  contrôle par un tiers, ni continuité en cas d'indisponibilité.
- Aucune procédure écrite de notification de violation (art. 33-34) : ni
  destinataire, ni délai, ni modèle.
- Aucun registre des demandes d'exercice des droits.

**Juridiquement.**

- Le contrat de sous-traitance (art. 28) n'est pas rédigé.
- **Cette AIPD n'a pas été relue par un juriste.** Elle est fondée sur la
  lecture du code, ce qui la rend exacte sur les faits techniques. La
  qualification juridique — base légale, caractère obligatoire de l'AIPD,
  qualification de Microsoft, portée des transferts — doit être validée par un
  professionnel avant diffusion à un client.

## 4.3 Points que le client doit traiter lui-même

Récapitulatif des passages **[CLIENT]** :

| Sujet | Ce que le client doit faire |
|---|---|
| Base légale | La choisir et la documenter (intérêt légitime ou obligation de sécurité) |
| Test de mise en balance | Le mener, si l'intérêt légitime est retenu |
| Information des salariés | Informer avant le raccordement, garder une trace |
| Représentants du personnel | Les consulter lorsque la loi l'impose |
| Périmètre | Décider quelles boîtes sont surveillées, et pourquoi celles-là |
| Registre des traitements | Y inscrire ce traitement |
| Sa propre AIPD | Compléter celle-ci avec son contexte |
| Exercice des droits | Recevoir les demandes de ses salariés, et solliciter l'éditeur |

## 4.4 Avis

**En l'état, le traitement ne peut pas être mis en service chez un client sans
les mesures 1 à 5 du point 4.1.** Le renouvellement des secrets et le contrat
de sous-traitance sont bloquants ; la journalisation des accès et la
vérification des sauvegardes sont attendues au premier audit sérieux.

Les mesures déjà en place sont réelles et vérifiables : le cloisonnement par
entreprise, l'inaccessibilité du corps des messages, la chaîne complète de
réversibilité, les durées de conservation automatiques, et les deux vues de
contrôle qui rendent une panne visible. Elles constituent une base sérieuse.

Les risques résiduels tiennent moins à l'architecture qu'à l'exploitation : une
personne seule, sans journalisation, sans sauvegarde vérifiée, avec des secrets
qui ont circulé.

---

## Suivi des révisions

| Version | Date | Objet |
|---|---|---|
| 1.0 | 2026-09-03 | Rédaction initiale, sur le code au commit `70964e1` |

**À réviser** : à chaque changement de finalité, de catégorie de données, de
durée de conservation, de sous-traitant ou de région d'hébergement — et au
minimum une fois par an.
