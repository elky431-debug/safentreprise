# CGV Safentreprise — points à faire valider par un juriste

**À remettre tel quel au conseil.** Ce document accompagne les conditions
générales publiées sur `https://safentreprise.com/cgv` (fichier
`src/app/(legal)/cgv/page.tsx`, version 1.2 du 4 septembre 2026).

**Priorité de relecture.** Si le temps du conseil est compté, l'ordre est :
**article 11** (réécrit, non relu, c'est là que le risque se concentre), puis
**article 15** (une qualification juridique affirmée sans vérification), puis
**article 8**.

---

## Contexte en une page

Safentreprise était un outil de **simulation de phishing** : des faux messages
d'entraînement envoyés aux salariés d'une entreprise cliente, avec formation et
score de risque. Les CGV ont été rédigées pour ce produit, en version 1.0.

Le produit a changé de nature. Il se raccorde désormais aux **boîtes
Microsoft 365** de l'entreprise cliente, **lit le contenu des messages reçus**,
et **modifie dans la boîte du destinataire** ceux qu'il juge frauduleux — un
avertissement est inséré en tête du message.

La version 1.2 des CGV décrit ce nouveau service (article 4.3) et les
obligations qui en découlent pour le client (article 9). **Ces parties reposent
sur des faits techniques vérifiés dans le code et peuvent être tenues pour
exactes.** Elles n'ont pas été relues par un juriste.

**Trois articles portent des qualifications juridiques, non des descriptions
du produit.** Les articles 8 et 15 n'ont pas été touchés. **L'article 11 a été
réécrit le 4 septembre sur instruction du dirigeant** — il est signalé comme
tel, et c'est celui qui appelle la relecture la plus attentive.

---

## 1. Article 8 — Nature de l'engagement

**Ce qui a changé sous cet article.** Le service promet de détecter deux
fraudes précises (fraude au président, fraude au fournisseur) et modifie le
courrier des salariés en conséquence.

**Les questions.**

- L'obligation de moyens, telle qu'elle est rédigée, couvre-t-elle un outil
  qui **agit** sur le courrier plutôt que de seulement l'analyser ?
- Le service peut ne pas signaler un message frauduleux. Si un client subit
  un virement frauduleux sur un message passé au travers, la rédaction
  actuelle protège-t-elle suffisamment ?
- Faut-il une clause distincte pour les faux positifs (message légitime
  marqué à tort) et pour les faux négatifs (fraude non détectée) ? Les deux
  n'ont ni la même victime ni le même préjudice.

## 2. Article 11 — Limitation de responsabilité

> **Cet article a été RÉÉCRIT le 4 septembre 2026**, sur instruction du
> dirigeant, qui a arrêté lui-même le plafond et les exclusions. Il n'a pas été
> relu par un juriste. C'est l'article où cette absence de relecture pèse le
> plus lourd.

**Ce qui a changé sous cet article.** Deux risques nouveaux, tous deux absents
du produit d'origine.

- **Dégradation durable du courrier d'un tiers.** Un fournisseur légitime
  marqué à tort voit son message modifié dans la boîte du destinataire.
  Au-delà de trente jours, la copie du corps d'origine est purgée : le retrait
  de l'avertissement reste possible, mais un message reçu en texte simple
  garde le format HTML issu de la conversion, avec une mise en forme qui peut
  différer de l'original.
- **Préjudice financier direct en cas de faux négatif.** Le montant d'un
  virement frauduleux, sans rapport avec le prix de l'abonnement.

### Ce que la nouvelle rédaction dit

| Sous-article | Contenu |
|---|---|
| **11.1** *(nouveau)* | Le Service **émet des alertes, il ne décide pas**. Un avertissement ne certifie pas la fraude, une absence d'avertissement ne certifie pas la légitimité. La vérification d'un virement et la décision de l'exécuter relèvent du seul Client |
| **11.2** | Faute prouvée, dommages directs et prévisibles seulement *(inchangé)* |
| **11.3** | Exclusions, désormais en liste, avec en tête **le montant d'une opération frauduleuse exécutée sur un message non signalé** (faux négatif), puis pertes d'exploitation, manque à gagner, image, données, réclamations de tiers |
| **11.4** | Plafond = sommes HT versées au titre de l'Abonnement sur les **12 mois** précédant le fait générateur ; au prorata si le contrat a moins de douze mois |
| **11.5** | Exceptions d'ordre public : faute lourde, faute dolosive, **dommage corporel**, cas où la loi interdit la limitation ; et réserve expresse de l'article 1170 du Code civil |
| **11.6** | Prescription contractuelle de 12 mois *(inchangé, renuméroté)* |

### Les questions, par ordre d'importance

1. **La contrepartie subsiste-t-elle ?** C'est la question centrale. Le
   plafond est limité au prix payé, et l'exclusion 11.3 retire le seul
   préjudice que le produit prétend éviter — le montant d'un virement
   frauduleux. **Un juge peut-il y voir une clause vidant l'obligation
   essentielle de sa substance, donc non écrite au sens de l'article 1170 du
   Code civil ?** La réserve ajoutée en 11.5 suffit-elle, ou faut-il un
   mécanisme de réparation minimal pour que la clause tienne ?
2. **Le faux positif n'est pas traité.** Aucune réparation n'est prévue pour
   un message de fournisseur légitime dégradé durablement. Faut-il une
   réparation en nature — le retrait de l'avertissement, que le produit sait
   faire — plutôt que rien ?
3. **Un tiers non contractant** (le fournisseur dont le message a été dégradé)
   peut-il agir, et contre qui : le client, qui a autorisé la surveillance, ou
   l'éditeur, qui a modifié le message ?
4. **11.6, prescription de douze mois.** L'article 2254 du Code civil encadre
   l'aménagement conventionnel des délais. Douze mois est-il au plancher
   admis, et cette rédaction est-elle valable en l'état ?
5. **11.1 est-il un atout ou un aveu ?** Rappeler que le Service n'est
   qu'une aide à la vigilance renforce la limitation, mais peut être opposé
   comme une reconnaissance que le produit ne tient pas ce que la promesse
   commerciale laisse entendre. La cohérence avec les supports de vente
   mérite d'être vérifiée.

## 3. Article 15 — Données personnelles

**Le texte affirme** que la Politique de confidentialité « vaut accord de
sous-traitance au sens de l'article 28 du RGPD ».

**Les questions.**

- Une politique de confidentialité publiée sur un site peut-elle valoir
  contrat de sous-traitance au sens de l'article 28 ?
- Les clauses exigées par l'article 28.3 y figurent-elles toutes : durée,
  nature et finalité, catégories de personnes, obligations de confidentialité,
  recours aux sous-traitants ultérieurs, assistance aux droits des personnes,
  sort des données en fin de contrat, mise à disposition pour audit ?
- **L'AIPD conclut que ce contrat manque** (`docs/AIPD.md`, partie 4.2). Faut-il
  un document contractuel distinct, signé, plutôt qu'un renvoi ?

---

## 4. Questions qui dépassent les CGV

### 4.1 Base légale du traitement

L'entreprise cliente est responsable de traitement. Elle doit choisir entre
l'intérêt légitime (art. 6.1.f) et l'obligation de sécurité (art. 6.1.c
combiné à l'art. 32). **Quelle base recommander au client, et faut-il un test
de mise en balance type à lui fournir ?**

### 4.2 Analyse d'impact (AIPD)

`docs/AIPD.md` a été menée par l'éditeur sur son propre produit, dans le
format du logiciel PIA de la CNIL. Elle est **exacte sur les faits techniques**
et **n'a pas été relue par un juriste**.

- L'AIPD est-elle obligatoire pour ce traitement ? (analyse à grande échelle
  de communications de salariés, avec modification du courrier reçu)
- Celle de l'éditeur peut-elle valablement servir de base à celle du client ?
- La qualification de Microsoft y est-elle correcte : service du client, non
  sous-traitant ultérieur de l'éditeur ?

### 4.3 Droit du travail

- L'information des salariés prévue à l'article 9 est-elle suffisante au
  regard de l'article L.1222-4 du Code du travail ?
- La consultation du CSE est-elle obligatoire pour ce dispositif, et à partir
  de quel seuil d'effectif ?
- **La modification du courrier reçu** d'un salarié soulève-t-elle une
  question particulière au regard du secret des correspondances ?

### 4.4 Transferts hors Union européenne

Situation factuelle, vérifiée : la base de données est en France (Supabase,
eu-west-3, Paris), l'application s'exécute en Allemagne (Netlify, eu-central-1,
Francfort). **Aucun contenu de message ne sort de l'Union européenne.** Deux
flux seulement en sortent, sans contenu de message : Resend (États-Unis, envoi
des simulations et d'alertes techniques réduites à des compteurs) et Stripe
(paiements).

- Supabase et Netlify sont des sociétés **américaines** dont les données
  restent en Europe. Les clauses contractuelles types suffisent-elles à
  couvrir un accès à distance depuis les États-Unis pour l'exploitation ?
- La formulation retenue dans la politique de confidentialité est-elle
  correcte sur ce point ?

### 4.5 Ce qui n'existe pas encore

Signalé pour que le conseil sache ce qui manque, plutôt que de le découvrir :

- **aucun contrat de sous-traitance distinct** (voir point 3) ;
- **aucune procédure écrite de notification de violation** (art. 33-34 RGPD) ;
- **aucun registre des demandes d'exercice des droits** ;
- **l'effacement des données d'un salarié se fait à la main**, sur demande
  adressée à l'éditeur ; la politique de confidentialité le dit explicitement.

---

## Ce qui n'a pas besoin d'être revu par un juriste

Pour éviter de payer une relecture inutile : les points suivants sont des
descriptions techniques, vérifiées dans le code, et le conseil peut les tenir
pour acquis.

| Affirmation des CGV | Vérifié dans |
|---|---|
| Seuls les messages **reçus** sont analysés ; les messages envoyés ne le sont pas | abonnement Graph limité à `mailFolders('inbox')/messages` |
| Les **pièces jointes** ne sont ni téléchargées ni examinées | les sept champs demandés à Graph, `attachments` n'en fait pas partie |
| La Surveillance ne démarre pas tant que la restriction n'est pas constatée | une boîte reste inactive tant que la vérification n'a pas eu lieu ; quatorze requêtes l'ignorent |
| La copie du corps d'origine est conservée **30 jours au plus** | purge automatique quotidienne, plus effacement immédiat après remise en état |
| Au-delà, un message texte converti garde le format HTML | la remise en état par découpe ne rétablit pas le format d'origine |
| Aucun indicateur individuel de comportement n'est produit | aucune table n'agrège de données par salarié |
| Le retrait de l'autorisation Microsoft interrompt la Surveillance | le locataire passe en statut « révoqué », toute la chaîne s'arrête |

---

*Document établi le 4 septembre 2026, mis à jour le même jour après la
réécriture de l'article 11, sur le code à l'état du commit de la version 1.2
des CGV. À mettre à jour si le produit change.*
