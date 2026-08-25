# Spike Outlook — injection d'une bannière d'alerte via Microsoft Graph

**Date des tests : 24 août 2026** · API Microsoft Graph **v1.0** · Node 18+

Ce document existe pour qu'on puisse reprendre le sujet à froid dans un mois
sans avoir à tout refaire. Il décrit ce qui a été prouvé, ce qui a coincé, et
ce qui manque encore.

---

## 1. Ce qui a été prouvé

**On peut modifier le corps d'un mail déjà reçu, depuis un serveur, sans que
le salarié installe quoi que ce soit.**

Concrètement : un programme qui tourne ailleurs — pas sur le poste de
l'utilisateur, pas dans son navigateur — va chercher un mail dans une boîte
Microsoft 365, ajoute un encadré rouge en haut du message, et le mail est
ensuite affiché avec cet encadré partout. C'est le mécanisme qu'utilise Vade.

Vérifié le 24 août 2026 sur trois clients :

| Client | Résultat |
|---|---|
| Outlook sur le web | Bannière affichée, mail d'origine intact en dessous |
| Application Outlook (bureau) | Bannière affichée |
| Outlook mobile, mode sombre | Bannière affichée et lisible |

Détail utile : au moment du test, Outlook affichait « le contenu de ce message
a été partiellement bloqué » parce qu'il bloquait les images distantes de
l'expéditeur. **La bannière, elle, s'est affichée entièrement** — elle
n'utilise aucune image ni ressource externe. C'est une propriété qu'il faut
conserver : l'avertissement de sécurité doit passer même quand le reste du
mail est amputé.

Le mail de test était un message Microsoft de 37 924 caractères en HTML. Après
injection, tout le contenu d'origine était toujours là, sous la bannière.

### Catégories Outlook — testé manuellement en amont

En parallèle du corps du message, les **catégories** ont été testées à la main.
Ce sont les petites étiquettes colorées d'Outlook. Elles constituent un second
signal, complémentaire de la bannière :

- **visibles dans la liste des messages, avant même d'ouvrir le mail** — c'est
  leur intérêt principal : le salarié est prévenu avant de lire ;
- **visibles sur Outlook mobile**, affichées sous l'objet ;
- **longueur limitée à environ 20 caractères** : au-delà, le libellé est
  tronqué à l'affichage. À prendre en compte au moment de choisir le texte.

Contrairement au corps du message, les catégories ne font pas partie des
« propriétés sensibles » de Microsoft : elles ne seront pas concernées par la
restriction de fin 2026 décrite plus bas.

---

## 2. Configuration Azure

Créée dans **portal.azure.com** → Microsoft Entra ID → Inscriptions
d'applications.

| Champ | Valeur |
|---|---|
| Nom de l'application | Safentreprise Guard |
| Type de comptes | **Multi-tenant** (plusieurs locataires Entra ID) |
| CLIENT_ID (ID d'application) | `43986eb2-528c-4482-8c67-201afe836d7a` |
| TENANT_ID (ID d'annuaire) | `6510801d-c1ad-4506-819e-865e149351d0` |
| Boîte de test | `admin@safentreprisefr.onmicrosoft.com` |
| URI de redirection | aucune |

**Permission : `Mail.ReadWrite`, en autorisation d'APPLICATION.**

Ce point est capital et se trompe facilement. Dans le portail, au moment
d'ajouter une permission, deux gros boutons apparaissent :

- *Autorisations déléguées* — l'application agit **au nom d'un utilisateur
  connecté**. Ce n'est PAS ce qu'on veut.
- *Autorisations d'application* — l'application agit **seule, en tâche de
  fond**, sans personne devant l'écran. C'est celle-ci.

Le consentement administrateur a été accordé (statut vert dans le portail).
Sans ce consentement, tous les appels échouent en 403.

Le multi-tenant a été choisi dès le départ, pour éviter une migration plus
tard. Ça ne change rien au code : on demande le jeton au tenant concerné, et
pour notre propre tenant le comportement est identique à une app single
tenant.

**Le secret client ne figure pas dans ce document, et ne doit jamais y
figurer.** Il vit uniquement dans le fichier `.env` local, exclu de git.

---

## 3. Les appels API

Toutes les URL sont en `https://graph.microsoft.com/v1.0/`.

### Obtenir un jeton

```
POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}
client_secret={SECRET}
scope=https://graph.microsoft.com/.default
grant_type=client_credentials
```

Le jeton dure environ une heure. Il n'y a **pas** de jeton de rafraîchissement
à conserver : on en redemande un quand on en a besoin. C'est une simplification
importante pour la suite — rien de sensible à stocker en base.

### Lister les messages

```
GET /users/{BOÎTE}/mailFolders/inbox/messages
    ?$top=10
    &$select=id,subject,from,receivedDateTime,isDraft
    &$orderby=receivedDateTime desc
```

### Lire un message (pour sauvegarder son corps)

```
GET /users/{BOÎTE}/messages/{ID}?$select=id,subject,body,isDraft
```

### Injecter la bannière

```
PATCH /users/{BOÎTE}/messages/{ID}
Content-Type: application/json
```

Corps de la requête :

```json
{
  "body": {
    "contentType": "HTML",
    "content": "<!--SAFENTREPRISE-BANNIERE--><table…>…</table>LE_CORPS_D_ORIGINE_ICI"
  }
}
```

La bannière est placée **devant** le contenu existant, ou juste après la
balise `<body>` si le message en contient une. Le corps d'origine n'est jamais
tronqué : on le concatène tel quel derrière.

Réponse attendue : **200**.

### Restaurer

Même `PATCH`, avec le `contentType` et le `content` sauvegardés avant
modification.

### Le HTML de la bannière retenue

Un marqueur invisible en tête sert à reconnaître un mail déjà traité et à ne
pas empiler deux bannières.

```html
<!--SAFENTREPRISE-BANNIERE-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px 0;">
  <tr>
    <td width="6" bgcolor="#B91C1C" style="width:6px;background-color:#B91C1C;font-size:0;line-height:0;">&nbsp;</td>
    <td bgcolor="#FEE2E2" style="background-color:#FEE2E2;padding:14px 18px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 8px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;line-height:20px;">
            &#9888; Safentreprise &#8212; Expéditeur suspect
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;">
            Ce message présente plusieurs signes d&#39;usurpation d&#39;identité&nbsp;:
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <!-- une ligne par signal détecté -->
              <tr><td style="padding:2px 0;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;"><span style="color:#B91C1C;">&#8226;</span>&nbsp;Le nom affiché imite celui d&#39;un dirigeant de votre entreprise.</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FCA5A5" style="background-color:#FCA5A5;padding:9px 12px;color:#7F1D1D;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:19px;">
            <strong style="color:#7F1D1D;">Que faire&nbsp;?</strong>
            Ne répondez pas et n&#39;effectuez aucun virement. Vérifiez par téléphone,
            sur un numéro que vous connaissez déjà.
          </td>
        </tr>
        <tr>
          <td style="padding:9px 0 0 0;color:#991B1B;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:16px;">
            Analyse automatique Safentreprise
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
```

Trois choix de construction, tous délibérés :

- **Un tableau, pas des `<div>`.** Outlook sur Windows affiche le HTML avec le
  moteur de rendu de Word, qui ignore une grande partie du CSS mais respecte
  les tableaux.
- **La barre rouge à gauche est une cellule de tableau**, pas un
  `border-left`, pour la même raison.
- **Les couleurs sont forcées sur chaque élément**, texte comme fond, avec
  l'attribut `bgcolor` en plus du style. Sans ça, le mode sombre d'Outlook
  mobile inverse le fond et rend le texte illisible.

---

## 4. Pièges rencontrés

### Graph Explorer renvoie systématiquement 405 sur le PATCH

**Symptôme.** Dans l'outil web Graph Explorer, le `GET` sur un message
fonctionne, mais le `PATCH` échoue avec
`405 — The OData request is not supported`.

**Cause.** Ce n'est pas un refus de permission — ça, ce serait un 403. Un 405
signifie « cette méthode n'existe pas sur cette URL ». Neuf fois sur dix,
l'identifiant du message a été tronqué ou mal recopié : l'URL devient
`/messages` sans identifiant derrière, et `PATCH` n'existe pas sur une
collection.

Deux différences aggravantes propres à Graph Explorer : il utilise des
permissions **déléguées** et non d'application, et il ajoute parfois des
paramètres de requête au `PATCH` que Graph refuse.

**Conclusion.** Ne pas conclure à l'impossibilité technique à partir d'un
échec dans Graph Explorer. Le même appel, écrit à la main dans un script, est
passé du premier coup.

### Encodage du « = » final des identifiants de message

**Symptôme.** Le même 405, ou un 400, dans un script.

**Cause.** Les identifiants de message Microsoft sont très longs et se
terminent souvent par un ou plusieurs `=`. Ce caractère doit être encodé en
`%3D` dans l'URL. `encodeURIComponent()` s'en charge, ainsi que du `@` de
l'adresse de la boîte, qui devient `%40`.

**Vérification rapide.** Le script logue l'URL complète avant chaque appel.
Elle doit se terminer par un long identifiant encodé — pas par `/messages`.

```
[graph] PATCH https://graph.microsoft.com/v1.0/users/admin%40safentreprisefr.onmicrosoft.com/messages/AAMkADY2…AAAAAVRAAA%3D
```

### `/me` inutilisable en autorisation d'application

**Symptôme.** Toute URL contenant `/me/` échoue.

**Cause.** `/me` désigne « l'utilisateur actuellement connecté ». En
autorisation d'application, il n'y a **personne** de connecté : l'application
agit seule. Graph ne sait donc pas qui est « me ».

**Solution.** Toujours désigner la boîte explicitement :
`/users/admin@safentreprisefr.onmicrosoft.com/messages`. C'est ce que fait le
script partout.

### Bannière sans image ni CSS externe

**Symptôme.** Une bannière qui utiliserait un logo hébergé, une feuille de
style externe ou du JavaScript s'afficherait cassée, ou pas du tout.

**Cause.** Les clients mail suppriment le JavaScript et les feuilles de style
externes, et bloquent par défaut les images distantes des expéditeurs non
approuvés. Ce blocage a été observé pendant le test : Outlook affichait « le
contenu de ce message a été partiellement bloqué ».

**Conséquence.** Tout doit être en HTML avec styles en ligne, sans aucune
ressource distante. C'est ce qui a permis à la bannière de s'afficher alors
que les images du mail d'origine, elles, étaient bloquées.

---

## 5. Limites et risques

### L'injection est irréversible

Une fois le `PATCH` passé, **le corps d'origine n'existe plus nulle part**.
Microsoft ne conserve pas de version antérieure et il n'y a pas d'annulation.

D'où la règle, respectée par le script et à conserver en production :
**sauvegarder le corps avant toute modification**. Le script refuse de
modifier un mail dont il n'a pas la sauvegarde ; si elle manque, il la fait
d'abord.

### Le seuil de détection devient un sujet critique

C'est la conséquence la plus importante du changement de modèle, et elle est
facile à sous-estimer.

Avec l'extension Chrome, une bannière posée à tort n'abîmait rien : elle
s'affichait par-dessus, le mail restait intact, un rechargement la faisait
disparaître.

Avec l'injection serveur, **un faux positif défigure définitivement un mail
légitime**. Un devis client, un contrat, un message de la banque : le
destinataire recevra un mail marqué comme frauduleux, et le mail restera dans
cet état.

Le réglage du seuil, la qualité du moteur de détection et la possibilité pour
l'entreprise de corriger une erreur ne sont donc plus des sujets de confort :
ils conditionnent la viabilité du produit.

### `Mail.ReadWrite` en application donne accès à TOUTES les boîtes

En autorisation d'application, cette permission ne se limite pas à une boîte :
elle donne à l'application un accès en lecture **et en écriture** à
l'intégralité des boîtes du locataire, sans exception.

Sur un tenant de test, sans importance. Chez un client, c'est inacceptable en
l'état, et aucun responsable informatique sérieux n'accordera le consentement
sans garantie.

La réponse existe et elle est standard : la **stratégie d'accès aux
applications** (`New-ApplicationAccessPolicy`, à exécuter en PowerShell
Exchange Online), qui restreint l'application à un groupe de sécurité à
extension messagerie. C'est au client de la mettre en place, avec notre
documentation. C'est aussi un argument de vente : « nous n'accédons qu'aux
boîtes que vous désignez, et c'est vous qui le configurez ».

---

## 6. À faire avant la production

**Passer à `Mail-Advanced.ReadWrite` avant le 31 décembre 2026.** À partir de
cette date, Microsoft exigera cette permission pour modifier les propriétés
dites sensibles d'un message déjà délivré — dont le corps. `Mail.ReadWrite`
suffit aujourd'hui, comme ce spike l'a prouvé, mais **l'injection cessera de
fonctionner du jour au lendemain** si la migration n'est pas faite. Elle
s'ajoute au même endroit dans le portail, avec un nouveau consentement
administrateur à demander à chaque client.

**Faire vérifier l'éditeur auprès de Microsoft.** Cela suppose un compte au
programme partenaires Microsoft, vérifié, auquel l'application est associée.
Sans cette vérification, l'écran de consentement affiche un avertissement
« éditeur non vérifié » à l'administrateur du client — au pire moment
possible, celui où il doit accorder un accès à toute sa messagerie.

**Recréer le secret client.** Celui utilisé pour ce spike a circulé en clair.
Portail Azure → l'application → Certificats et secrets → nouveau secret, puis
suppression de l'ancien. Pour la production, préférer un **certificat** à un
secret : les secrets expirent au bout de 24 mois maximum et leur expiration
provoque une panne totale et silencieuse.

**Restreindre l'application à un groupe de boîtes chez chaque client**, via la
stratégie d'accès décrite plus haut. À intégrer à la procédure d'installation,
pas à laisser en option.

---

## 7. Ce qui n'est PAS fait

Pour éviter toute illusion en relisant ce document dans un mois : **ce spike
ne constitue en rien un produit**.

Ce qu'il fait : il prouve qu'un `PATCH` sur le corps d'un mail est accepté et
correctement affiché. Rien de plus.

Ce qu'il ne fait pas :

- **Il ne détecte rien.** Les quatre signaux affichés dans la bannière sont
  du texte fixe écrit en dur. Aucune analyse n'a lieu. Le moteur de détection
  existe, mais dans le dépôt de l'extension Chrome, et il n'est pas branché.
- **Il ne se déclenche pas tout seul.** Il faut taper une commande, à la main,
  en désignant un mail par son numéro dans une liste.
- **Il tourne en local**, sur un poste, avec un secret dans un fichier texte.

Ce qu'il manque pour en faire un service :

- **Les abonnements Graph** aux nouveaux messages — un abonnement par boîte,
  avec renouvellement automatique, gestion des notifications de cycle de vie,
  et un rattrapage par requête *delta* pour les messages manqués. C'est la
  partie la plus lourde et la plus fragile.
- **Le moteur de détection côté serveur** : porter `lib/detection-rules.js`
  depuis le dépôt de l'extension, en remplaçant les dirigeants et le domaine
  codés en dur par des paramètres propres à chaque société. Le fichier n'a
  aujourd'hui **aucun test automatisé** — à écrire avant de le déplacer.
- **Un hébergement** capable de recevoir les notifications de Microsoft et de
  répondre en quelques secondes, avec une file d'attente pour traiter
  l'analyse en différé.
- **Un parcours de consentement administrateur** : l'écran où le client
  autorise Safentreprise, la page de retour, et le suivi de l'état du
  consentement.
- **La création des catégories chez le client**, puisqu'une catégorie doit
  exister dans la boîte avant de pouvoir être posée sur un message.

Et, hors technique mais bloquant : la politique de confidentialité actuelle
affirme que l'analyse est locale et que le contenu des messages n'est jamais
transmis. Avec ce modèle, le corps des mails arrive sur nos serveurs. **Ce
texte devra être réécrit avant toute mise en service**, de même que
l'appréciation du besoin d'une analyse d'impact (AIPD).
