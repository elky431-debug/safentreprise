# La restriction Exchange ne restreint rien tant que l'autorisation Entra reste

Constat du 8 septembre 2026, sur le locataire de test. **La restriction d'accès
ne fonctionne pas aujourd'hui.** Ce document dit pourquoi, et ce qu'il faut
changer.

> `learn.microsoft.com` est bloqué depuis l'environnement de développement. Ce
> qui suit s'appuie sur la documentation Microsoft citée par plusieurs sources
> concordantes, listées en fin de document, et sur une observation directe sur
> un locataire réel. Je n'ai pas pu lire la page Microsoft moi-même.

---

## Ce qui a été observé

Sur un locataire où le script de restriction a été exécuté avec succès :

| Contrôle | Résultat |
|---|---|
| `Test-ServicePrincipalAuthorization` sur la boîte témoin | `InScope False` |
| `Test-ServicePrincipalAuthorization` sur une boîte surveillée | `InScope True` |
| Lecture Graph d'un message de la **boîte témoin** | **réussie** |

Exchange dit « hors périmètre ». Microsoft Graph laisse lire quand même.

## Pourquoi

Les autorisations d'Exchange RBAC **s'ajoutent** à celles d'Entra ID. C'est une
union, pas une restriction. Microsoft l'écrit :

> Les autorisations attribuées à l'aide de l'application RBAC agissent **en plus**
> des attributions faites dans Microsoft Entra ID — les autorisations attribuées
> sont une **opération d'union** entre les autorisations de Microsoft Entra ID et
> celles attribuées dans Exchange Online RBAC.
>
> Vous devez vous assurer d'avoir **supprimé les autorisations non délimitées,
> à l'échelle de l'organisation, attribuées dans Microsoft Entra ID**. Les
> autorisations Microsoft Entra ne peuvent être contraintes qu'avec les
> stratégies d'accès aux applications.

Notre application demande `Mail.ReadWrite` en permission d'application, et
l'administrateur du client l'accorde à l'échelle du locataire au moment du
consentement. Cette autorisation-là ne connaît aucun périmètre. Le périmètre
Exchange que le script installe est réel — `Test-ServicePrincipalAuthorization`
le confirme — mais il n'enlève rien : il ajoute une seconde voie d'accès, plus
étroite, à côté d'une première restée grande ouverte.

**Le script n'est pas en cause. Le périmètre n'est pas en cause. C'est
l'autorisation que nous demandons au consentement qui annule l'effet des deux.**

## Ce que ça veut dire pour le produit

La promesse centrale — « Safentreprise ne peut pas lire vos autres boîtes » —
n'est pas tenue aujourd'hui. Techniquement, l'application peut lire toutes les
boîtes de tous les locataires raccordés.

Deux choses limitent la portée du problème, sans l'excuser :

- **aucun client n'est en production** sur ce chemin ;
- **la vérification a fait son travail.** Elle a refusé de démarrer la
  surveillance, et c'est précisément ce refus qui a révélé le défaut. Une
  vérification qui se serait contentée de constater l'existence du périmètre
  Exchange aurait conclu « restriction active » — et le produit aurait menti
  sans que personne ne s'en aperçoive. La boîte témoin a payé son coût
  d'installation d'un coup.

Ce qui **n'a pas** fonctionné, c'est le message affiché : il annonçait « le
script n'a pas encore été exécuté », alors que le script avait bien été exécuté.
Une cause affirmée sans avoir été constatée envoie chercher au mauvais endroit.
Corrigé : l'écran décrit maintenant ce qui a été observé et nomme les deux
causes possibles, avec le contrôle qui les départage.

## Ce qu'il faut changer

**Ne plus demander `Mail.ReadWrite` en permission d'application dans Entra.**
Le rôle `Application Mail.ReadWrite` est attribué par le script, côté Exchange,
avec un périmètre. Il devient alors la seule voie d'accès au courrier, et elle
est délimitée.

Conséquences, à peser :

1. **Chaque locataire déjà raccordé doit reconsentir.** Le vôtre compris.
2. **Entre le consentement et l'exécution du script, l'application n'a aucun
   accès au courrier.** C'est une amélioration : aujourd'hui elle a un accès
   total pendant cette fenêtre. La promesse « aucun message analysé avant
   vérification » cesse d'être une règle que nous nous imposons pour devenir
   une contrainte que Microsoft applique.
3. **`User.Read.All` reste nécessaire et reste à l'échelle du locataire.** Elle
   sert à lister les boîtes à cocher et à alimenter l'annuaire anti-usurpation.
   Les autorisations d'annuaire de Graph ne sont pas délimitables — c'est
   documenté. Nous lisons donc des noms, des adresses et des domaines pour tout
   le locataire, et **pas** du courrier. À dire tel quel dans la politique de
   confidentialité et l'AIPD, qui décrivent aujourd'hui une restriction plus
   large qu'elle ne l'est.
4. **À vérifier au premier essai, et je ne peux pas le faire d'ici :** qu'un
   jeton d'application obtenu sans `Mail.ReadWrite` dans Entra soit bien accepté
   par Exchange sur la seule foi de l'attribution RBAC. Les sources décrivent
   ce fonctionnement comme celui prévu — « n'ajoutez pas les autorisations
   Exchange dans Entra ID, elles sont ajoutées à l'attribution de rôle dans
   Exchange Online » — mais je ne l'ai pas constaté. **Si Microsoft refusait le
   jeton, tout ce chemin tomberait**, et il faudrait se rabattre sur les
   stratégies d'accès aux applications.

## La solution de repli, si le point 4 échoue

`New-ApplicationAccessPolicy` — les stratégies d'accès aux applications. C'est
l'ancien mécanisme, que Microsoft présente comme « hérité » et dont il annonce
une future dépréciation. Plusieurs sources soutiennent pourtant qu'il reste
aujourd'hui **le seul moyen pris en charge de contraindre l'accès Graph aux
boîtes**, précisément à cause de l'union décrite plus haut.

Les sources se contredisent sur ce point : la page Microsoft consacrée à RBAC
présente celui-ci comme le remplaçant, la page consacrée aux stratégies les
marque « héritées », et des praticiens affirment que RBAC ne contraint pas
Graph. La contradiction n'est qu'apparente, et la lecture qui réconcilie tout
est celle-ci :

- RBAC **accorde** un accès délimité ;
- il ne **retire** rien de ce qu'Entra a accordé ;
- pour restreindre sans retirer l'autorisation Entra, il faut une stratégie
  d'accès aux applications.

Autrement dit : retirer l'autorisation Entra et s'appuyer sur RBAC seul, ou
garder l'autorisation Entra et poser une stratégie d'accès par-dessus. La
première voie est celle que Microsoft recommande pour les nouvelles
configurations ; la seconde est celle qui est certaine de fonctionner
aujourd'hui.

**Ma recommandation : essayer la première, garder la seconde en repli, et ne
rien promettre au client tant que le sondage du témoin ne renvoie pas un refus
explicite.** C'est exactement ce que la vérification impose déjà — elle n'a pas
besoin d'être changée pour ça.

## Ce qui a été corrigé dans le code en attendant

- **Le sondage lit un message**, plus un dossier :
  `GET /users/{id}/messages?$top=1&$select=id` au lieu de
  `GET /users/{id}/mailFolders/inbox`. Les deux sont des appels Exchange soumis
  aux mêmes autorisations — l'ancien n'interrogeait pas l'annuaire, contrairement
  à ce qu'on pouvait craindre — mais la preuve doit porter sur ce que le client
  redoute vraiment : la lecture de son courrier.
- **Le message d'échec n'accuse plus le client.** Il décrit la lecture réussie,
  et propose les deux causes dans l'ordre de vraisemblance, avec la commande
  `Test-ServicePrincipalAuthorization` pour trancher.
- **Rien n'a été changé au mécanisme de restriction lui-même** : ce serait
  changer le modèle d'autorisation de l'application, ce qui oblige tous les
  locataires à reconsentir. Décision à prendre avant, pas pendant.

---

## Sources

- [Role Based Access Control for Applications in Exchange Online](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
  — l'union des autorisations Entra et Exchange, et l'obligation de retirer les
  autorisations non délimitées.
- [Application Access Policies (legacy)](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-access-policies)
- [Test-ServicePrincipalAuthorization](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-serviceprincipalauthorization?view=exchange-ps)
  — évalue l'attribution RBAC, pas l'accès effectif.
- [ExO RBAC improvements #1: Limiting application access — Vasil Michev](https://michev.info/blog/post/4282/exo-rbac-improvements-1-limiting-application-access)
- [Exchange Online Application RBAC n'est pas appliqué pour une identité managée utilisant Graph Mail.Send — Microsoft Q&A](https://learn.microsoft.com/en-au/answers/questions/5951705/exchange-online-application-rbac-application-mail)
  — même symptôme, même cause : `InScope False` et l'appel Graph réussit quand
  même par l'autorisation Entra non délimitée.
- [Control Graph Mail.Send Permission with RBAC for Applications — Office 365 for IT Pros](https://office365itpros.com/2026/02/17/mail-send-rbac-for-applications/)
