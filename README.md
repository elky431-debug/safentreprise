# Spike — bannière d'alerte via Microsoft Graph

Objectif : prouver qu'on peut injecter une bannière d'avertissement dans le
corps d'un mail **déjà reçu** sur Microsoft 365, côté serveur, sans extension
ni add-in.

Ce n'est pas du code de production.

## Installation

Node 18 ou plus récent. Aucune dépendance à installer.

1. Copier `.env.example` en `.env`
2. Coller dans `.env` la **valeur** du secret client créé dans Azure
   (pas l'« ID de secret »)

Sur Windows :

```
copy .env.example .env
notepad .env
```

## Commandes

```
node index.js list             liste les 10 derniers mails
node index.js backup 1         sauvegarde le corps original du mail n° 1
node index.js inject 1         injecte la bannière en haut du corps
node index.js restore 1        remet le corps original
```

L'index est le petit numéro affiché par `list`. Les identifiants Microsoft,
longs et illisibles, restent dans `.messages.json` et ne sont jamais à
manipuler à la main.

## Ordre de test recommandé

```
node index.js list
node index.js backup 1
node index.js inject 1
```

Ouvrir le mail dans Outlook web, Outlook bureau et Outlook mobile pour
vérifier l'affichage. Puis :

```
node index.js restore 1
```

## Sécurité

`inject` refuse de modifier un mail sans sauvegarde préalable : si elle
manque, il la fait automatiquement avant d'écrire. Il refuse aussi d'injecter
deux fois dans le même mail.

`.env`, `.messages.json` et `backups/` sont exclus de git.

## Après le 31 décembre 2026

Modifier le corps d'un mail reçu exigera la permission
`Mail-Advanced.ReadWrite`. `Mail.ReadWrite` suffit jusque-là.
