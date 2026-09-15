# Fonctions SQL écrites, jamais appelées

**Créé le 15 septembre 2026**, après la correction de `maj_sante_tenant`.

Sur les 98 fonctions définies dans `supabase/migrations/`, huit n'étaient
référencées nulle part hors de leur propre définition. Le recensement se refait
ainsi :

```bash
grep -ohE "CREATE (OR REPLACE )?FUNCTION public\.[a-z0-9_]+" supabase/migrations/*.sql \
  | sed -E 's/.*public\.//' | sort -u
# puis, pour chacune : la chercher dans src/ et dans les migrations, en
# ignorant sa propre CREATE, ses GRANT/REVOKE et les commentaires.
```

**La leçon de `maj_sante_tenant`** : une fonction correcte, documentée,
accompagnée de sa fonction de file et de commentaires soignés — et que
personne n'appelait. Elle était censée détecter le retrait d'une autorisation
Microsoft ; pendant tout ce temps, un client coupé voyait « n boîtes
surveillées » pendant près de sept jours. **Écrire la fonction n'est pas
faire le travail.** Ce fichier existe pour que le reste ne dorme pas aussi
longtemps.

---

## À traiter — passe suivante

### 1. `marquer_echec_deplacement` — un message perdu en silence

**Gravité : haute.** Définie dans `20260926_marqueur_deplacement.sql`, révisée
exprès pour gagner un troisième paramètre (`p_sorti`), et appelée par personne.

Conséquence : quand le déplacement d'un message vers le dossier de service
échoue, **rien n'est enregistré**. Ni l'erreur dans `action_erreur`, ni surtout
la libération de `deplacement_at` lorsque le message n'a pas bougé. Or le
commentaire de la fonction est explicite : ce drapeau est *« la seule chose qui
dise au balayage d'aller rechercher »* un message sorti de sa boîte de
réception. Sans lui, un message légitime déplacé puis perdu n'est jamais
rattrapé.

Appelant attendu : le chemin d'action du worker, à côté des appels existants à
`marquer_action_graph` (`worker/route.ts:1032` et `:1062`).

### 2. `verifier_sceaux_journal` — la preuve d'intégrité que personne ne regarde

**Gravité : conformité.** Définie dans `20260915_journal_acces.sql`, section 6.
Son commentaire dit *« Rend une ligne par jour dont le sceau ne correspond plus.
Doit rester vide. »* — et **rien ne la regarde jamais**.

C'est le contrôle qui prouve que le journal d'accès n'a pas été réécrit après
coup. Le cron `safentreprise-journal-sceau` pose les sceaux chaque nuit ; aucun
ne les vérifie. Un journal dont personne ne contrôle l'intégrité ne prouve rien
en audit, ce qui est précisément ce qu'on lui demande
(`docs/JOURNALISATION-ACCES.md`).

À faire : l'exécuter dans la veille, avec alerte si elle rend la moindre ligne.
La vue `tenants_en_alerte` de `20261006` donne le modèle — une vue qui doit
rester vide, interrogée par la tâche planifiée.

---

## Traité

| Fonction | Sort |
|---|---|
| `maj_sante_tenant` | ✅ Appelée par `constater_sante_tenant` (`20261006`) |
| `tenants_a_verifier` | ✅ Appelée par `/api/microsoft/sante` ; son tri a été corrigé, il affamait sa propre file |

---

## Sans suite — ce sont des outils de requête

Ces fonctions n'ont pas d'appelant **et n'en attendent pas** : elles sont faites
pour être lancées à la main dans le SQL Editor. Les lister ici évite de les
« réparer » par erreur à la prochaine revue.

| Fonction | Usage |
|---|---|
| `compter_tenants_en_alerte` | Compteur de diagnostic |
| `taux_faux_positifs` | Mesure de qualité du moteur |
| `journal_extrait` | Lecture bornée du journal d'accès, sur demande |

## À supprimer

| Fonction | Motif |
|---|---|
| `enregistrer_activation_extension` | Extension Chrome abandonnée. Part avec la table `activations_extension` et `risk-extension.ts` |
