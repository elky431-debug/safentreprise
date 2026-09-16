# La règle des politiques RLS

**Arrêtée le 16 septembre 2026, après deux brèches de la même famille.**

> Une politique **sans clause `TO` s'applique à `PUBLIC`**, donc à `anon`.
> Toute politique doit donc **nommer son rôle** *et* **filtrer sur la société**.
> Les deux, pas l'un ou l'autre.

---

## Pourquoi cette règle, et pas une préférence de style

Au moment de l'inventaire, le dépôt portait **82 politiques**, dont **67 sans
clause `TO`**. Soixante-quatre d'entre elles étaient sauvées **par accident** :
leur condition passait par `auth.uid()` ou `get_my_company_id()`, qui rendent
`NULL` pour un visiteur anonyme — et `company_id = NULL` vaut `NULL`, donc pas
`true`, donc aucune ligne ne passe.

Les trois autres n'avaient pas cette chance, parce que leur condition ne parlait
ni de l'utilisateur ni de la société :

| Politique | Condition | Ce qui fuyait |
|---|---|---|
| `certificates_storage_select` | `bucket_id = 'certificates'` | La liste des clients et le résultat de leurs tests |
| `branding_storage_select` | `bucket_id = 'branding'` | La liste des clients |
| `demandes_demo_insert_public` | `WITH CHECK (true)` | Écriture libre dans la table des prospects |

**Une protection qui tient par accident tient jusqu'au jour où quelqu'un écrit
une condition un peu plus simple.** C'est exactement ce qui s'est passé : les
politiques de stockage ne filtrent pas sur la société parce qu'un bucket n'a
pas de `company_id` évident — il fallait aller le chercher dans le premier
segment du chemin. Le raccourci était plus court à écrire, et il ouvrait tout.

## Lister et télécharger sont deux portes différentes

Les buckets `branding` et `certificates` sont déclarés `public = true`. Pour un
bucket public, la lecture par l'URL `/storage/v1/object/public/…` **ne consulte
pas les politiques RLS**. Ces politiques ne gouvernent que l'**énumération**
(`storage.list()`), qui passe, elle, par `storage.objects`.

Conséquences, à connaître avant de raisonner sur ces deux buckets :

- Restreindre la politique `SELECT` **arrête l'énumération** sans casser une URL
  déjà distribuée. C'est ce qui est appliqué, et c'est voulu : un logo doit
  rester lisible par un salarié qui ouvre un message de simulation sans session,
  et une attestation mise en favori par un dirigeant doit continuer de s'ouvrir.
- Mais **quiconque a déjà énuméré le bucket conserve des URL valides**. La seule
  fermeture complète est de rendre le bucket privé et de servir les attestations
  par une route authentifiée qui délivre une URL signée. C'est une décision
  produit, pas une migration.

### Décision du 16 septembre 2026 : le bucket reste public, À REVOIR AVANT LE PREMIER CLIENT

**Arbitrage pris, et sa date de péremption.** Le listage est fermé ; le bucket
`certificates` reste public en lecture par URL. La bascule en bucket privé —
seule fermeture complète — est **reportée**, pour une raison qui cessera d'être
vraie :

> À cette date, Safentreprise n'a **aucun client**, donc **aucune attestation
> réelle**. Le bucket ne contient que des documents d'essai portant le nom de
> l'éditeur. Il n'y a rien à faire fuiter.

**Ce qui déclenche la revue : le premier client réel.** À partir du moment où une
attestation porte le nom d'une société tierce, son taux de clic et son effectif,
le raisonnement ci-dessus tombe, et l'arbitrage doit être repris — pas
reconduit par habitude.

**Ce qu'il faudra faire ce jour-là**, pour ne pas avoir à le redécouvrir :

1. Passer `certificates` en `public = false`.
2. Remplacer `getPublicUrl` par `createSignedUrl` dans
   `src/app/api/campaigns/[id]/certificate/route.ts`, ou servir le PDF par une
   route authentifiée qui vérifie la société avant de rediriger.
3. Traiter `certificates.url_pdf`, qui porte des URL publiques devenues
   caduques : soit les régénérer, soit ne plus stocker que le chemin.
4. Prévenir que les liens déjà distribués cesseront de fonctionner. C'est
   acceptable tant qu'aucun dirigeant n'en a mis un en favori — donc c'est
   d'autant plus simple que c'est fait tôt.

**Vérification faite le 16 septembre.** Les Edge Logs sur 24 h ne montrent
aucune requête de listage : uniquement du trafic interne Supabase sur
`/tenants` et `/health` depuis des adresses privées `10.113.x.x`. Aucune IP
externe, aucun `POST /storage/v1/object/list`. **La rétention est de 24 h en
offre gratuite** : cette absence ne vaut que pour la fenêtre visible, et ne dit
rien de ce qui a pu se produire avant. Ce n'est pas une preuve que rien n'est
sorti, c'est l'absence de preuve que quelque chose est sorti.

## Le piège qui m'a fait rendre un faux diagnostic

Le 16 septembre, j'ai signalé que `message_templates` et `quiz_questions`
étaient réécrivables par n'importe quel compte connecté. **C'était faux.**
`20260817_cloisonnement_modeles_quiz.sql` avait corrigé exactement cela un mois
plus tôt.

L'erreur venait de l'outil : mon inventaire relevait les `CREATE POLICY` sans
tenir compte des `DROP POLICY` qui les précèdent, et rendait donc des politiques
mortes comme vivantes. **Un inventaire de politiques doit rejouer les fichiers
dans l'ordre, DROP compris.** Le script ci-dessous le fait.

Il reste néanmoins un vrai défaut dans cette affaire : **`supabase/schema.sql`
porte encore les politiques d'avant le 17 août.** Elles sont mortes en
production, mais un `schema.sql` rejoué pour monter un environnement neuf les
ressusciterait. Le fichier de schéma doit refléter l'état courant, pas l'état
initial.

## Refaire l'inventaire

```bash
python3 - <<'PY'
import re, glob
fichiers = ["supabase/schema.sql"] + sorted(glob.glob("supabase/migrations/*.sql"))
etat = {}
jeton = re.compile(
    r"(?:(DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+([\w.]+)\s*;)"
    r"|(?:(CREATE)\s+POLICY\s+(\w+)\s+ON\s+([\w.]+)\s+FOR\s+(\w+)(.*?);)",
    re.S | re.I)
for f in fichiers:
    for m in jeton.finditer(open(f, encoding="utf-8").read()):
        if m.group(1):
            etat.pop((m.group(3).lower(), m.group(2)), None)
        else:
            cond = " ".join(m.group(8).split())
            role = re.search(r"\bTO\s+([\w, ]+?)\s+(?:USING|WITH)", cond, re.I)
            etat[(m.group(6).lower(), m.group(5))] = (
                f, m.group(7).upper(), role.group(1) if role else None, cond)
for (table, nom), (f, op, role, cond) in sorted(etat.items()):
    if role: continue
    if "auth.uid()" in cond or "get_my_company_id()" in cond: continue
    print(f"ATTEIGNABLE PAR anon : {table} {op} {nom}  [{f}]")
PY
```

Et, une fois la migration appliquée, la même chose contre la base elle-même :

```sql
SELECT schemaname, tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE 'anon' = ANY(roles) OR roles = '{public}'
 ORDER BY tablename, policyname;
```

Toute ligne qui sort de cette requête doit pouvoir être justifiée à voix haute.
Il en reste légitimement : les fonctions `SECURITY DEFINER` ouvertes à `anon`
(`get_target_by_token`, `marquer_clic`, `get_quiz_questions`, …) servent des
parcours sans session — un salarié qui répond au quiz après avoir cliqué sur un
message de simulation n'a pas de compte. Elles n'acceptent qu'un jeton
`randomUUID()`, soit 122 bits, et ne rendent que ce que ce jeton désigne.

## Ce qui n'était pas un problème

Vérifié le 16 septembre, à conserver pour ne pas refaire le travail :

- **Aucun secret dans le bundle client.** Aucun fichier lisant
  `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `WORKER_SECRET`, `MS_CLIENT_SECRET`
  ou `SMSPARTNER_API_KEY` n'est marqué `"use client"`, et aucun composant client
  n'importe `@/lib/supabase/server`, `@/lib/send/email`,
  `@/lib/microsoft/graph` ni `@/lib/microsoft/consentement`.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY` est publique par conception.** Elle n'est pas
  un secret : c'est RLS qui protège, pas la clé. D'où l'importance de la règle
  en tête de ce document.
- **Les 33 tables ont `ENABLE ROW LEVEL SECURITY`.** Aucune oubliée.
- **`parametres_systeme` est verrouillée** : `REVOKE ALL … FROM PUBLIC, anon,
  authenticated`. Le `worker_secret` et la `base_url` ne sont lisibles que par
  `service_role`.
- **Aucun identifiant en dur**, même commenté.
