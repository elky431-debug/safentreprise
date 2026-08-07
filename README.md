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
| `SUPABASE_SECRET_KEY` | Clé de service, serveur uniquement |
| `OPENAI_API_KEY` | Génération des faux messages, serveur uniquement |
| `OPENAI_MODEL` | Facultatif, `gpt-4o-mini` par défaut |
| `DATABASE_URL` | Connexion Postgres directe, utilisée par `npm run db:apply` |

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
  rédaction des messages par IA (3 variantes par combinaison scénario × canal),
  relecture et modification manuelle, régénération, validation.

L'appel à l'IA a lieu exclusivement côté serveur (`src/lib/ai/generate-messages.ts`,
protégé par `server-only`) : la clé OpenAI n'atteint jamais le navigateur.
Aucun envoi réel de message n'est encore implémenté : une campagne validée passe
au statut « prête ».
