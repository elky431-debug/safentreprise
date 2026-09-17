# Direction artistique — Safentreprise

Version 2. Remplace intégralement la précédente.
Document de référence : toute page, existante ou nouvelle, s'y conforme.
Si un choix n'est pas écrit ici, demander avant de décider.

---

## Ce qui change par rapport à la version 1, et pourquoi

Trois décisions de la version 1 étaient mauvaises. Elles sont annulées.

**Le rayon unique à 4 px.** Je l'avais justifié par la discipline. À l'écran,
ça donne une grille de rectangles qui ressemble à un tableur, pas à un
produit. Le rayon fait partie de l'identité, pas du bruit.

**La largeur maximale à 1280 px.** Sur un écran ordinaire, ça laisse deux
bandes vides à gauche et à droite, et le contenu semble flotter au milieu.
Un outil de travail occupe l'espace qu'on lui donne.

**L'ordre du tableau de bord.** Le graphique doit venir avant le tableau des
tentatives : on regarde la forme avant de lire le détail.

Ce qui ne change pas : la typographie d'EtSmart, l'absence de capitales
intégrales et de points médians, et le fait que la couleur reste rare et
justifiée.

> **Quatrième correction, ajoutée le soir du 16 septembre.** Le monochrome
> intégral — niveaux de risque en valeurs d'encre — avait été décidé le matin
> même et appliqué. À l'écran, il rendait le tri plus lent : il fallait lire les
> mots. La couleur revient sur le niveau de risque, assourdie. Voir la section
> Couleur.

---

## Typographie

**Une seule famille, celle d'EtSmart : Sora.**

> **Relevée dans le dépôt le 16 septembre 2026, pas devinée — et le dépôt
> piégeait la lecture.** `src/app/globals.css` d'EtSmart déclare
> `body { font-family: 'Inter', 'SF Pro Display', … }`. C'est faux deux fois :
> `layout.tsx` applique Sora en **style en ligne** sur `<body>`, ce qui
> l'emporte sur la feuille de style ; et Inter n'est importée nulle part, donc
> la déclaration retomberait de toute façon sur une police système. Seules
> `Sora` et `DM_Sans` sont chargées par `next/font/google`, et `--font-dm`
> n'est référencée nulle part.

```css
font-family: 'Sora', system-ui, -apple-system, sans-serif;
```

Chargée en **variable**, sans liste de graisses : l'axe couvre 300–700 en un
seul fichier, et le 700 du titre de page est un vrai dessin plutôt qu'un gras
synthétique.

Aucune serif nulle part.

### Échelle

| Rôle | Taille | Graisse | Interlettrage | Interligne |
|---|---|---|---|---|
| Titre de page | 34 px | 700 | −0.03em | 1.05 |
| Titre de section | 21 px | 600 | −0.015em | 1.2 |
| Titre de bloc | 16 px | 600 | −0.01em | 1.3 |
| Texte courant | 15 px | 400 | 0 | 1.55 |
| Texte secondaire | 13.5 px | 400 | 0 | 1.5 |
| En-tête de tableau | 12.5 px | 600 | 0 | 1.2 |
| Chiffre de données | 15 px | 600 | 0 | 1 · `tabular-nums` |
| Chiffre d'accroche | 56 px | 700 | −0.035em | 1 · tabulaire |

Le serrage négatif sur les gros titres est la signature. Il doit se voir.
Texte courant : 70 caractères par ligne au maximum.

> **`tabular-nums` est obligatoire avec Sora, pas décoratif.** Mesuré sur le
> fichier de police réel, à 40 px :
>
> | | sans `tabular-nums` | avec |
> |---|---|---|
> | dix « 1 » | 168,00 px | 270,41 px |
> | dix « 0 » | 297,20 px | 270,41 px |
>
> Les chiffres de Sora sont **proportionnels par défaut** : le « 1 » est 43 %
> plus étroit que le « 0 ». La fonction `tnum` existe et fonctionne, mais il
> faut la demander. Sans elle, le compteur animé du tableau de bord saute à
> chaque incrément et aucune colonne chiffrée ne s'aligne. **Partout où un
> chiffre change ou s'aligne, la propriété est exigée.**

### Capitalisation

Phrase capitalisée partout, sans exception. Aucune capitale intégrale, nulle
part — pas même sur une étiquette de trois lettres.

---

## Couleur

L'interface est en encre sur papier, et la couleur y est rare. **Deux emplois,
deux seulement : le niveau de risque, et la panne du produit.** Ce qui les
sépare n'est pas la teinte — les deux tirent vers le rouge — c'est
**l'intensité**.

```css
--encre:        #0D1F3C;  /* marine profond — texte, boutons, surfaces sombres */
--encre-douce:  #5A6B84;  /* texte secondaire, en-têtes de tableau */
--trait:        #DDE2E9;  /* séparateurs, bordures */
--papier:       #F4F6F9;  /* fond de page */
--surface:      #FFFFFF;  /* cartes, tableaux, panneaux */

--danger:       #C8102E;  /* panne produit uniquement */
--warning:      #B5670A;  /* panne produit uniquement */
```

### Le niveau de risque est coloré, mais en sourdine

**Décision du 16 septembre 2026, qui annule le monochrome intégral pris le matin
même.** Le tri par la teinte redevient instantané. Ce qui reste écarté, c'est le
feu tricolore saturé, pas la couleur.

| Niveau | Fond | Texte | Contraste | Saturation |
|---|---|---|---|---|
| Élevé | `#9D3F49` | blanc | 6,48:1 | 60 % |
| Modéré | `#9A6B39` | blanc | 4,63:1 | 63 % |
| Faible | `#E3EDE6` | `#3F6B52` | 5,10:1 | 4 % |

> **L'ambre assourdi corrige un défaut d'accessibilité qui traînait.** L'ancien
> ambre vif `#B5670A` donnait **4,28:1** sur blanc, donc **sous le seuil AA de
> 4,5:1**. La version sourde passe à 4,63:1. Assourdir n'a pas coûté en
> lisibilité : ça en a rendu.

⚠ `--faible` est un fond, jamais une couleur de texte : sur du blanc il tombe
à 1,19:1. Son texte est `--faible-texte`, et les deux se déplacent ensemble.

### La saturation sépare une donnée d'une panne

`--eleve` et `--danger` sont tous deux rouges. L'un dit « cette tentative est
grave », l'autre « la surveillance est interrompue ». À teinte proche, seule
l'intensité les distingue :

```
--eleve    60 % de saturation    une donnée
--danger   92 % de saturation    un geste technique à faire
```

**Ne jamais saturer `--eleve` pour « qu'il se voie mieux ».** Il se confondrait
avec le bandeau de panne, qui est le seul état de l'écran exigeant une action
immédiate. Une page peut porter dix pastilles « élevé » sans que rien ne soit
cassé ; elle ne porte le bandeau rouge vif que si le produit ne fonctionne
plus.

### La règle qui décide

Trois cas, et rien d'autre ne porte de couleur :

- un **niveau de risque** porte sa teinte sourde ;
- une **panne du produit** porte `--danger` ou `--warning`, saturés ;
- **tout le reste** — compteurs, motifs, filtres, segments actifs, états sains,
  navigation — reste en valeur d'encre.

Le test, pour une page qu'on n'a pas encore vue : **est-ce que cet objet dit une
gravité, ou un geste technique à faire ? Si ni l'un ni l'autre, il reste en
encre.** Un motif de détection n'est pas une gravité : il dit pourquoi le moteur
a alerté, pas à quel point c'est grave. Un filtre actif n'en est pas une non
plus : c'est une commande de navigation.

---

## Formes et rayons

C'est la correction principale. L'interface doit avoir des courbes.

| Élément | Rayon |
|---|---|
| Boutons, pastilles, étiquettes | plein arrondi (`9999px`) |
| Cartes, panneaux, encadrés | 16 px |
| Conteneurs de tableau | 14 px |
| Champs de formulaire, sélecteurs | 12 px |
| Blocs internes, dépliants | 10 px |

La hiérarchie se lit par la taille du rayon : plus le bloc est grand, plus il
est arrondi. Un bouton plein arrondi à côté d'une carte à 16 px crée le
contraste de formes qui manquait.

### Un pictogramme seul ne va jamais dans un cercle

Règle générale, pas une exception locale. Un bouton carré ou un cartouche qui
ne porte qu'une icône prend le **rayon des blocs internes, 10 px** — jamais le
plein arrondi, même si c'est un élément de commande.

À 28 px, une pilule est un cercle, et le pictogramme dans un rond est
exactement le tic générique que cette direction élimine. La règle vaut partout :
chevrons de dépliage, cartouches d'icône dans les listes, états vides, bandeaux
d'alerte, et la bannière Outlook.

Un bouton qui porte **une icône ET un mot** reste en plein arrondi : c'est le
mot qui en fait une commande, pas l'icône.

> **Ne pas réintroduire de règle balai.** La v1 posait
> `[class*="rounded"] { border-radius: 4px }` sur tout le sous-arbre de
> l'application. Tant qu'elle tenait, poser `rounded-full` sur un bouton ne
> changeait rien. Elle est retirée ; chaque composant porte désormais son
> rayon, pris dans les cinq jetons `--rayon-*`.

Pas d'ombres portées douces. Une bordure `1px --trait` sépare, un fond blanc
sur papier gris suffit à détacher.

---

## Largeur et espacement

**Le contenu occupe l'espace disponible.** Pas de colonne étroite au milieu
d'un écran large.

| Élément | Valeur |
|---|---|
| Largeur maximale du contenu | 1680 px |
| Marge latérale, ordinateur | 40 px |
| Marge latérale, téléphone | 20 px |
| Rembourrage interne des cartes | 24 px |
| Écart entre sections | 32 px |
| Hauteur de ligne de tableau | 44 px |

Base d'espacement de 4 px. Valeurs autorisées : 4, 8, 12, 16, 24, 32, 40, 48.

La densité reste haute à l'intérieur des blocs — c'est un outil de travail.
Ce qui change, c'est que les blocs eux-mêmes vont chercher les bords.

---

## L'ordre du tableau de bord

De haut en bas :

1. Le bandeau d'état du raccordement, s'il y a quelque chose à dire
2. Le titre et les actions
3. **Le graphique des tentatives dans le temps**
4. **Le tableau des tentatives récentes**
5. Les campagnes
6. **Le taux d'exposition et son détail**, en bas de page

On regarde la forme avant de lire le détail. Le graphique répond à « comment
ça va », le tableau à « qu'est-ce qui s'est passé ».

> **Le taux d'exposition est descendu en bas le 16 septembre 2026.** Il ouvrait
> la page ; il la conclut. La page commence donc par ce qui s'est passé et
> finit par ce que ça vaut.
>
> Réserve posée au moment du déplacement, à réévaluer si l'écran déçoit : un
> chiffre de 56 px qui n'est jamais dans le premier écran n'est plus une
> affirmation, c'est une conclusion. Ce n'est pas forcément un défaut — on peut
> vouloir qu'une page finisse sur le score plutôt qu'elle ne commence par lui —
> mais c'est un rôle différent de celui que décrivait la v2 initiale.

---

## Structure

**Les bordures encodent une information.** Une bordure sépare deux natures de
contenu. Deux blocs de même nature se séparent par l'espace.

Supprimer : les filets sous chaque titre, les cadres autour de chaque groupe,
les séparateurs verticaux entre colonnes.

**Alignement à gauche partout**, sauf les colonnes numériques d'un tableau,
alignées à droite pour comparer les ordres de grandeur à l'œil.

**Le monospace, deux exceptions, et deux seulement.**

**La première : le script PowerShell** que l'administrateur copie dans sa
console, sur la page Connexion Microsoft. Un script dont l'indentation ne
s'aligne plus est plus difficile à relire, et c'est un texte destiné à SORTIR
de l'interface pour être collé ailleurs. Tout `<pre>` de cet écran porte la
classe `script`.

> La v1 du document portait cette exception ; la v2 l'avait perdue. Le
> 16 septembre 2026, les dix blocs `<pre>` de la page Microsoft ont été
> retrouvés **sans la classe** : ils portaient `font-mono`, que
> `.canevas-app` neutralise en Sora. Les scripts rendaient donc en police
> proportionnelle depuis le 15 septembre, avec une indentation qui ne
> s'alignait plus. Corrigé en même temps que l'exception a été réécrite ici.

**La seconde : l'adresse de l'expéditeur** dans les tableaux de menaces, parce que c'est la chaîne qu'on demande au lecteur
d'épeler caractère par caractère. Mesure : en grotesque 13 px, `rn` et `m`
diffèrent de 0,46 px ; en JetBrains Mono, de 7,80 px. Nulle part ailleurs —
pas le nom affiché, pas les objets, pas les dates, pas la boîte du client
lui-même, qu'il reconnaît sans la déchiffrer.

---

## Le seul endroit où l'on s'affirme

**Le chiffre d'exposition**, en bas du tableau de bord. 56 px, graisse 700,
serrage −0.035em, avec sa légende en 13.5 px juste dessous. Rien d'autre sur
la page ne dépasse 34 px.

Tout le reste reste discipliné et silencieux. C'est le contraste qui produit
l'effet, pas l'accumulation.

---

## La vitrine suit la direction, à une échelle près

**Arrêté le 17 septembre 2026.** La vitrine porte `canevas-app`, comme
l'application. La typographie, les couleurs, les rayons et la casse sont les
mêmes. **La seule différence admise est l'échelle** : titres plus grands,
respirations plus grandes, et des images — que l'application n'a pas.

Le motif tient en une phrase : **ce sont deux moments, pas deux marques.** Un
prospect qui voit la page d'accueil puis entre dans le produit doit reconnaître
le même objet. Et Safentreprise vend de la sécurité : une vitrine plus
chaleureuse que l'outil serait un décalage de promesse, pas une nuance de ton.

Ce qui change légitimement, c'est la **densité** — on lit une landing debout, de
loin, une fois ; on lit un tableau de bord assis, de près, tous les jours. D'où
`.canevas-app.vitrine`, qui ne redéfinit qu'une échelle (l'échelle de l'écran
× 1,25, les rapports conservés) et deux respirations. Le sélecteur combiné est
délibéré : `.vitrine` seule ne peut rien redéfinir, donc une page publique qui
l'oublierait rendrait à l'échelle de l'application, jamais à l'ancienne charte.

### Ce que la bascule a coûté, et ce qu'elle a rapporté

| | avant | après |
|---|---|---|
| Familles rendues sur `/` | 4 (Sora : **0**) | 1 (Sora) |
| Fichiers de police par page | 9 | **2** |
| Poids des polices | 308 Ko | **72,4 Ko** |
| Rouges distincts sur `/` | 3, aucun n'étant `--eleve` | 1 (`--eleve`) + le voyant |
| Rayons distincts sur `/` | 7 | 5 |

**La typo était aussi un sujet de performance.** Neuf familles étaient
déclarées sur `<html>` et les neuf partaient sur chaque page — `/diagnostic`
les **préchargeait** toutes en priorité haute alors qu'elle n'en dessine que
deux. Trois ne rendaient nulle part du tout : Archivo, Instrument Serif et
Sacramento, zéro référence dans `src/`. **236 Ko de moins sur le premier écran
que voit un prospect**, soit 77 %.

**Ce qui est tombé avec elles, pour ne pas le rechercher :** le titre du hero
en Bricolage Grotesque, retenu sur planche comparative contre quatre serifs, et
son réglage à trois valeurs. C'était un bon choix dans une charte où la vitrine
avait sa propre typographie ; cette charte n'existe plus. La taille et la
graisse du titre n'ont pas bougé, seule la famille.

### Le voyant de la bande de motifs — la seule exception de couleur

Le point rouge qui précède chaque motif de la bande marine **reste vif**, et il
a désormais un jeton : `--voyant: #F2564D`.

> **Un voyant attire l'œil : c'est sa fonction, et ce n'est pas une donnée.** La
> règle des couleurs sourdes vaut pour ce qui se **lit** comme une information,
> pas pour un point qui signale qu'une bande vit.

Et la mesure ferme le débat. Sur le marine `#0F2444`, seuil de 3:1 pour un objet
graphique :

| | contraste | |
|---|---|---|
| `--voyant` `#F2564D` | 4,58:1 | conforme |
| `--eleve` `#9D3F49` | 2,39:1 | sous le seuil |
| `--danger` `#C8102E` | 2,63:1 | sous le seuil |

**Aligner le voyant sur `--eleve` ne le rendrait pas discret, il le rendrait
invisible.** Les teintes sourdes ont été choisies pour du texte et des aplats
sur fond **clair** ; sur marine, elles n'ont plus de contraste. C'est la limite
de la règle, et elle méritait d'être écrite.

Il porte un jeton parce qu'il en avait besoin : ce rouge vivait en dur dans une
règle CSS, donc invisible à tout inventaire de couleurs — un rouge de plus dans
la page, que personne n'avait choisi. **Un écart assumé porte un nom ; un écart
anonyme est un oubli.**

### `--eleve` n'est pas un synonyme de `--danger`, et la vitrine les confondait

La vitrine posait `text-danger` et `bg-danger` sur ses **illustrations de
fraude** : les puces de signaux, l'exemple de message, le comparateur. Or
`--danger` dit « la surveillance est interrompue » — une panne à réparer — et
il est 32 points de saturation au-dessus de `--eleve`, qui dit « cette
tentative est grave ». Un exemple pédagogique portait donc l'intensité d'une
alarme produit. Ces surfaces passent à `--eleve` ; `--danger` reste sur les
messages d'erreur, qui sont bien des pannes.

### `--clair-danger` est mort en dernier, et c'était l'ordre à tenir

Tant qu'une page publique lisait `--danger` hérité de `:root`, le supprimer
aurait fait **disparaître** le rouge au lieu de le changer. Il est donc tombé
une fois la dernière surface — `/t/[token]`, l'écran que voit un salarié qui a
cliqué — entrée sous le canevas.

Ce qui reste est plus simple qu'avant : **`--danger` a une seule valeur.** Le
fichier en portait deux sous le même nom — `#c0392b` à `:root`, `#c8102e` dans
`.canevas-app` — et laquelle s'appliquait dépendait de l'endroit où l'on se
trouvait. La redéfinition dans `.canevas-app` a disparu avec.

### Une teinte se transporte avec son rôle, pas avec sa valeur

**C'est la même leçon, rencontrée trois fois dans la même passe**, et elle vaut
d'être énoncée une fois pour toutes :

| | ce qui marchait | ce qui aurait cassé |
|---|---|---|
| Le voyant | `#F2564D` sur marine, 4,58:1 | `--eleve`, 2,39:1 — invisible |
| L'ambre du diagnostic | `#8F5F00` en texte, 4,90:1 | `--modere`, 4,11:1 — sous AA |
| Le liseré modéré | `--modere` en objet graphique, 4,32:1 | conforme : seuil 3:1, pas 4,5:1 |

> Les teintes sourdes de cette direction ont été choisies **pour du texte et
> des aplats sur fond clair**. Posées sur marine, elles perdent leur contraste ;
> posées en texte sur un fond teinté, elles passent sous le seuil AA. Le même
> jeton est juste ou faux selon le fond et selon le rôle.

**Conséquence assumée : l'ambre du mail de diagnostic reste désaligné.** Le
palier « significatif » est `--modere` à l'écran, sur fond clair, et `#8F5F00`
dans le mail, sur fond ambre pâle. Ce n'est **pas un oubli**, c'est le prix
d'un texte qui reste lisible. Le rouge, lui, s'aligne aux deux endroits, parce
que rien ne l'en empêche.

Ne pas « finir l'alignement » sans remesurer sur le fond réel et pour le rôle
réel. La mesure prend une minute ; elle a déjà évité deux régressions ici.

### Le score du diagnostic se colore, et on ne le décolore pas

`--eleve` à l'écran comme dans le mail. Un score d'exposition est une **donnée
de risque**, au même titre qu'un niveau de menace dans le tableau de bord.

L'option « neutre partout » a été écartée délibérément, et la raison mérite
d'être écrite : **le diagnostic est l'outil de conviction du produit.** Un
dirigeant qui découvre son exposition doit voir que le résultat est mauvais.
Retirer la couleur ici, c'est retirer le signal au seul endroit où il travaille.

### Deux défauts que seule la couleur calculée pouvait montrer

Vérifier la bascule en **relisant la couleur rendue** plutôt que le code a fait
sortir deux choses que personne ne cherchait.

**1. Le liseré de la pastille de palier était gris depuis toujours.** Le code
portait bien `border-eleve/25` — et cette classe ne s'appliquait pas : la règle
balai `* { border-color: var(--border) }` n'est dans aucune couche, donc elle
bat tous les utilitaires de bordure. Le liseré est désormais posé en style en
ligne. Le même piège est documenté dans `SecteursOnglets` ; il a coûté deux
fois.

**2. `--warning` avait deux valeurs, et la bascule a déplacé le défaut sous
l'œil.** `:root` portait `#8F5F00`, `.canevas-app` portait `#B5670A`. En
faisant entrer `/diagnostic` sous le canevas, le bloc « Nous ne couvrons pas
encore cette messagerie » est passé de l'un à l'autre — **de 5,06:1 à 3,92:1**
sur son propre fond, sous le seuil AA. Le défaut existait déjà pour tout
`text-warning` de l'application ; la bascule l'a seulement amené là où on
regardait. `#8F5F00` est maintenant la seule valeur.

> **Une classe posée n'est pas une propriété appliquée**, et un jeton défini
> deux fois n'a pas de valeur, il en a deux. Les deux ne se voient qu'en lisant
> ce que le navigateur calcule.

---

## La bannière dans Outlook

C'est l'objet le plus vu du produit : chaque salarié la lit dans son courrier.

### Aucune image, nulle part

**Règle, pas préférence.** La bannière ne contient pas une seule image : ni logo
client, ni logo éditeur, ni pictogramme illustré.

**Le motif tient en une phrase : Outlook bloque les images distantes par
défaut.** Tant que le lecteur n'a pas cliqué sur « Télécharger les images » —
ce que la plupart ne font jamais — une image n'existe pas. Tout le soin qu'on
met dedans est du soin invisible : la pastille blanche pour survivre au thème
sombre, la largeur pour que le mot reste lisible, le comportement de repli
quand le fichier échoue. Trois problèmes réels, résolus pour rien.

**Le texte, lui, arrive toujours.** Du premier coup, dans tous les clients. Et
il est recoloré intelligemment en thème sombre, ce qu'aucun PNG ne fait.

Les pictogrammes de niveau sont des **caractères** — `⚠`, `▲`, `ℹ` — pris dans
le plan multilingue de base : ils s'affichent partout, y compris dans un client
qui ne connaît aucune émoticône.

### Ce qu'elle porte, dans cet ordre

1. Le titre de l'alerte et son niveau.
2. Les motifs, en phrases complètes — ce qui a été détecté et pourquoi.
3. La conduite à tenir, en une phrase impérative.
4. « Powered by Safentreprise », en texte, en bas à droite.

Fond : un aplat très clair, le ton de l'alerte et non un aplat criard.
Rayon 12 px.

### Les liserés sont ceux de l'application

Un client qui voit deux rouges différents pour la même gravité, selon qu'il
regarde son courrier ou son tableau de bord, peut croire à deux choses
différentes. Les liserés reprennent donc les jetons de risque.

| Niveau | Fond | Liseré | Contraste du liseré |
|---|---|---|---|
| Élevé | `#FDF2F2` | `#9D3F49` | 5,91:1 |
| Modéré | `#FEF6EC` | `#9A6B39` | 4,32:1 |
| Faible | `#F1F2F4` | `#B6BCC6` | — |

> **Et l'alignement a corrigé un défaut.** L'ancien liseré ambre `#D68910` ne
> donnait que **2,63:1** sur son fond, **sous le seuil de 3:1** que WCAG exige
> d'un objet graphique. L'ambre sourd tient 4,32:1. C'est la deuxième fois
> qu'assourdir une couleur rend de la lisibilité au lieu d'en coûter — la
> première étant l'ambre des pastilles, passé de 4,28:1 à 4,63:1.

La mention éditeur est en `#63707f`. **Discret ne veut pas dire illisible** —
et l'ancien `#8A94A6` l'était, sur les trois niveaux sans exception :

| Fond | `#8A94A6` (avant) | `#63707F` (après) |
|---|---|---|
| Élevé `#FDF2F2` | 2,79:1 | 4,61:1 |
| Modéré `#FEF6EC` | 2,86:1 | 4,72:1 |
| Faible `#F1F2F4` | 2,73:1 | 4,51:1 |

Seuil AA pour du texte : 4,5:1. Les trois valeurs de gauche sont à peu près la
moitié du seuil.

### Deux défauts trouvés en chemin, et ce que ça dit de la méthode

Les deux blocs ci-dessus — le liseré ambre à 2,63:1, la mention éditeur sous le
seuil partout — **n'étaient l'objet d'aucune des deux passes.** La première
demandait d'aligner deux rouges, la seconde de retirer une image. Les défauts
sont apparus parce qu'aligner une couleur oblige à mesurer l'ancienne, et que
retirer une image oblige à regarder ce qui reste.

Ils n'auraient été trouvés par aucune relecture, parce qu'à l'œil les deux
rendus se ressemblent : un ambre pâle sur un fond pâle *a l'air* d'un choix de
discrétion, pas d'un texte qu'une partie des lecteurs ne distingue pas. Seul le
chiffre le dit.

> **La règle qu'on en tire :** quand on touche une couleur, on mesure les deux
> — celle qui part et celle qui arrive. Le coût est d'une minute, et c'est la
> seule façon de savoir si on corrige ou si on dégrade. Deux fois sur deux
> jusqu'ici, la mesure a trouvé quelque chose que personne ne cherchait.

### Le même rouge dans les mails transactionnels

L'argument du liseré — deux rouges pour une même gravité obligent le lecteur à
se demander si c'est la même chose — **ne s'arrête pas à la bannière.** Un
dirigeant reçoit son rapport mensuel, puis ouvre son tableau de bord. Ce sont
deux surfaces, une seule information.

`rapport-mensuel-html.ts` et `diagnostic-email.ts` portent donc `#9D3F49` et
son fond `#FDF2F2`, comme l'écran et comme la bannière. Ils héritaient de
`#c0392b`, qui venait de `--clair-danger` — le rouge de la **vitrine**, qui ne
suit pas cette direction artistique et n'a jamais été choisi pour eux.

**Une exception, mesurée et assumée : l'ambre du diagnostic reste `#8F5F00`.**
`--modere` a été retenu pour deux rôles — un aplat de pastille sous du texte
blanc, et un liseré, qui est un objet graphique au seuil de 3:1. Dans le mail
de diagnostic, la même couleur serait du **texte** sur un fond ambre pâle, où
le seuil monte à 4,5:1 :

| | sur `#F7F1E4` | verdict |
|---|---|---|
| `#9A6B39` (le jeton) | 4,11:1 | sous le seuil |
| `#8F5F00` (en place) | 4,90:1 | conforme |

Aligner la teinte ferait donc **reculer** un texte aujourd'hui conforme, pour
une cohérence que personne ne peut constater : le palier « significatif » du
diagnostic n'a pas d'équivalent à l'écran, puisque ce mail part à un prospect
qui n'a pas encore de tableau de bord. **Un jeton se transporte avec son rôle,
pas avec sa valeur.**

### Pourquoi il n'y a PAS de logo client, ni de nom de client

**Décision du 16 septembre 2026, prise après l'avoir construit et regardé.** Une
version de ce document demandait le logo de l'entreprise cliente en haut à
droite, au motif que « la bannière cesse d'être un avertissement extérieur pour
devenir un message de sa propre entreprise ». L'idée était bonne ; elle n'a pas
résisté à trois constats.

1. **Le logo n'arrivait presque jamais** — image distante, donc bloquée.
2. **Quand il arrivait, il coûtait la place du message.** La colonne de droite
   prenait un tiers de la largeur pour une image décorative, au détriment des
   motifs — qui sont ce que la bannière existe pour dire.
3. **Il imposait une contrainte sans fin.** Un client dépose ce qu'il veut :
   carré, bande de 10:1, fichier de 3000 px. Le brider dans le moteur de rendu
   de Word aurait supposé de relever les dimensions au téléversement et
   d'écrire `width` ET `height` — du travail permanent pour un élément qui ne
   dit rien sur la fraude.

**Toute la place revient au message.** Le premier de ces trois points ne
bougera pas.

### Le niveau faible ne porte pas la mention

La bannière a trois niveaux, et le faible est la note discrète : une seule
ligne, sans encadré, sans liste, sans conseil. Y ajouter une mention éditeur en
ferait un quatrième encadré et effacerait la gradation que ces trois variantes
existent pour produire.

---

## Mouvement

Aucune animation d'entrée. Aucun effet au survol des cartes. Les transitions
existent pour montrer ce qui vient de changer : un panneau qui s'ouvre, une
ligne qui se déplie, une confirmation. 120 ms, `ease-out`.

`prefers-reduced-motion` respecté.

---

## Écriture

Phrase capitalisée, voix active, verbes simples. Un bouton nomme l'action
exacte qu'il déclenche, et le message qui suit reprend le même mot :
« Démarrer la surveillance » produit « Surveillance démarrée ».

Les états d'erreur disent ce qui s'est passé et quoi faire. Ils ne s'excusent
pas et ne restent jamais vagues. Un écran vide est une invitation à agir.

Jamais de point médian entre deux mots : une conjonction dit la même chose et
se lit à voix haute.

---

## Ordre d'application

1. Les jetons — typographie, couleur, rayons, largeurs.
2. Le tableau de bord : nouvelle largeur, nouveaux rayons, nouvel ordre.
3. Les tableaux.
4. Les formulaires et les réglages.
5. La page Connexion Microsoft.
6. La bannière Outlook.

Après chaque étape : une capture avant, une capture après, à 1440 px et à
390 px.

> **Ce qu'une capture prise sur la route d'aperçu ne prouve pas.** Cette route
> monte les composants **hors de `DashboardShell`**. Elle ne voit donc ni la
> largeur maximale, ni les marges latérales, ni le défilement, ni la barre de
> navigation — tout ce qui vient de la coquille.
>
> Cas réel : `Releve.tsx` gardait un `max-w-[1280px]` qui aurait annulé le
> passage à 1680 px de toute l'application, et la mesure ne pouvait pas le voir.
>
> Elle prouve les polices, les couleurs, les rayons, la casse, les séparateurs —
> tout ce qui tient dans le composant. Elle ne prouve pas la mise en page une
> fois insérée. Pour ce qui vient de la coquille, lire le code des deux côtés.

---

## Contrôle final

Si le résultat pourrait servir de capture d'écran à n'importe quel autre
logiciel de gestion, c'est raté. Une page de Safentreprise se reconnaît à
quatre choses : le serrage des titres, les formes arrondies, la sobriété de la
palette, et une couleur qui ne dit jamais que deux choses — la gravité d'une
tentative, ou une panne à réparer.
