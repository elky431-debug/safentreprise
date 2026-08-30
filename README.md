# Safentreprise

Application SaaS de simulation d'arnaques (président / faux fournisseur) pour former les équipes compta/finance.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (auth + Postgres)
- OpenAI pour la rédaction des faux messages

## Démarrage local

1. Créez un projet sur [supabase.com](https://supabase.com)
2. Copiez `.env.local.example` vers `.env.local` et renseignez les clés
3. Appliquez le schéma de base : `npm run db:apply`
   (nécessite `DATABASE_URL` — Supabase > Connect > URI, mode Session)
   À défaut, exécutez `supabase/schema.sql` dans l'éditeur SQL Supabase.
4. `npm install` puis `npm run dev`
5. Ouvrez [http://localhost:3000](http://localhost:3000)

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique, exposée au navigateur |
| **`NEXT_PUBLIC_APP_URL`** | **URL publique de l'app. Obligatoire pour envoyer une campagne** |
| `RESEND_API_KEY` | Envoi des emails de simulation, serveur uniquement |
| `SIMULATION_FROM_EMAIL` | Adresse d'expédition, sur un domaine vérifié chez Resend |
| `VEILLE_FROM_EMAIL` | Expéditeur de l'alerte de veille. Domaine vérifié obligatoire |
| `VEILLE_DESTINATAIRE` | Qui reçoit l'alerte (défaut `contact@safentreprise.com`) |
| `SMSPARTNER_API_KEY` | Envoi des SMS de simulation, serveur uniquement |
| `SMSPARTNER_SENDER` | Expéditeur alphanumérique validé (3–11 caractères) |
| `DATABASE_URL` | Connexion Postgres directe, utilisée par `npm run db:apply` |

### NEXT_PUBLIC_APP_URL — à ne pas oublier en production

Les liens piégés et de signalement insérés dans chaque message sont construits à
partir de cette variable. Si elle est absente, le code retombe sur
`http://localhost:3000` : les liens seraient **injoignables depuis la boîte mail
d'un collaborateur** et le tracking resterait muet.

`POST /api/campaigns/[id]/send` refuse donc l'envoi quand elle est absente, mal
formée, ou qu'elle pointe sur localhost en production
(`src/lib/send/tracking.ts`, fonction `verifierUrlPublique`).

En production, la valeur attendue est :

```
NEXT_PUBLIC_APP_URL=https://safentreprise.com
```

Sur Netlify : **Site configuration → Environment variables → Add a variable**.
C'est une variable `NEXT_PUBLIC_*`, injectée **au build** : après l'avoir
ajoutée ou modifiée, relancez un déploiement (*Deploys → Trigger deploy →
Clear cache and deploy site*), sinon l'ancienne valeur reste embarquée.

## Détection des messages frauduleux

Le moteur vit dans `src/lib/detection/` et tourne **côté serveur**.

| Fichier | Rôle |
| --- | --- |
| `detection-rules.js` | Moteur. Détecte l'incohérence entre le nom signé et l'adresse d'envoi. Aucune donnée propre à une société : rien à configurer par client. |
| `html-texte.js` | Conversion du corps HTML en texte, préalable indispensable. |
| `index.ts` | Adaptateur : rend le moteur consommable depuis le code Next. |

`detection-rules.js` est écrit comme une fonction anonyme exécutée
immédiatement, qui accroche son API à `self`. Ni `window` ni `self` n'existent
dans Node : l'adaptateur pose `self` avant un import **dynamique**, un import
statique serait hissé et s'exécuterait trop tôt. Le fichier de déclaration
`detection-rules.d.ts` existe parce que TypeScript refuse d'importer un module
sans `import` ni `export`.

`html-texte.js` n'est pas un confort. Le moteur cherche la signature dans les
huit dernières lignes non vides du corps : sur du HTML brut ce sont des balises
de fermeture, et sur un mail avec fil de citation ce sont les dernières lignes
du message **cité** — donc la signature de la mauvaise personne. Le module
convertit, retire le texte masqué et les caractères de largeur nulle qui cassent
la recherche par mot-clé, et coupe le fil de citation.

| Commande | Effet |
| --- | --- |
| `npm run moteur:test` | 16 cas de détection |
| `npm run moteur:test-html` | 28 vérifications de conversion HTML → texte, dont l'enchaînement complet conversion + moteur |

### Deux principes qui valent pour toute intégration

**Le signal durable est écrit à l'ingestion, pas à l'affichage.** Catégorie,
libellé, bannière injectée : tout est posé dans la boîte au moment de l'analyse.
Ces marques survivent à une panne du serveur. Une indisponibilité empêche
d'analyser les **nouveaux** messages, elle n'efface pas les alertes déjà posées.

**Jamais de pastille verte.** On n'affiche que le risque, jamais l'absence de
risque. Sans cette règle, une analyse manquante ou une panne se lit comme une
garantie de sécurité — un faux négatif silencieux, à l'échelle de tous les
clients.

### Extension Chrome — abandonnée le 25 août 2026

**Raison.** Elle ne couvrait que gmail.com dans Chrome sur ordinateur. Ni le
mobile, ni Safari, ni les applications de messagerie installées. Or les PME
françaises sont majoritairement sur Microsoft 365, et leurs salariés lisent
leurs messages dans Outlook installé ou sur téléphone — invisible pour une
extension de navigateur.

**Ce qui la remplace.** Une plateforme serveur qui se branche aux messageries.
Microsoft 365 d'abord, via Microsoft Graph : le serveur analyse et pose une
catégorie plus une bannière injectée dans le corps du message, visible quel que
soit le client utilisé. La faisabilité est prouvée, voir la branche
`spike/graph-banniere` et son `SPIKE-OUTLOOK.md`.

Google Workspace viendra ensuite, et **pas via l'API Gmail** : les messages y
sont immuables, seuls les libellés sont modifiables. La voie à creuser est le
routage Google Workspace, qui intervient avant livraison.

**Conséquences dans ce dépôt.** Le moteur reste ici et n'est plus partagé : le
script de copie vers l'extension et ses vérifications de divergence ont été
supprimés le même jour. Le dépôt `safentreprise-extension` est archivé en
lecture seule ; sa copie du moteur porte encore un en-tête renvoyant à une
commande qui n'existe plus.

## Scripts de diagnostic

| Commande | Effet |
| --- | --- |
| `npm run db:apply` | Applique `supabase/schema.sql` et vérifie tables, RLS et politiques |
| `node scripts/verifier-colonnes.mjs` | Contrôle la présence des colonnes attendues |
| `node scripts/test-connexion.mjs "<url>"` | Teste une chaîne de connexion Postgres |
| `node scripts/test-openai.mjs` | Vérifie que la clé OpenAI répond |

## Modules

- **Onboarding** (3 étapes) : informations société, auto-évaluation du risque
  (9 questions, score par catégorie), résultat commenté.
- **Collaborateurs** : ajout manuel, import CSV/XLSX, suppression.
- **Campagnes** : choix des scénarios et des canaux, sélection des cibles,
  composition des messages par injection de variables dans les gabarits,
  relecture et modification manuelle, validation puis envoi réel.

Les messages sont composés à partir des gabarits `message_templates`
(`src/lib/templates/inject.ts`) — la génération par IA a été retirée. L'envoi
réel est opérationnel : emails via Resend, SMS via SMS Partner.

### Modèles et questions de quiz : système ou société

`message_templates` et `quiz_questions` portent une colonne `company_id` :

- `company_id` **null** = entrée **système**, livrée avec le produit. Visible
  par toutes les sociétés, modifiable par aucune.
- `company_id` renseigné = entrée **de la société**, qu'elle seule voit et gère.

Un client personnalise un gabarit système en le dupliquant dans sa société ; sa
copie prend alors la priorité à la composition. Ses questions de quiz, elles,
s'ajoutent aux questions système dans le quiz vu par le collaborateur.
