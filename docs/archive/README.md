# Écrans retirés de l'application, conservés pour mémoire

Les fichiers de ce dossier **ne sont ni routés, ni compilés, ni livrés**. Ils
sont hors de `src/`, donc Next ne les voit pas : c'est ce qui rend la route
réellement inaccessible, là où un simple `notFound()` aurait laissé le code dans
le paquet et la page dans l'arbre de routage.

Ils sont gardés parce qu'ils contiennent du texte qui pourra resservir, une fois
corrigé.

---

## `page-delivrabilite.tsx` — retiré le 15 septembre 2026

C'était `/settings/deliverability`, onglet « Délivrabilité », rubrique
« Conformité » de la barre latérale.

**Pourquoi elle a été retirée : elle donnait une consigne fausse, tous les jours
où elle restait en ligne.**

Elle demandait à l'administrateur du client d'autoriser le domaine d'envoi
`mail.safentreprise.com` — une valeur que son propre code désignait comme
*« placeholder — à remplacer lors de la configuration SMTP »*. Or les messages
partent par **Resend**, depuis `SIMULATION_FROM_EMAIL`. Le client configurait
donc une règle Exchange sur un domaine d'où rien ne part, et croyait ses
simulations protégées du filtrage.

Elle se terminait de surcroît par *« L'envoi réel n'est pas encore activé dans
l'application »*, ce qui était faux également : `/api/campaigns/[id]/send`
expédie bel et bien.

**Le tiers Google Workspace était mort d'avance** : toute la chaîne de détection
passe par Microsoft Graph, et le produit ne sait pas servir un client Google.

## Ce qu'il faudrait pour la ressusciter

Rien de ce fichier n'est réutilisable tel quel. Ce qui peut l'être, c'est la
**forme** : la marche à suivre pas à pas dans le centre d'administration
Exchange, qui est correcte dans sa structure.

Avant de la reprendre, il faut trois choses qui n'existent pas aujourd'hui :

1. **un vrai domaine d'envoi authentifié chez Resend** (SPF, DKIM, DMARC), et
   son nom écrit quelque part de vérifiable plutôt qu'en dur dans une page ;
2. **savoir si l'injection Graph remplace l'envoi SMTP** pour les campagnes — si
   oui, il n'y a plus de domaine à autoriser du tout, et cette page n'a pas à
   revenir ;
3. **la place dans le nouveau parcours de connexion Microsoft**, en étape
   plutôt qu'en onglet séparé.

Voir aussi la référence à cette page dans `/help`, retirée en même temps pour la
même raison.
