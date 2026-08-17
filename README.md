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
