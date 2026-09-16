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

**Le monospace, une seule exception** : l'adresse de l'expéditeur dans les
tableaux de menaces, parce que c'est la chaîne qu'on demande au lecteur
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

## La bannière dans Outlook

C'est l'objet le plus vu du produit : chaque salarié la lit dans son courrier.

Ce qu'elle doit porter, dans cet ordre :

1. **Le logo de l'entreprise cliente**, à droite, avec son nom. Les logos sont
   déjà stockés dans le seau `branding` et servis par URL publique.
2. Le titre de l'alerte et son niveau.
3. Les motifs, en phrases complètes — ce qui a été détecté et pourquoi.
4. La conduite à tenir, en une phrase impérative.
5. La mention Safentreprise, discrète, en bas.

Le logo du client change tout : la bannière cesse d'être un avertissement
extérieur pour devenir un message de sa propre entreprise. C'est ce qui la
fait lire au lieu d'être ignorée.

Fond : un aplat très clair, lisible en thème sombre comme en thème clair.
Rayon 12 px. Pas de pictogramme dans un rond.

> **Dépendance à connaître avant l'étape 6.** La bannière lit le logo par
> l'URL publique du seau `branding`. Ce seau est `public = true`, et il doit le
> rester : un salarié qui ouvre son courrier n'a pas de session Safentreprise.
> Voir `docs/SECURITE-RLS.md` — seul l'**énumération** du seau a été fermée,
> jamais la lecture par URL. Une bascule de `branding` en privé casserait
> toutes les bannières.

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
6. La bannière Outlook, avec le logo client.

Après chaque étape : une capture avant, une capture après, à 1440 px et à
390 px.

---

## Contrôle final

Si le résultat pourrait servir de capture d'écran à n'importe quel autre
logiciel de gestion, c'est raté. Une page de Safentreprise se reconnaît à
quatre choses : le serrage des titres, les formes arrondies, la sobriété de la
palette, et une couleur qui ne dit jamais que deux choses — la gravité d'une
tentative, ou une panne à réparer.
