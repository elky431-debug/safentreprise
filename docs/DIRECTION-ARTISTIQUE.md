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

Aucune serif nulle part. Aucune monospace, y compris pour les données et les
identifiants.

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
tableau se distinguent par la graisse et la couleur, pas par la casse.

---

## Couleur

Le parti est strict : l'interface est en encre sur papier, et **la couleur est
réservée au risque**. Un aplat coloré dans cette interface signifie toujours
quelque chose. Nulle part ailleurs.

```css
--encre:        #0D1F3C;  /* marine profond — texte, surfaces sombres, boutons */
--encre-douce:  #5A6B84;  /* texte secondaire, en-têtes de tableau */
--trait:        #DDE2E9;  /* séparateurs, bordures */
--papier:       #F4F6F9;  /* fond de page */
--surface:      #FFFFFF;  /* cartes, tableaux, panneaux */

--eleve:        #C8102E;  /* risque élevé */
--modere:       #B5670A;  /* risque modéré */
--faible:       #1C7A58;  /* risque faible, états sains */
```

Le marine change : `#0D1F3C` remplace `#0f2444`. Plus profond, plus froid, il
tient le rôle du noir sans être noir.

Interdits : fond crème ou beige, dégradés, ombres portées douces, aplats
colorés décoratifs, couleur d'accent sur les boutons.

### Application du risque

Les niveaux s'affichent en pastille pleine, texte blanc, rayon 3 px, 12 px de
graisse 600. Pas de pastille cerclée avec un point coloré à l'intérieur : c'est
deux signaux pour une seule information.

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

Le rayon unique est délibéré : la hiérarchie se lit par la couleur et la
graisse, pas par l'arrondi.

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
