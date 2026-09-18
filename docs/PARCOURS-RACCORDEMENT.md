# Le parcours de raccordement Microsoft 365

**Arrêté le 18 septembre 2026.** Ce document est la référence du parcours ; le
code en est la mise en œuvre. Si un point du code s'en écarte, c'est le
document qui a raison, ou c'est le document qu'il faut changer d'abord.

---

## La cause de tout le reste : il y a deux acteurs, pas un

L'ancien parcours supposait **une seule personne devant l'écran**. C'est faux,
et c'est ce qui produisait tous les autres défauts.

| | Le dirigeant | L'informaticien |
|---|---|---|
| **Qui** | décide, paie, ouvre l'espace | interne ou prestataire |
| **Ce qu'il a** | aucun droit Microsoft | administrateur général + Exchange |
| **Ce qu'il fait** | dit **à qui transmettre** | exécute |
| **Ce qu'il ne doit jamais voir** | **du PowerShell** | — |

> **Le dirigeant ne fait qu'une chose : dire à qui transmettre.** Un bouton, un
> champ email, et c'est fini pour lui. Il suit ensuite l'avancement depuis son
> espace et reçoit une confirmation quand c'est opérationnel.

L'informaticien reçoit un lien. Il arrive sur une page qui contient tout,
**sans créer de compte ni refaire le parcours depuis le début**.

---

## Les trois principes

### 1. Dire ce qu'il faut avant de commencer

La page de l'informaticien annonce d'emblée le **nombre d'étapes**, le **temps
à prévoir** et les **deux rôles Microsoft nécessaires**. S'il lui manque le
rôle Exchange, il doit l'apprendre **avant de copier le script**, pas après une
erreur incompréhensible. Le **délai de propagation d'une heure** est annoncé au
départ, pas dans un encadré qu'on lit trop tard.

### 2. Aucun cul-de-sac

À chaque étape on sait ce qui vient de se passer et ce qu'on fait ensuite, **y
compris en cas d'échec**. La page de retour après le consentement Microsoft,
qui disait « si vous n'êtes pas la personne qui a lancé ce raccordement,
prévenez-la », était le pire exemple : elle enchaîne désormais.

### 3. Le script est une garantie, pas une corvée

Il existe parce qu'on promet au client qu'on **ne peut pas** lire ses autres
boîtes. C'est la différenciation face aux concurrents qui prennent des
permissions sur le locataire entier.

---

## La contrainte de séquence qui a décidé du découpage

**`ChoixBoites` liste les boîtes depuis Graph, donc l'accord Microsoft doit
déjà exister.** Le dirigeant ne peut donc pas choisir ses boîtes dans une liste
avant que l'informaticien ait consenti. Garder cet écran tel quel imposait :

> dirigeant → informaticien (accord) → **retour dirigeant** (choix) →
> informaticien (script)

Trois allers-retours, et le principe 2 tombe.

**La solution retenue : le dirigeant NOMME les adresses, il ne coche pas une
liste.** Il les connaît — `compta@`, son DAF, son assistante — et n'a pas
besoin de l'annuaire pour ça. La page de l'informaticien les **résout** ensuite
contre l'annuaire et affiche ce qui correspond, ce qui ne correspond pas, et le
laisse corriger.

> **Un seul aller-retour.** Et c'est plus juste sur le fond : le dirigeant sait
> qui peut déclencher un virement, l'annuaire ne le lui apprendrait pas.

---

## Parcours dirigeant

### D1 — « Qui installe chez vous ? »

Remplace l'écran `non-raccorde`. Ce que Safentreprise va surveiller, le fait
que **l'installation demande un administrateur Microsoft**, et la question.
Deux boutons : *transmettre à mon informaticien* / *je suis l'administrateur*
(qui mène au parcours informaticien, en session).

### D2 — « Quelles boîtes surveiller ? »

Un champ d'adresses, une par ligne. Le texte dit qui nommer : **les personnes
qui peuvent déclencher un virement**. Et que c'est le **périmètre technique**,
pas une préférence — Safentreprise n'aura accès qu'à celles-là.

### D3 — « À qui l'envoyer ? »

Nom, email, un mot libre facultatif. Bouton *envoyer*. C'est fini pour lui.

### D4 — Le suivi

Quatre lignes, pas davantage :

| | |
|---|---|
| **Envoyé** | à `prenom@prestataire.fr`, il y a 2 jours |
| **Ouvert** | hier à 14 h 12 — ou *pas encore ouvert* |
| **Où on en est** | « accord Microsoft donné, restriction en attente » |
| **Ce qui manque** | une phrase, sans jargon |

Trois actions : *relancer*, *changer d'informaticien* (invalide le lien et en
crée un autre), *voir le lien* (pour le passer par un autre canal).

Et pendant une propagation : **« Microsoft propage la restriction. Environ 1 h.
Rien à faire. »** C'est le moment où l'absence d'information fait croire à une
panne.

### D5 — La confirmation

Mail et écran : « La surveillance est active sur N boîtes », avec la liste.

### D-SÉCURITÉ — la confirmation du locataire

> **« Le locataire `contoso.onmicrosoft.com` vient de se raccorder. Est-ce bien
> le vôtre ? »** — *oui* / *non, ce n'est pas nous*.

**Un clic contre un rattachement de locataire pirate.** Voir la section sur le
lien pour le scénario exact. Sur un produit de sécurité, cette porte ne peut
pas rester ouverte en connaissance de cause.

---

## Parcours informaticien

Aucun compte, aucune inscription. Une page, `/raccordement/[jeton]`, dont
**l'étape vient de la base** — jamais du navigateur. C'était déjà le cas et ça
le reste : l'informaticien ferme son onglet pendant l'heure de propagation.

### I0 — L'annonce

Avant tout bouton :

- **Qui demande** : « Marc Dupont, dirigeant de Durand & Associés, vous a
  transmis ceci. »
- **Ce que c'est** : 3 étapes, ~15 min de manipulation, **puis 1 h d'attente
  Microsoft** avant que ce soit opérationnel.
- **Les deux rôles, nommés** : *Administrateur général* (l'accord) et
  *Administrateur Exchange* (la restriction), avec pour chacun ce qu'il permet
  et à quelle étape il sert.
- **Un bouton « je n'ai pas ces rôles »** qui ne laisse pas dans le vide : quoi
  demander, à qui, et une proposition de prévenir le dirigeant.

> **C'est le détail qui compte le plus.** C'est là que l'ancien parcours se
> perdait : quelqu'un découvrait le rôle manquant après avoir copié le script,
> sur une erreur illisible, et abandonnait sans rien dire à personne.

### I1 — L'accord Microsoft

Le bouton part chez Microsoft. **Le jeton voyage dans le `state` OAuth**, donc
au retour on sait qui revient.

### I2 — Le retour

« Accord enregistré. Étape 2 sur 3. » et on **enchaîne**. En cas de refus : ce
que l'erreur veut dire, et le bouton pour réessayer.

### I3 — Le périmètre

Les adresses nommées par le dirigeant, résolues contre l'annuaire : trouvées,
introuvables (avec suggestion), possibilité d'ajouter. Plus le choix de la
**boîte témoin**, celle qui doit rester hors surveillance et qui servira à
prouver que la restriction tient. L'informaticien est le bon acteur : il voit
l'annuaire.

### I4 — Le script

**Ce texte est arrêté, mot pour mot. Il précède le bloc de code.**

> **Ce script retire des droits, il n'en donne pas.**
>
> L'accord que vous venez de donner porte techniquement sur toutes les boîtes
> du locataire — c'est ainsi que Microsoft délivre les autorisations, et c'est
> ce que font nos concurrents. Ce script **borne Safentreprise aux N boîtes
> ci-dessus**. Tant qu'il n'est pas exécuté, **aucun message n'est analysé** :
> nous refusons de démarrer sur une autorisation trop large.

⚠ **Ne pas réécrire ce paragraphe.** C'est la formulation retenue de la
différenciation du produit. Le raccourcir pour « alléger l'écran » retirerait
la seule phrase qui explique à un informaticien pourquoi il travaille pour
nous.

### I5 — La vérification

On tente de lire la boîte témoin. **On doit échouer** : c'est la preuve. Trois
issues, chacune avec sa suite :

- **Refusé** → c'est le résultat voulu. Suite.
- **Réussi** → le script n'a pas pris, ou la propagation n'est pas finie.
  Compte à rebours, *revérifier*, et au-delà d'une heure *demander de l'aide*.
- **Autre erreur** → le texte de Microsoft, traduit, et la marche à suivre.

### I6 — Fin

« C'est opérationnel. Marc Dupont est prévenu. » Le lien devient une page de
constat en lecture seule.

---

## Le lien de transmission

**Forme.** `/raccordement/<uuid v4>` — 122 bits, comme les jetons de simulation
déjà en place.

**Durée : 14 jours**, prolongeable en un clic par le dirigeant. Pas 24 h : un
prestataire externe planifie, et un lien mort le vendredi soir est un abandon.

**Réutilisable**, pas à usage unique — il faut pouvoir revenir après l'heure de
propagation.

**Ce qu'il expose** : le nom de la société, le nom du dirigeant, les adresses
nommées, l'état du raccordement, le script. **Rien d'autre** : ni menaces, ni
campagnes, ni salariés, ni facturation, ni autres utilisateurs.

**Comment il est enfermé :**

1. **Le jeton ne crée aucune session.** Pas de cookie que l'application
   reconnaîtrait, donc `(protected)` reste inatteignable.
2. **Toute opération passe par une fonction `SECURITY DEFINER` qui prend le
   jeton en argument** et ne rend que du raccordement — sur le modèle de
   `get_risk_payload_by_token`, déjà en place pour les simulations.
3. **Aucune fonction étrangère au raccordement n'est ouverte à `anon`.**

**Perdu.** Le dirigeant clique *changer d'informaticien* : l'ancien jeton meurt
à l'instant, un nouveau part. Aucune récupération, c'est volontaire.

### Le risque, écrit plutôt que taire

Ce lien permet à qui le détient de lancer un accord Microsoft au nom du client.
Deux choses le bornent :

1. **Le détenir ne suffit pas.** Microsoft exige de s'authentifier comme
   administrateur général du locataire. Un lien volé, sans ces droits, ne donne
   rien.
2. **Mais un attaquant qui contrôle son propre locataire pourrait rattacher SON
   locataire à la société du client.** C'est le seul scénario réel — et c'est
   la raison d'être de l'écran **D-SÉCURITÉ**. Le dirigeant confirme le nom de
   domaine avant que la surveillance démarre.

---

## Si l'informaticien bloque

Un bouton **« je suis bloqué »** à chaque étape, jamais enterré. Trois motifs
prédéfinis — *je n'ai pas le rôle Exchange*, *le script échoue*, *la
vérification ne passe pas* — plus du texte libre, et **le message d'erreur
technique joint automatiquement**.

Ce que ça déclenche : une ligne en base, **un mail à l'éditeur**
(`VEILLE_DESTINATAIRE`), et une ligne dans le suivi du dirigeant — pas un mail
qui l'inquiète, juste « votre informaticien a signalé un blocage, nous sommes
prévenus ».

**Deux alertes automatiques**, parce qu'un blocage silencieux est le plus
fréquent et le plus coûteux :

| Condition | Délai |
|---|---|
| Lien **ouvert**, aucune progression | 48 h |
| Restriction non constatée alors qu'une propagation est en cours | 4 h |

---

## Compatibilité avec l'existant

> **Un locataire déjà `actif` ne repasse JAMAIS par le tunnel.** Il reste sur
> l'écran de suivi. Le nouveau parcours ne s'applique qu'à un raccordement qui
> n'est pas encore allé au bout.

---

## Ce qui se garde, ce qui change

**Gardé tel quel :** le modèle d'état `EtapeRaccordement` et ses cinq valeurs,
`parcours.ts`, `EtatSurveillance`, `commun.tsx`, toute la vérification de
restriction et de santé, le script PowerShell et sa génération idempotente.

**Réécrit :** `Raccordement.tsx` se scinde en deux coquilles. `EcranRestriction`
garde sa logique et change de source d'identité — session → jeton.
`ChoixBoites` devient l'écran de résolution côté informaticien, et un champ
d'adresses côté dirigeant.

**Cassé, et c'est le gros du travail :**

- `demarrer_consentement_graph` doit accepter un jeton au lieu d'une session.
  **C'est le cœur de la migration** : la fonction résout aujourd'hui la société
  par `get_my_company_id()`, ce qu'un informaticien sans compte ne peut pas
  fournir.
- Les routes `/boites`, `/restriction`, `/activation` doivent accepter les deux
  voies d'authentification.
- La page de retour de consentement est à réécrire entièrement.
- Il faut une table de jetons et ses fonctions.

---

## Ce que l'architecture avait déjà bon

**`Raccordement.tsx` lisait déjà son étape depuis la BASE, jamais depuis le
navigateur**, avec ce commentaire : *« le client fermera son onglet entre le
moment où il transmet le script et le retour de son administrateur — parfois
plusieurs jours »*.

Le modèle à deux acteurs était **déjà à moitié dans l'architecture**. C'est
l'interface qui ne l'avait pas suivi. À retenir avant de conclure qu'un défaut
d'interface est un défaut de conception.
