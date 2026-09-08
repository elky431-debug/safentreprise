/**
 * Vérifications du journal des accès, partie sans entrée/sortie.
 *
 *   npm run journal:test
 *
 * ⚠ CE QUI SE JOUE ICI. La base refuse toute valeur contenant « @ » — c'est
 *   une contrainte, pas une consigne. Si ce module laissait passer une
 *   adresse, l'écriture serait rejetée et l'accès ne serait tracé NULLE PART.
 *   Le filtre n'est donc pas seulement une protection de la vie privée : c'est
 *   ce qui garantit que le journal existe.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { classerChemin, sansAdresse } from "./journal.ts";

test("aucune adresse ne franchit sansAdresse", () => {
  for (const adresse of [
    "dg@pme.fr",
    "Prenom.Nom+alias@sous.domaine.co.uk",
    "  compta@pme.fr  ",
    "o'brien@essai.fr",
  ]) {
    const rendu = sansAdresse(adresse);
    assert.ok(rendu !== null);
    assert.ok(!rendu.includes("@"), `« @ » a survécu : ${rendu}`);
    assert.match(rendu, /^adr-[0-9a-f]+$/, "une empreinte, pas un tronçon");
  }
});

test("l'empreinte d'une adresse est stable : deux accès se rapprochent", () => {
  // Sans stabilité, le journal ne permettrait pas de dire « la même boîte a
  // été lue deux fois », ce qui est l'essentiel de ce qu'on lui demande.
  assert.equal(sansAdresse("dg@pme.fr"), sansAdresse("dg@pme.fr"));
  assert.notEqual(sansAdresse("dg@pme.fr"), sansAdresse("compta@pme.fr"));
});

test("un identifiant Graph passe tel quel — c'est le pseudonyme utile", () => {
  const id = "a1b2c3d4-1111-2222-3333-444455556666";
  assert.equal(sansAdresse(id), id);
});

test("le vide reste vide, et rien n'est inventé", () => {
  assert.equal(sansAdresse(null), null);
  assert.equal(sansAdresse(undefined), null);
  assert.equal(sansAdresse("   "), null);
});

test("une valeur démesurée est tronquée", () => {
  const rendu = sansAdresse("x".repeat(5000));
  assert.equal(rendu?.length, 200);
});

/* ==========================================================================
   Le classement des chemins Graph
   ========================================================================== */

test("la lecture d'un message est classée, avec sa boîte et son message", () => {
  const c = classerChemin(
    "/users/boite-1/messages/msg-9?$select=id,subject,body",
    "GET",
  );
  assert.equal(c.ressource, "message");
  assert.equal(c.boiteRef, "boite-1");
  assert.equal(c.ressourceRef, "msg-9");
});

test("le sondage de restriction est classé « boite », sans message", () => {
  // C'est l'appel qui prouve la restriction : il doit se distinguer d'une
  // lecture de message ordinaire dans le journal.
  const c = classerChemin("/users/temoin-7/messages?$top=1&$select=id", "GET");
  assert.equal(c.ressource, "boite");
  assert.equal(c.boiteRef, "temoin-7");
  assert.equal(c.ressourceRef, null);
});

test("la liste des comptes est classée « annuaire », sans boîte", () => {
  const c = classerChemin(
    "/users?$select=id,displayName,mail,userPrincipalName&$top=999",
    "GET",
  );
  assert.equal(c.ressource, "annuaire");
  assert.equal(c.boiteRef, null, "une liste ne vise aucune boîte en propre");
});

test("un lien de pagination absolu reste classé « annuaire »", () => {
  // Graph rend ses @odata.nextLink en URL absolue : le classement ne doit pas
  // se laisser tromper par le préfixe.
  const c = classerChemin(
    "https://graph.microsoft.com/v1.0/users?$skiptoken=X",
    "GET",
  );
  assert.equal(c.ressource, "annuaire");
});

test("abonnements, catégories et service principal sont distingués", () => {
  assert.equal(classerChemin("/subscriptions", "POST").ressource, "abonnement");
  assert.equal(
    classerChemin("/subscriptions/abc-123", "PATCH").ressourceRef,
    "abc-123",
  );
  assert.equal(
    classerChemin("/users/b1/outlook/masterCategories", "POST").ressource,
    "categorie",
  );
  assert.equal(
    classerChemin("/servicePrincipals(appId='x')?$select=id", "GET").ressource,
    "application",
  );
});

test("le service principal ne porte AUCUNE boîte", () => {
  // Le chemin ne contient pas /users/, mais une régression qui l'y mettrait
  // ferait entrer un identifiant d'application dans un champ « boîte ».
  const c = classerChemin("/servicePrincipals(appId='abc')?$select=id", "GET");
  assert.equal(c.boiteRef, null);
});

test("une adresse dans le chemin n'atteint jamais le journal", () => {
  // ⚠ LE CAS QUI COMPTE. Graph accepte une adresse là où on passe d'ordinaire
  //   un identifiant : /users/dg@pme.fr/messages/… est un appel valide. Si un
  //   appelant en passait une, elle arriverait telle quelle jusqu'ici.
  const c = classerChemin("/users/dg@pme.fr/messages/msg-1", "GET");
  assert.ok(c.boiteRef !== null);
  assert.ok(!c.boiteRef.includes("@"), "l'adresse a franchi le classement");
  assert.match(c.boiteRef, /^adr-/);
});

test("une adresse encodée dans le chemin est décodée avant d'être filtrée", () => {
  // encodeURIComponent transforme « @ » en « %40 ». Filtrer avant de décoder
  // aurait laissé passer l'adresse sous une forme à peine déguisée.
  const c = classerChemin("/users/dg%40pme.fr/messages/msg-1", "GET");
  assert.ok(!c.boiteRef?.includes("@"));
  assert.ok(!c.boiteRef?.includes("%40"), "l'adresse encodée a survécu");
  assert.match(c.boiteRef ?? "", /^adr-/);
});

test("un chemin inconnu est journalisé plutôt qu'omis", () => {
  // Mieux vaut une ligne imprécise qu'un accès invisible.
  const c = classerChemin("/users/b1/quelque-chose-de-nouveau", "GET");
  assert.equal(c.ressource, "message");
  assert.equal(c.boiteRef, "b1");
});
