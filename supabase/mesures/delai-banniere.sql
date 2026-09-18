-- ============================================================================
-- Où part le temps entre la réception d'un message et l'apparition de la
-- bannière chez le salarié.
-- ============================================================================
--
-- À coller dans le SQL Editor Supabase. Lecture seule, rien n'est modifié.
--
-- POURQUOI CE FICHIER EXISTE. Cette mesure se relance après chaque changement
-- de la chaîne, pour comparer. Une requête qui ne vit que dans une
-- conversation est perdue à la première fermeture d'onglet, et on la réécrit
-- de mémoire — un peu différemment, donc incomparable.
--
-- ============================================================================
-- CE QUE CHAQUE SEGMENT MESURE
-- ============================================================================
--
--   t1  réception Microsoft  -> arrivée du webhook chez nous
--   t2  arrivée du webhook   -> passage du worker          (l'attente en file)
--   t3  passage du worker    -> verdict écrit              (Graph + analyse)
--   t4  verdict écrit        -> bannière écrite dans le corps
--   t5  bannière écrite      -> message revenu en boîte, donc VISIBLE
--
-- ⚠ `webhook -> mise en file` N'EST PAS UN SEGMENT, ET NE PEUT PAS EN ÊTRE UN.
--   La route insère la ligne COMME traitement de la notification : `recu_at`
--   est le même instant pour les deux. C'est un aller-retour HTTP vers
--   Supabase, quelques dizaines de millisecondes, et il n'y a rien à y
--   décomposer.
--
-- ⚠ `t5` N'EXISTE QUE DEPUIS LA MIGRATION 20260917. `banniere_posee_at` marque
--   la réponse de Graph à l'écriture du corps, mais Outlook pour Windows ne
--   relit pas le message à ce moment-là : il faut le sortir de la boîte et l'y
--   ramener. C'est `visible_at` qui date ce retour. Sur les messages
--   antérieurs à la migration, la colonne est NULL et ne peut pas être
--   reconstituée — l'instant n'a jamais été écrit.
--
-- ============================================================================
-- LA MESURE DE RÉFÉRENCE — 17 SEPTEMBRE 2026, AVANT LE RÉVEIL PAR WEBHOOK
-- ============================================================================
--
-- Trois trajets réels, en secondes. À comparer après chaque changement.
--
--   t1  réception Microsoft -> webhook        1,2  1,6  4,2
--   t2  attente en file                      13,9 24,7 57,7   <-- 80 % du délai
--   t3  worker (Graph + analyse)              0,6  1,1  0,9
--   t4  écriture de la bannière               1,0  1,0  0,8
--   t5  déplacement, retour en boîte          0,8    –    –
--   total vécu                               17,4
--
-- ⚠ `t2` N'EST PAS UNE LENTEUR, C'EST UNE LOTERIE. Entre 0 et 60 s selon
--   l'instant où le message tombe dans la minute de cron. Le 57,7 s d'un des
--   trajets n'est pas une anomalie : c'est un message arrivé juste après un
--   tour. C'est ce qui explique qu'un même produit paraisse tantôt réactif,
--   tantôt lent, sans que rien n'ait changé. Ne pas moyenner ces trois-là.
--
-- Le reste ne laisse rien à gagner : Microsoft notifie en 1,2 s, l'analyse
-- complète tient sous la seconde, et le déplacement — le trou qu'on a bouché
-- pour le savoir — coûte 0,8 s.
--
-- ============================================================================
-- APRÈS LE RÉVEIL PAR WEBHOOK — 18 SEPTEMBRE 2026
-- ============================================================================
--
--                        avant          après
--   t1 vers webhook    1,2–4,2 s        1,7 s
--   t2 attente file   13,9–57,7 s       0,3 s     <-- la loterie a disparu
--   t3 worker          0,6–1,1 s        0,5 s
--   t4 bannière        0,8–1,0 s        0,9 s
--   t5 déplacement       0,8 s          0,6 s
--   TOTAL VÉCU          17,4 s          4,0 s
--
-- Plus aucune étape ne domine. C'est le signe qu'il n'y a plus de gain simple
-- à prendre : les quatre segments restants sont du travail réel, pas de
-- l'attente.
--
-- ============================================================================
-- ⚠ CE CHIFFRE EST DEVENU UN ARGUMENT COMMERCIAL. IL DOIT RESTER VRAI.
-- ============================================================================
--
-- « L'alerte apparaît en moins de cinq secondes » est dit aux prospects. Une
-- promesse de délai qui cesse d'être tenue sans que personne le voie est pire
-- que pas de promesse du tout : elle se découvre devant un client.
--
-- RELANCER CE FICHIER À CHAQUE CHANGEMENT DE LA CHAÎNE, et au moins une fois
-- par trimestre même sans changement. Le seuil à surveiller est le p90 de
-- `total_median` de la requête 2 — pas la médiane : la promesse porte sur ce
-- que vit le client malchanceux.
--
-- QUATRE CHOSES PEUVENT LE FAIRE REMONTER, dans l'ordre de probabilité :
--
-- 1. LE RÉVEIL CESSE DE PARTIR, en silence. C'est le plus probable et le plus
--    discret : `t2` remonterait seul à 0–60 s, et tout le reste paraîtrait
--    normal. Symptôme exact : `t2` redevient une loterie. Contrôle :
--      SELECT id, created, url, status_code, error_msg
--        FROM net._http_response ORDER BY created DESC LIMIT 20;
--
-- 2. LA CHARGE. Le worker traite par lots de 5, EN SÉRIE. Le cinquième message
--    d'une rafale attend les quatre autres — son `t3` porte l'attente des
--    autres. Avec un seul client la question ne se pose pas ; elle se posera
--    au premier client à gros volume. Ce jour-là, regarder `LOT` dans
--    `src/app/api/microsoft/worker/route.ts` avant de conclure à une lenteur.
--
-- 3. LE DÉMARRAGE À FROID de la fonction Netlify. Symptôme : `t3` très
--    supérieur à `duree_ms`, qui ne mesure que le travail une fois la fonction
--    chaude.
--
-- 4. MICROSOFT. `t1` ne dépend pas de nous. S'il domine, il n'y a rien à
--    corriger de notre côté — mais il faut le savoir avant de chercher
--    ailleurs, et le dire au client plutôt que de promettre ce qu'on ne tient
--    plus.
--
-- ============================================================================
-- TROIS RÉSERVES, À LIRE AVANT DE CONCLURE
-- ============================================================================
--
-- 1. `t1` COMPARE DEUX HORLOGES. `graph_analyses.recu_at` vient de
--    `receivedDateTime`, donc de l'horloge d'Exchange ; tout le reste vient de
--    celle de Postgres. Les deux sont synchronisées par NTP et l'écart devrait
--    rester sous la seconde. Un `t1` négatif ou aberrant est un décalage
--    d'horloge, PAS une notification instantanée.
--
-- 2. LE FILTRE `origine = 'webhook'` N'EST PAS COSMÉTIQUE. Une ligne d'origine
--    `delta` vient du rattrapage de la maintenance, qui ne tourne que toutes
--    les 10 minutes et ne regarde chaque boîte qu'au quart d'heure : son `t1`
--    mesurerait la période du rattrapage, pas la latence de Microsoft.
--
-- 3. LE WORKER TRAITE PAR LOTS DE 5, EN SÉRIE. Sur un message de test isolé,
--    sans effet. Dès qu'il y en a plusieurs, le `t3` du cinquième contient
--    l'attente des quatre autres — ce n'est pas une lenteur de la chaîne, mais
--    une file. Regarder le nombre de lignes réclamées dans la même seconde
--    avant d'incriminer `t3`.
--
-- ============================================================================
-- 1. LE DÉTAIL, MESSAGE PAR MESSAGE
-- ============================================================================

SELECT
  left(f.message_id, 12) || '…'                            AS message,
  a.niveau,
  a.recu_at                                                AS recu_microsoft,

  extract(epoch FROM f.recu_at    - a.recu_at)             AS t1_vers_webhook,
  extract(epoch FROM f.reclame_at - f.recu_at)             AS t2_attente_file,
  extract(epoch FROM a.analyse_at - f.reclame_at)          AS t3_worker,
  a.duree_ms / 1000.0                                      AS "  dont graph+analyse",
  extract(epoch FROM a.banniere_posee_at - a.analyse_at)   AS t4_ecriture_banniere,
  extract(epoch FROM a.visible_at - a.banniere_posee_at)   AS t5_deplacement,

  extract(epoch FROM a.visible_at - a.recu_at)             AS total_vecu,
  a.deplacements

FROM graph_file_attente f
JOIN graph_analyses a
  ON a.company_id = f.company_id AND a.message_id = f.message_id
WHERE f.origine = 'webhook'
  AND a.recu_at > now() - interval '2 days'
ORDER BY a.recu_at DESC
LIMIT 30;

-- ============================================================================
-- 2. LA MÉDIANE ET LE PIRE CAS
-- ============================================================================
--
-- ⚠ LA MÉDIANE, PAS LA MOYENNE. L'attente en file va de 0 à 60 s selon
--   l'instant d'arrivée dans la minute : une seule reprise sur erreur, qui
--   ajoute plusieurs minutes, déplacerait une moyenne et laisserait croire à
--   une lenteur générale. Le 90e centile dit ce que vit le salarié malchanceux.

WITH t AS (
  SELECT
    extract(epoch FROM f.recu_at    - a.recu_at)           AS t1,
    extract(epoch FROM f.reclame_at - f.recu_at)           AS t2,
    extract(epoch FROM a.analyse_at - f.reclame_at)        AS t3,
    extract(epoch FROM a.banniere_posee_at - a.analyse_at) AS t4,
    extract(epoch FROM a.visible_at - a.banniere_posee_at) AS t5,
    extract(epoch FROM a.visible_at - a.recu_at)           AS total
  FROM graph_file_attente f
  JOIN graph_analyses a
    ON a.company_id = f.company_id AND a.message_id = f.message_id
  WHERE f.origine = 'webhook'
    AND a.visible_at IS NOT NULL
    AND a.recu_at > now() - interval '7 days'
)
SELECT
  count(*)                                                       AS messages,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t1)::numeric, 1) AS t1_median,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t2)::numeric, 1) AS t2_median,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t3)::numeric, 1) AS t3_median,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t4)::numeric, 1) AS t4_median,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t5)::numeric, 1) AS t5_median,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY total)::numeric, 1) AS total_median,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY total)::numeric, 1) AS total_p90,
  round(max(total)::numeric, 1)                                  AS total_pire
FROM t;

-- ============================================================================
-- 3. CE QUI N'EST JAMAIS DEVENU VISIBLE
-- ============================================================================
--
-- Une bannière écrite mais jamais revenue en boîte est invisible pour le
-- salarié. Cette requête doit rendre zéro ligne ; toute ligne qui en sort est
-- un message alerté que personne n'a vu.

SELECT
  left(a.message_id, 12) || '…' AS message,
  a.niveau,
  a.banniere_posee_at,
  a.deplacement_at              AS deplacement_annonce_jamais_termine,
  a.action_erreur
FROM graph_analyses a
WHERE a.banniere_posee_at IS NOT NULL
  AND a.visible_at IS NULL
  AND a.banniere_posee_at > now() - interval '7 days'
  AND a.banniere_posee_at < now() - interval '10 minutes'   -- laisse finir les cours
ORDER BY a.banniere_posee_at DESC
LIMIT 20;
