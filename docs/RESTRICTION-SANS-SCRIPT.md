# Peut-on restreindre l'accès sans faire exécuter de script au client ?

Compte rendu de faisabilité. **Rien n'est implémenté.** Cette note dit ce qui
est possible, ce que ça coûterait, et pourquoi je ne recommande pas de le faire
maintenant.

Date : septembre 2026. Sources en fin de document.

> **Comment cette note a été établie.** `learn.microsoft.com` est bloqué depuis
> l'environnement de développement. La documentation a été lue dans les dépôts
> GitHub officiels qui la produisent — `MicrosoftDocs/office-docs-powershell` et
> `microsoftgraph/microsoft-graph-docs-contrib` — c'est-à-dire la source des
> pages publiées. Rien n'a été essayé sur un locataire réel : tout ce qui suit
> est documentaire, et signalé comme tel.

---

## Réponse courte

**Oui, techniquement, entièrement.** Microsoft Graph expose depuis
`/beta/roleManagement/exchange` de quoi créer le périmètre ET l'attribution de
rôle, c'est-à-dire tout ce que fait aujourd'hui le script PowerShell. Deux
appels HTTP remplaceraient l'étape 6 du raccordement.

**Et je recommande de ne pas le faire.** Deux raisons, dont une qui me paraît
rédhibitoire :

1. c'est en `beta`, et Microsoft écrit noir sur blanc que ces API sont sujettes
   à modification et **non prises en charge en production** ;
2. surtout : la permission requise, `RoleManagement.ReadWrite.Exchange`, nous
   laisserait **modifier tout le contrôle d'accès Exchange du client**. Nous
   demanderions donc les clés de sa maison pour lui prouver que nous ne nous
   servons que d'une pièce. C'est contradictoire avec ce que le produit vend.

La **troisième voie est celle que je recommande** : garder le script, mais
remplacer le filtre d'adresses par un **groupe de sécurité**. C'est possible
aujourd'hui, en version stable, sans nouvelle permission — et ça règle un vrai
problème d'exploitation.

---

## 1. Ce que fait le script aujourd'hui

Deux objets, dans le locataire du client :

```powershell
New-ManagementScope -Name "Safentreprise-<client>" `
    -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'dg@client.fr' -or ..."

New-ManagementRoleAssignment -Name "..." -App <ObjectId du service principal> `
    -Role "Application Mail.ReadWrite" -CustomResourceScope "Safentreprise-<client>"
```

C'est **RBAC for Applications**. À ne pas confondre avec
`New-ApplicationAccessPolicy`, l'ancien mécanisme, que Microsoft a déclaré
hérité — nous ne nous en servons pas.

---

## 2. Voie A — tout piloter par Graph

### Ce qui existe

`roleManagement` expose plusieurs fournisseurs RBAC. En **v1.0**, trois :
`directory`, `entitlementManagement`, `deviceManagement`. **Exchange Online n'y
est pas.**

En **beta**, Exchange est là, avec exactement ce qu'il nous faudrait :

**Le périmètre** — `customAppScope` est décrit dans la documentation comme
correspondant à un *management role scope* Exchange, avec CRUD complet :

```http
POST https://graph.microsoft.com/beta/roleManagement/exchange/customAppScopes
{
    "type": "RecipientScope",
    "displayName": "Safentreprise-<client>",
    "customAttributes": {
        "Exclusive": false,
        "RecipientFilter": "PrimarySmtpAddress -eq 'dg@client.fr' -or ..."
    }
}
```

C'est le même filtre OPATH, au même format, avec les mêmes règles
d'échappement. Notre code qui le construit — et ses tests — servirait tel quel.

**L'attribution** :

```http
POST https://graph.microsoft.com/beta/roleManagement/exchange/roleAssignments
{
    "roleDefinitionId": "<id du rôle Application Mail.ReadWrite>",
    "principalId": "<ObjectId de notre service principal>",
    "appScopeId": "<id rendu par l'appel précédent>"
}
```

`directoryScopeId` accepte par ailleurs, pour Exchange :

| Valeur | Portée |
|---|---|
| `/` | tout le locataire |
| `/Users/{id}` | un utilisateur |
| `/AdministrativeUnits/{id}` | une unité administrative Entra |
| `/Groups/{id}` | **les membres directs d'un groupe** |

### Ce que ça coûterait

**Permission : `RoleManagement.ReadWrite.Exchange`**, en permission
d'application. C'est là que ça bloque.

Cette permission ne donne pas « le droit de nous restreindre ». Elle donne le
droit de **lire et modifier le contrôle d'accès basé sur les rôles de tout
Exchange Online** du client. Avec elle, rien ne nous empêcherait techniquement
de nous attribuer un rôle sur l'ensemble du locataire — c'est-à-dire de défaire
la restriction que nous venons de poser, sans que personne ne le voie.

Le raisonnement est le même que celui qui nous a fait mettre une boîte témoin
plutôt qu'un simple message « c'est restreint, faites-nous confiance ». Un
client averti, ou son prestataire informatique, poserait exactement cette
question à l'écran de consentement. Nous n'aurions pas de bonne réponse.

Le fait que le script soit exécuté **par le client, sur son propre locataire,
avec ses propres droits** n'est pas une faiblesse du parcours : c'est ce qui
fait que la restriction ne dépend pas de notre bonne foi.

**Et c'est en beta.** Microsoft ajoute à chacune de ces pages :

> Les API sous la version `/beta` dans Microsoft Graph sont susceptibles d'être
> modifiées. L'utilisation de ces API dans des applications de production n'est
> pas prise en charge.

Une restriction d'accès qui casserait sans préavis, sur tous les clients à la
fois, n'est pas quelque chose que je mettrais sur le chemin critique d'un
produit de sécurité.

### Verdict

Faisable, non recommandé. **À reconsidérer si `roleManagement/exchange` passe en
v1.0** — et même alors, la question de la permission restera entière.

---

## 3. Voie B — un groupe de sécurité au lieu d'un filtre d'adresses

C'est la piste que je retiens.

### Ce qui existe, en version stable

`New-ManagementRoleAssignment` accepte `-RecipientGroupScope` :

> Le paramètre RecipientGroupScope spécifie un groupe à prendre en compte pour
> la portée de l'attribution de rôle. Les membres individuels du groupe (pas
> les groupes imbriqués) sont considérés comme dans la portée.

Le script deviendrait :

```powershell
New-ManagementRoleAssignment -Name "..." -App $Sp.ObjectId `
    -Role "Application Mail.ReadWrite" `
    -RecipientGroupScope "Safentreprise - boites surveillees"
```

Plus de `New-ManagementScope`, plus de filtre OPATH, plus d'échappement
d'apostrophes.

### Ce que ça change pour le client

Il crée un groupe dans le centre d'administration Microsoft 365 — écran qu'il
connaît — et y met les boîtes à surveiller. **Ajouter ou retirer une boîte
devient une manipulation d'interface web, sans PowerShell et sans nous.**

Aujourd'hui, changer de sélection oblige à refaire exécuter le script par
l'administrateur Exchange. Pour une PME dont le comptable change de poste, c'est
une friction réelle, et elle se répétera.

### Ce que ça coûte

**Il faut décider qui fait autorité.** Aujourd'hui, la sélection dans notre
interface *est* le périmètre : nous en écrivons le filtre. Avec un groupe, le
périmètre appartient au client, et notre écran n'en est plus qu'un reflet.

Deux conséquences à traiter avant d'implémenter :

- **Les deux peuvent diverger.** Une boîte ajoutée au groupe sans être cochée
  chez nous serait accessible sans être surveillée ; cochée chez nous sans être
  dans le groupe, elle serait surveillée en apparence et refusée en pratique.
  Il faudrait lire le groupe par Graph (`GroupMember.Read.All`, ou
  `Group.Read.All`) et faire remonter l'écart — probablement dans
  `tenants_en_alerte`, avec la même règle : la vue doit rester vide.
- **Membres directs seulement.** Un groupe imbriqué ne compte pas. Si le client
  y met un groupe au lieu de boîtes, la restriction serait plus étroite qu'il ne
  le croit — et l'écart ne se verrait qu'à la vérification.

La boîte témoin et la vérification par sondage restent nécessaires,
inchangées : elles ne dépendent pas de la façon dont le périmètre est écrit.

### Verdict

**Recommandé, dans un second temps.** Ça ne supprime pas le script — il faut
toujours déclarer le service principal et attribuer le rôle une fois — mais ça
supprime la *seule* raison de le réexécuter. Le script devient une opération
d'installation, au lieu d'une opération de maintenance.

Coût estimé : une journée, dont l'essentiel dans la détection d'écart entre le
groupe et notre sélection. À ne pas faire sans elle.

---

## 4. Voie C — unité administrative Entra

`-RecipientAdministrativeUnitScope`, en PowerShell, et
`directoryScopeId: "/AdministrativeUnits/{id}"` côté Graph. Les unités
administratives se gèrent par Graph en **v1.0**, avec
`AdministrativeUnit.ReadWrite.All`.

Écarté pour deux raisons :

- **la permission est trop large** : gérer les unités administratives d'un
  locataire, c'est pouvoir déplacer n'importe quel objet de l'annuaire ;
- **l'objet ne convient pas** : une unité administrative sert à déléguer
  l'administration d'un ensemble d'utilisateurs. Y ranger les boîtes surveillées
  parce que ça nous arrange interférerait avec l'organisation du client, qui
  peut déjà s'en servir pour autre chose.

Un groupe de sécurité dédié n'a pas cet inconvénient : le client peut en créer
autant qu'il veut, ça n'engage rien d'autre.

---

## 5. Récapitulatif

| Voie | Supprime le script | Version | Permission demandée au client | Retenue |
|---|---|---|---|---|
| A — tout par Graph | Oui | **beta** | `RoleManagement.ReadWrite.Exchange` — tout le RBAC Exchange | Non |
| B — groupe de sécurité | Non, mais plus à le réexécuter | stable | `Group.Read.All` pour détecter les écarts | **Oui, ensuite** |
| C — unité administrative | Non | v1.0 | `AdministrativeUnit.ReadWrite.All` — tout l'annuaire | Non |
| Aujourd'hui — filtre d'adresses | — | stable | aucune | Oui, pour l'instant |

**Ce qui a réellement rendu le parcours impraticable** n'était aucun de ces
choix, mais la dépendance au module `Microsoft.Graph.Applications` pour lire un
seul identifiant, et l'absence de vérification des prérequis. Les deux sont
corrigés. Il vaut la peine de refaire un essai réel sur cette base avant
d'engager la voie B : le script tient maintenant en un copier-coller et une
seule installation de module.

---

## À vérifier au prochain essai réel

Rien de ce qui précède n'a été constaté sur un locataire :

- que `GET /servicePrincipals(appId='...')` fonctionne bien **sans permission
  supplémentaire**. Microsoft documente qu'« un service principal peut lire ses
  propres détails d'application et de service principal sans qu'aucune
  permission d'application lui soit accordée » ; c'est ce sur quoi repose la
  correction du problème 1 ;
- le libellé exact du rôle `Application Mail.ReadWrite` (le script le vérifie
  déjà et s'arrête en listant les rôles disponibles) ;
- si `New-ServicePrincipal` réclame `-ServiceId` : la documentation le marque
  `Required: True` tout en indiquant qu'il est **déprécié, remplacé par
  ObjectId**, et les exemples officiels l'omettent. Le script l'omet aussi. Si
  Exchange le réclamait, il faudra lui passer la même valeur qu'`ObjectId` ;
- que la vérification des droits par `Get-Command` fonctionne : Exchange Online
  ne place dans la session que les commandes autorisées par les rôles du compte.
  C'est le comportement attendu, et le contrôle en dépend.

---

## Sources

- [Get servicePrincipal — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-get?view=graph-rest-1.0)
  (« A service principal can retrieve its own application and service principal
  details without being granted any application permissions »)
- [roleManagement resource type — beta](https://learn.microsoft.com/en-us/graph/api/resources/rolemanagement?view=graph-rest-beta)
- [unifiedRbacApplication resource type — beta](https://learn.microsoft.com/en-us/graph/api/resources/unifiedrbacapplication?view=graph-rest-beta)
- [customAppScope resource type — beta](https://learn.microsoft.com/en-us/graph/api/resources/customappscope?view=graph-rest-beta)
- [Create unifiedRoleAssignment — beta](https://learn.microsoft.com/en-us/graph/api/rbacapplication-post-roleassignments?view=graph-rest-beta)
- [Create customAppScope — beta](https://learn.microsoft.com/en-us/graph/api/unifiedrbacapplication-post-customappscope?view=graph-rest-beta)
- [New-ManagementRoleAssignment](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-managementroleassignment?view=exchange-ps)
  (`-App`, `-CustomResourceScope`, `-RecipientGroupScope`,
  `-RecipientAdministrativeUnitScope`)
- [New-ManagementScope](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-managementscope?view=exchange-ps)
- [New-ServicePrincipal](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-serviceprincipal?view=exchange-ps)
- [Role Based Access Control for Applications in Exchange Online](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
