# Journalisation des accès aux données personnelles — conception

**Projet, non implémenté.** À valider avant écriture de code.

Objet : combler le manque déclaré à l'annexe 3, partie 2 du DPA, qui rend
inopérant l'engagement de notification de violation sous 48 heures (article 11
du DPA). Sans trace, une consultation non autorisée est indétectable.

---

## 1. Ce qui est traçable de façon fiable, et ce qui ne l'est pas

C'est la question qui commande tout le reste. La réponse honnête est que la
couverture sera **bonne sur le chemin applicatif et nulle sur l'accès direct à
la base**, sauf mesure complémentaire décrite au § 1.3.

### 1.1 Traçable, de façon fiable

| Accès | Pourquoi c'est fiable |
|---|---|
| **Tout appel à Microsoft Graph** — lecture d'un message, de l'annuaire, sondage d'une boîte, modification d'un corps, pose d'une catégorie | Un seul point de passage : `appelGraph()` dans `src/lib/microsoft/graph.ts:134`. Aucune fonction du produit n'appelle Graph autrement. |
| **Lecture d'un corps de message stocké** | Un seul point de passage : la fonction `corps_original_graph()` (`20260902:122`). Le journal s'écrit **dans la fonction**, pas dans l'appelant — elle trace donc aussi un appel lancé depuis l'éditeur SQL. |
| **Lecture du contexte de détection** (annuaire + domaines) | Idem : `contexte_detection_graph()` (`20260827:236`). |
| **Écriture d'une copie de corps** | `sauvegarder_corps_graph()`. Ce n'est pas une lecture, mais la création d'une copie de contenu mérite la même trace. |

Ces quatre points couvrent **l'intégralité des accès que le service effectue
aux données personnelles** dans son fonctionnement normal.

### 1.2 Non traçable par le code applicatif

| Accès | Pourquoi |
|---|---|
| **Connexion SQL directe avec `service_role` ou `postgres`** — éditeur SQL Supabase, `psql`, chaîne de connexion | **PostgreSQL n'a pas de déclencheur sur `SELECT`.** Aucun code en base ne peut observer une lecture de table. C'est une limite du moteur, pas un choix de conception. |
| **Lectures du client via PostgREST** — le dirigeant qui ouvre `/menaces` ou son annuaire | Ces requêtes partent en `.from().select()` filtré par RLS, sans passer par une fonction. Instrumentables en théorie, à un coût élevé (des dizaines de points d'insertion), pour tracer **le responsable de traitement lisant ses propres données** — ce n'est pas le risque visé. |
| **Accès de l'hébergeur** | Supabase et son infrastructure. Hors de portée. |
| **Accès côté Microsoft** | Le locataire du client, ses propres journaux. |

### 1.3 La mesure qui déplace la frontière

Aujourd'hui, `graph_corps_originaux` est révoquée pour `anon` et
`authenticated` — **mais pas pour `service_role`**, qui peut donc la lire
directement, sans passer par la fonction, donc sans trace.

**Proposition :** `REVOKE SELECT ON graph_corps_originaux FROM service_role`.
La fonction `corps_original_graph()` est en `SECURITY DEFINER` et continue de
fonctionner ; elle devient le **seul** chemin de lecture. Un vol de la clé
d'exploitation ne permettrait plus de lire les corps sans laisser de trace.

Vérifié : aucun code ne lit cette table autrement que par la fonction (seul
appelant : `maintenance/route.ts:708`). La révocation est sans effet de bord.

**Ce qui reste ouvert après cette mesure :** le rôle propriétaire `postgres`,
accessible par l'éditeur SQL du tableau de bord Supabase. C'est le compte du
dirigeant. **Aucune mesure applicative ne peut couvrir ce cas** — il faudrait
`pgaudit` (§ 6), et l'auditeur y serait la personne auditée.

---

## 2. Schéma

### 2.1 `journal_acces` — le journal

```sql
CREATE TABLE journal_acces (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- QUI. Jamais une personne physique : un rôle technique.
  acteur       TEXT NOT NULL,   -- 'worker' | 'maintenance' | 'veille'
                                -- | 'raccordement' | 'exploitation'
  tache        TEXT,            -- 'analyse-message', 'restauration', …

  -- POUR QUI. Des références, jamais un nom ni une adresse.
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  tenant_uid   UUID REFERENCES microsoft_tenants(id) ON DELETE SET NULL,

  -- QUOI.
  ressource    TEXT NOT NULL,   -- 'message' | 'corps' | 'annuaire'
                                -- | 'boite' | 'analyse'
  ressource_ref TEXT,           -- identifiant technique, JAMAIS une adresse
  operation    TEXT NOT NULL,   -- 'lecture' | 'ecriture' | 'modification'
                                -- | 'suppression'

  -- RÉSULTAT.
  resultat     TEXT NOT NULL,   -- 'ok' | 'refuse' | 'introuvable' | 'erreur'
  code         TEXT,            -- code HTTP ou code Graph, sans message
  volume       INTEGER          -- nombre d'enregistrements touchés
);
```

**Le journal ne contient aucune donnée personnelle.** Ni objet, ni adresse, ni
corps, ni nom. `ressource_ref` porte :

- pour un message : l'identifiant Graph (opaque, non réversible vers une
  personne sans accès au locataire du client) ;
- pour une boîte : **l'identifiant Graph de la boîte**, pas son adresse ;
- pour l'annuaire : rien, seulement `volume` (le nombre de personnes lues).

> **Point à trancher.** Un identifiant Graph de boîte est une donnée
> pseudonymisée : il désigne une personne pour qui détient l'annuaire. Il reste
> nécessaire pour qu'un journal serve à quelque chose — un journal qui ne dit
> pas *quelle* boîte a été lue ne prouve rien. Je propose de le conserver et de
> le dire, plutôt que de prétendre à un journal sans lien avec les personnes.

### 2.2 `journal_sceaux` — détecter l'effacement

L'exigence « personne ne doit pouvoir l'effacer sans que ça se voie » ne se
satisfait pas de droits : le propriétaire de la base les contourne. Elle se
satisfait d'une **empreinte chaînée**.

```sql
CREATE TABLE journal_sceaux (
  jour         DATE PRIMARY KEY,
  lignes       INTEGER NOT NULL,
  premier_id   BIGINT NOT NULL,
  dernier_id   BIGINT NOT NULL,
  empreinte    TEXT NOT NULL,   -- SHA-256 des lignes du jour + sceau précédent
  scelle_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Chaque nuit, une tâche scelle la veille : elle calcule l'empreinte des lignes
du jour **et du sceau de la veille**. Toute suppression, modification ou
insertion rétroactive dans un jour scellé casse la chaîne, et un contrôle le
révèle.

Deux précisions honnêtes :

- **le sceau ne rend rien immuable.** Il rend l'altération *visible*. Qui peut
  écrire dans `journal_acces` peut réécrire `journal_sceaux` — mais il faut le
  faire pour tous les jours suivants, ce qui est un acte délibéré et non une
  suppression discrète ;
- `digest()` vit dans le schéma `extensions`, pas `public` (cf.
  `20260909_jeton_sans_pgcrypto.sql`). La fonction devra le qualifier.

Alternative écartée : chaîner ligne à ligne. Chaque insertion devrait lire
l'empreinte précédente, ce qui sérialise toutes les écritures du journal. Le
sceau quotidien donne la même garantie pour un coût nul à l'écriture.

### 2.3 Droits

```sql
ALTER TABLE journal_acces ENABLE ROW LEVEL SECURITY;   -- aucune politique
REVOKE ALL ON journal_acces FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON journal_sceaux FROM PUBLIC, anon, authenticated, service_role;
```

Même traitement que `graph_corps_originaux`, **étendu à `service_role`** :

- **écriture** : uniquement par `journaliser()`, en `SECURITY DEFINER`,
  qui n'expose que l'`INSERT` ;
- **lecture** : uniquement par `journal_extrait()`, réservée à `service_role`,
  qui rend un extrait borné dans le temps ;
- **suppression** : uniquement par `purger_journal_acces()`, qui journalise
  sa propre exécution — une purge hors fenêtre laisse donc une trace ;
- `UPDATE` : accordé à personne. Le journal ne se corrige pas.

---

## 3. Points d'insertion

Quatre, pas davantage. Chacun est un point de passage obligé déjà existant.

| # | Où | Ce qui est tracé | Coût |
|---|---|---|---|
| 1 | `appelGraph()` — `graph.ts:134` | Chaque appel Graph : méthode, type de ressource, résultat, code | Écritures **groupées** en fin d'invocation (§ 5) |
| 2 | `corps_original_graph()` — dans la fonction SQL | Toute lecture d'un corps stocké | 1 `INSERT` dans la transaction existante — pas d'aller-retour |
| 3 | `contexte_detection_graph()` — dans la fonction SQL | Toute lecture de l'annuaire, avec le nombre de personnes | idem |
| 4 | `sauvegarder_corps_graph()` — dans la fonction SQL | Création d'une copie de corps | idem |

**Les points 2 à 4 tracent depuis l'intérieur de la fonction.** C'est
délibéré : un appel lancé depuis l'éditeur SQL est journalisé au même titre
qu'un appel du worker. Tracer dans l'appelant TypeScript n'aurait couvert que
le chemin applicatif.

Le point 1 est le seul qui trace côté application, parce que Graph est un
service externe : la base ne le voit pas.

---

## 4. Durée de conservation

**Proposition : 12 mois, purge automatique quotidienne.**

Justification :

- **elle ne doit pas être plus courte que la donnée qu'elle décrit.** Une
  analyse de message signalé est conservée 12 mois. Un journal de 6 mois
  laisserait, pendant six mois, des données dont l'historique d'accès aurait
  disparu ;
- **elle doit couvrir le délai de découverte d'une violation.** Une intrusion
  se découvre rarement le jour même ; six mois est la fourchette basse
  couramment retenue, douze la fourchette haute ;
- **la CNIL recommande, pour les journaux d'accès, une durée de six mois à un
  an**, au-delà de laquelle le journal devient lui-même un traitement à
  justifier ;
- **le volume le permet** (§ 5).

Si vous préférez 6 mois, l'argument tient aussi — c'est le minimum défendable.
Au-delà de 12 mois, il faudrait justifier pourquoi.

La purge s'ajoute aux tâches de nuit existantes (03:45–03:55), à 04:00. Elle
journalise son propre passage : `acteur = 'purge'`, `volume = lignes
supprimées`. Les sceaux, eux, **ne sont jamais purgés** : ils pèsent une ligne
par jour et leur suppression romprait la chaîne.

---

## 5. Coût

**Estimations, pas mesures.** À vérifier après implémentation.

### Volume

Hypothèse : une PME de 3 boîtes, 40 messages reçus par boîte et par jour.

| Origine | Lignes/jour |
|---|---|
| Lecture Graph d'un message | 120 |
| Modification d'un message signalé (2 appels Graph) | ~4 |
| Lecture du contexte de détection | ~30 (mis en cache par invocation) |
| Sauvegarde d'un corps | ~2 |
| Renouvellements, sondages, annuaire | ~5 |
| **Total** | **~160** |

À ~320 octets par ligne, index compris : **≈ 19 Mo par an et par client**.
Vingt clients : ≈ 380 Mo par an, stabilisés par la purge à 12 mois. Sur l'offre
Supabase actuelle, c'est absorbable — **à vérifier au tableau de bord avant de
lancer.**

### Latence

- **Points 2 à 4** : l'`INSERT` a lieu dans la transaction de la fonction
  appelée. **Aucun aller-retour supplémentaire.** Coût estimé : 0,2 à 0,5 ms.
- **Point 1** : les appels Graph d'une invocation sont accumulés en mémoire et
  écrits **en une seule insertion groupée** à la fin. Un aller-retour de plus
  par invocation du worker, soit ~10–15 ms pour un lot de 5 messages, ~3 ms par
  message. Le worker fait déjà plusieurs allers-retours par message.

**Le risque n'est pas la latence, c'est la perte.** Si l'invocation échoue
avant l'écriture groupée, les accès Graph de ce lot ne sont pas journalisés —
alors qu'ils ont eu lieu. Deux options :

- **(a)** écrire au fil de l'eau : aucune perte, un aller-retour par appel
  Graph (~10–15 ms × 120/jour, négligeable en volume mais qui allonge chaque
  message d'une dizaine de millisecondes) ;
- **(b)** grouper, et accepter la perte en cas de panne du worker.

**Je recommande (a).** Un journal qui perd des lignes précisément quand quelque
chose se passe mal est un journal sur lequel on ne peut rien fonder. La latence
supplémentaire est de l'ordre de 10 ms sur un traitement qui en prend déjà
plusieurs centaines.

---

## 6. Ce qui restera hors couverture

À écrire tel quel dans le DPA. **Ces limites ne disparaissent pas avec ce
travail ; elles se réduisent.**

1. **L'accès direct à la base par le rôle propriétaire.** L'éditeur SQL du
   tableau de bord Supabase, avec le compte du dirigeant. PostgreSQL n'ayant
   pas de déclencheur sur `SELECT`, aucune mesure en base ne peut l'observer.
2. **L'accès direct avec la clé `service_role`** — **couvert pour
   `graph_corps_originaux`** si la révocation du § 1.3 est retenue, **non
   couvert pour les autres tables** (`graph_analyses`, `annuaire_personnes`),
   qui restent lisibles directement par cette clé.
3. **Les lectures du client sur ses propres données** via l'interface. Non
   tracées, par choix.
4. **L'hébergeur** et son personnel.
5. **L'absence de séparation.** Celui qui lit le journal est celui qu'il
   surveille. Un journal ne crée pas de contrôle indépendant.

### `pgaudit` — complément possible, à ne pas surestimer

L'extension `pgaudit` journalise les instructions SQL, `SELECT` compris, y
compris celles du rôle propriétaire. Elle couvrirait le point 1.

Trois réserves, qui expliquent que je ne la propose pas en première étape :

- elle écrit dans les journaux PostgreSQL, dont **la rétention dépend de
  l'offre Supabase** et se compte en jours, pas en mois ;
- ces journaux sont lus depuis le même tableau de bord que celui dont on veut
  tracer l'usage : **aucune séparation** ;
- le volume est sans commune mesure — toutes les instructions, pas seulement
  les accès aux données personnelles.

À considérer comme mesure d'appoint, une fois le journal applicatif en place.

---

## 7. Ce qu'un journal seul ne fait pas

Un journal que personne ne lit ne détecte rien. La conception ci-dessus n'a de
valeur que complétée par un contrôle.

**Proposition, cohérente avec ce qui existe déjà :** une vue
`journal_en_alerte`, à joindre aux trois vues de contrôle actuelles
(`alertes_sans_banniere`, `abonnements_en_alerte`, `tenants_en_alerte`), que la
veille de nuit consulte et qui **doit rester vide**. Elle remonterait :

- une lecture de corps stocké (`ressource = 'corps'`) — rare par nature, une
  restauration se compte en unités par mois ;
- un accès dont l'acteur est `'exploitation'` ;
- une rupture de la chaîne des sceaux ;
- un jour sans aucune ligne alors que des messages ont été analysés.

C'est cette vue, et non le journal, qui rend l'engagement de notification sous
48 heures opérant.

**Elle n'est pas comprise dans la présente conception.** Elle en double à peu
près la charge. À arbitrer : sans elle, le journal permet de *démontrer* après
coup, mais pas de *découvrir*.

---

## 8. Décisions attendues

1. **La révocation de `SELECT` sur `graph_corps_originaux` pour
   `service_role`** (§ 1.3) — c'est elle qui change le plus la couverture réelle.
2. **La conservation de l'identifiant de boîte** dans `ressource_ref` (§ 2.1),
   donnée pseudonymisée, contre un journal moins précis.
3. **12 mois ou 6 mois** de conservation (§ 4).
4. **Écriture au fil de l'eau (a) ou groupée (b)** (§ 5).
5. **La vue de contrôle** (§ 7) : dans ce lot, ou dans un second.
