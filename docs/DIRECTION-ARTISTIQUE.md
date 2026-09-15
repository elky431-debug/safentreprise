# Direction artistique — Safentreprise

**Document de référence, arrêté le 15 septembre 2026.** Toute page, existante ou
nouvelle, s'y conforme. Rien n'est laissé au jugement du moment : si un choix
n'est pas écrit ici, demander avant de décider.

> **Portée d'application, arbitrée le 15 septembre 2026.** Les jetons sont posés
> sur l'ESPACE CONNECTÉ d'abord ; la vitrine publique garde Bricolage Grotesque
> et Source Serif 4 jusqu'à une passe dédiée. L'ordre d'application ci-dessous ne
> liste que des écrans de l'application, et le hero de la landing venait d'être
> validé sur planche comparative. La vitrine s'y conformera ensuite — ce n'est
> pas une exemption, c'est un séquencement.

---

## Le problème actuel, nommé

L'interface porte la signature du design généré automatiquement : titres en
serif, micro-libellés en capitales espacées, filets d'un pixel partout, chiffres
en serif coloré, beaucoup d'air et peu de densité. Chaque choix isolé se
défend. Ensemble, ils forment un cliché reconnaissable au premier coup d'œil,
et un dirigeant de PME qui achète de la sécurité n'y lit aucune autorité.

La correction ne consiste pas à ajouter du style. Elle consiste à retirer les
marques génériques et à concentrer l'affirmation sur un seul endroit.

---

## Typographie

**Une seule famille : Archivo.** Variable, disponible sur Google Fonts, chiffres
tabulaires. Grotesque large, à forte hauteur d'x, qui supporte les graisses
lourdes sans devenir bavarde.

Aucune serif nulle part. Aucune monospace — **sauf une exception, arrêtée le
15 septembre 2026 : la colonne « Expéditeur ».**

### L'exception monospace, et sa mesure

L'adresse de l'expéditeur est le seul texte de l'application que le lecteur
doit épeler. Tout le produit consiste à lui faire repérer qu'un domaine
ressemble à un autre sans l'être — `cabinet-durand.fr.co` contre
`cabinet-durand.fr`.

Une mesure, et une seule, fonde l'exception. En Archivo 13 px, `rn` fait
11,64 px et `m` 11,18 px : 0,46 px d'écart, autant dire la même largeur, donc
`cabinet-durand.fr` et `cabinet-dumnd.fr` occupent la même place sur la ligne.
En JetBrains Mono, la chasse fixe sépare le même couple de 7,80 px.

Portée de l'exception, à ne pas élargir :

- **l'adresse** de l'expéditeur, partout où elle s'affiche — tableau de bord,
  page Menaces, dépliant de détail ;
- **pas** le nom affiché qui l'accompagne, qui est du texte ordinaire ;
- **pas** les objets, les motifs, les dates, ni aucun autre champ.

L'argument ne s'étend pas aux autres homoglyphes. Pour `l` / `I` ou `0` / `O`,
la largeur ne prouve rien : c'est la forme du glyphe qui compte, et elle n'a pas
été mesurée. L'exception tient sur le seul couple mesuré, et sur le fait que
cette colonne porte la fraude.

### Échelle

| Rôle | Taille | Graisse | Interlettrage | Interligne |
|---|---|---|---|---|
| Titre de page | 34 px | 800 | −0.035em | 1.05 |
| Titre de section | 21 px | 700 | −0.02em | 1.2 |
| Titre de bloc | 16 px | 600 | −0.01em | 1.3 |
| Texte courant | 15 px | 400 | 0 | 1.55 |
| Texte secondaire | 13.5 px | 400 | 0 | 1.5 |
| En-tête de tableau | 12.5 px | 600 | 0 | 1.2 |
| Chiffre de données | 15 px | 600 | 0 | 1 · tabulaire |
| Chiffre d'accroche | 56 px | 800 | −0.04em | 1 · tabulaire |

Le serrage négatif sur les gros titres est la signature. Il doit se voir.
Longueur de ligne : 70 caractères maximum sur le texte courant.

### Capitalisation

Phrase capitalisée partout — titres, boutons, en-têtes de tableau, étiquettes.
**Aucune capitale intégrale, nulle part, sans exception.** Les en-têtes de
tableau se distinguent par la graisse et la valeur d'encre, pas par la casse.

---

## Couleur

Le parti est strict : l'interface est en encre sur papier, et **la couleur ne
subsiste que sur une panne réelle du produit, jamais sur une donnée**. Un aplat
coloré veut dire qu'il y a quelque chose à réparer. Nulle part ailleurs.

```css
--encre:        #0D1F3C;  /* marine profond — texte, surfaces sombres, boutons */
--encre-douce:  #5A6B84;  /* texte secondaire, en-têtes de tableau */
--trait:        #DDE2E9;  /* séparateurs, bordures */
--papier:       #F4F6F9;  /* fond de page */
--surface:      #FFFFFF;  /* cartes, tableaux, panneaux */

/* Le niveau de risque : trois valeurs d'une seule teinte, aucune couleur. */
--eleve:        #0D1F3C;  /* risque élevé  — fond de pastille, texte blanc */
--modere:       #5A6B84;  /* risque modéré — fond de pastille, texte blanc */
--faible:       #E7ECF3;  /* risque faible — fond de pastille, texte encre douce */

/* La panne, et elle seule. Ces trois-là ne sont PAS des alias des précédents. */
--danger:       #C8102E;  /* surveillance interrompue */
--warning:      #B5670A;  /* une porte sur deux fermée */
--success:      #5A6B84;  /* état sain — encre douce, aucun vert */
```

Le marine change : `#0D1F3C` remplace `#0f2444`. Plus profond, plus froid, il
tient le rôle du noir sans être noir.

Interdits : fond crème ou beige, dégradés, ombres portées douces, aplats
colorés décoratifs, couleur d'accent sur les boutons.

### Le niveau de risque se dit en valeurs d'encre, pas en couleur

Les niveaux s'affichent en pastille pleine, rayon 3 px, 12 px de graisse 600.
Pas de pastille cerclée avec un point coloré à l'intérieur : c'est deux signaux
pour une seule information.

**Le feu tricolore rouge / ambre / vert est supprimé.** Il était la dernière
chose qui faisait ressembler l'écran à n'importe quel logiciel de gestion.
Trois valeurs d'une seule teinte disent la même hiérarchie : la ligne la plus
grave est la plus sombre, donc la plus lourde à l'œil, et le tri d'un coup
d'œil reste possible sans lire les mots.

| Niveau | Fond | Texte | Contraste |
|---|---|---|---|
| Élevé | `#0D1F3C` | blanc | 16,43:1 |
| Modéré | `#5A6B84` | blanc | 5,42:1 |
| Faible | `#E7ECF3` | `#5A6B84` | 4,57:1 |

`--faible` est un **fond**, jamais une couleur de texte : sur du blanc il tombe
à 1,19:1. La pastille faible est aussi le texte le moins contrasté de l'écran,
à 4,57:1 pour un seuil AA de 4,5:1 — c'est cohérent, c'est le niveau le moins
important, mais on ne l'éclaircit pas davantage sans redescendre le texte avec.

### La couleur ne subsiste que sur une panne réelle du produit

`--danger`, `--warning` et `--success` étaient des alias de `--eleve`,
`--modere` et `--faible`. **Ils ne le sont plus, et ils ne doivent pas le
redevenir.**

Un niveau de risque se hiérarchise, une panne s'annonce : ce ne sont pas les
mêmes objets. Les faire basculer à l'encre avec les niveaux aurait rendu « la
surveillance de vos boîtes est interrompue » identique à un bloc ordinaire.

La règle qui en découle, et qui s'applique à toute page nouvelle :

- une **donnée** — un niveau, un compteur, un motif, un filtre, un segment
  actif — ne porte jamais de couleur. Elle porte une valeur d'encre ;
- une **panne du produit** — accès révoqué, jeton expiré, boîtes non
  analysées — porte `--danger` ou `--warning`, et c'est le seul endroit ;
- un **état sain** ne porte rien du tout. Il n'a rien à signaler : il se dit en
  encre douce. Le vert a disparu de l'application, y compris sur les coches.

Corollaire pratique : si vous hésitez à colorer quelque chose, demandez-vous
s'il y a un geste technique à faire pour que ça redevienne normal. Si la
réponse est non, c'est une donnée, et elle reste en encre.

---

## Densité et espacement

L'interface actuelle est trop aérée pour un outil de travail. Un dirigeant
doit voir beaucoup d'un coup d'œil.

Base de 4 px. Valeurs autorisées : 4, 8, 12, 16, 24, 32, 48.

| Élément | Valeur |
|---|---|
| Hauteur de ligne de tableau | 44 px |
| Rembourrage interne des cartes | 20 px |
| Écart entre sections | 32 px |
| Largeur maximale du contenu | 1280 px |
| Rayon des angles | 4 px sur tout, 3 px sur les pastilles. Jamais plus. |

Le rayon unique est délibéré : la hiérarchie se lit par la valeur d'encre et
la graisse, pas par l'arrondi — ni par la couleur, qui ne dit plus que la
panne.

---

## Structure

**Les bordures encodent une information, elles ne décorent pas.** Une bordure
sépare deux natures de contenu. Deux blocs de même nature se séparent par
l'espace.

Supprimer : les filets horizontaux sous chaque titre, les cadres autour de
chaque groupe, les séparateurs verticaux entre colonnes.

**Alignement à gauche partout.** Sauf les colonnes numériques d'un tableau,
alignées à droite pour que les ordres de grandeur se comparent à l'œil.

**Le tableau est la pièce maîtresse**, pas un élément secondaire sous les
graphiques. C'est là que le dirigeant travaille.

---

## Ce qu'on supprime du tableau de bord

1. Le fil d'ariane `SAFENTREPRISE · SURVEILLANCE DE LA MESSAGERIE`.
2. L'étiquette `ACTIVITÉ DE LA PROTECTION` au-dessus du graphique.
3. Le titre `Safentreprise` répété alors que le logo est déjà dans la barre.
   À la place : le nom de l'entreprise cliente.
4. La flèche `→` accolée à « Voir le détail ».
5. Le chiffre en serif rouge. Il devient un chiffre Archivo 800, en encre, avec
   la pastille rouge à côté seulement si le niveau l'exige.
6. Le remplissage dégradé sous la courbe.

---

## Le seul endroit où l'on s'affirme

**Le chiffre d'exposition, en haut du tableau de bord.** Un nombre en Archivo
800, 56 px, serrage −0.04em, avec une légende courte en 13.5 px juste dessous.
Rien d'autre sur la page ne dépasse 34 px.

Tout le reste — tableaux, cartes, navigation — reste discipliné et silencieux.
C'est le contraste qui produit l'effet, pas l'accumulation.

---

## Mouvement

Aucune animation d'entrée. Aucun effet au survol des cartes. Les transitions
existent uniquement pour montrer ce qui vient de changer : un panneau qui
s'ouvre, une ligne qui se déplie, une confirmation. 120 ms, `ease-out`.

`prefers-reduced-motion` respecté.

---

## Écriture

Phrase capitalisée, voix active, verbes simples. Un bouton nomme l'action
exacte qu'il déclenche, et le message qui suit reprend le même mot :
« Démarrer la surveillance » produit « Surveillance démarrée ».

Les états d'erreur disent ce qui s'est passé et quoi faire. Ils ne s'excusent
pas et ne restent jamais vagues. Un écran vide est une invitation à agir, pas
un constat de vide.

---

## Ordre d'application

1. Les jetons — typographie et couleur — dans le fichier de configuration.
2. Le tableau de bord, y compris les suppressions listées plus haut.
3. Les tableaux : Menaces, Collaborateurs.
4. Les formulaires et les réglages.
5. La page Connexion Microsoft, une fois sa refonte décidée.
6. La vitrine publique (ajout du 15 septembre — voir la portée en tête).

Après chaque étape : une capture avant, une capture après.

---

## Contrôle final

Si le résultat pourrait servir de capture d'écran à n'importe quel autre
logiciel de gestion, c'est raté. Une page de Safentreprise doit se reconnaître
à trois choses : le serrage des titres, la discipline monochrome, et la
couleur qui n'apparaît que là où il y a un risque.

---

## Décisions prises en application, et leur motif

**Les blocs de code gardent une police à chasse fixe.** La règle « aucune
monospace, y compris pour les données et les identifiants » est appliquée aux
adresses e-mail, aux UPN et aux identifiants. Elle ne l'est PAS au script
PowerShell que l'administrateur copie dans sa console : un script dont
l'indentation ne s'aligne plus devient plus difficile à relire et à vérifier, et
c'est un texte destiné à sortir de l'interface. Seul `<pre>` de script est
concerné.
