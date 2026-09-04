/**
 * Vérifications du script de restriction, partie sans entrée/sortie.
 *
 *   npm run restriction:test
 *
 * Ce texte part chez un client, qui l'exécute en administrateur sur son propre
 * annuaire. Une adresse mal échappée y devient une injection PowerShell.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { adressePlausible, construireScript } from "./restriction.ts";

const CLIENT_ID = "11112222-3333-4444-5555-666677778888";

test("les adresses douteuses sont écartées, pas échappées à la va-vite", () => {
  assert.equal(adressePlausible("dg@essai.fr"), true);
  assert.equal(adressePlausible("prenom.nom+alias@sous.domaine.co.uk"), true);

  for (const mauvaise of [
    "dg'; Remove-Mailbox -Identity *; #@essai.fr",
    "dg@essai.fr'; Get-Mailbox | Remove-Mailbox #",
    'dg"@essai.fr',
    "dg@essai.fr; rm -rf /",
    "dg @essai.fr",
    "sans-arobase.fr",
    "dg@sansdomaine",
    "",
  ]) {
    assert.equal(adressePlausible(mauvaise), false, `aurait dû écarter : ${mauvaise}`);
  }
});

test("une adresse écartée n'entre pas dans le script, et est signalée", () => {
  const { script, adresses, ignorees } = construireScript(
    CLIENT_ID,
    [
      { graph_user_id: "1", upn: "dg@essai.fr" },
      { graph_user_id: "2", upn: "dg'; Remove-Mailbox *; #@essai.fr" },
    ],
    "Essai",
  );

  assert.deepEqual(adresses, ["dg@essai.fr"]);
  assert.equal(ignorees.length, 1);
  assert.ok(!script.includes("Remove-Mailbox"), "le script ne doit rien contenir d'exécutable étranger");
});

test("le filtre enchaîne les adresses avec -or, en minuscules", () => {
  const { script } = construireScript(
    CLIENT_ID,
    [
      { graph_user_id: "1", upn: "DG@Essai.fr" },
      { graph_user_id: "2", upn: "compta@essai.fr" },
    ],
    "Essai",
  );

  assert.ok(
    script.includes(
      "PrimarySmtpAddress -eq 'dg@essai.fr' -or PrimarySmtpAddress -eq 'compta@essai.fr'",
    ),
    "filtre attendu absent",
  );
});

test("l'apostrophe d'une adresse valide est doublée, EXACTEMENT une fois", () => {
  // o'brien@essai.fr est une adresse légitime. L'écarter laisserait une boîte
  // sans protection ; la doubler deux fois produirait un filtre OPATH invalide,
  // qui ne correspondrait à aucune boîte — et la restriction bloquerait tout.
  //
  // ⚠ Ce cas ne doit JAMAIS s'auto-désactiver : une version antérieure était
  //   gardée par un « if (adresses.length > 0) » qui la rendait muette, et le
  //   double échappement est passé au travers.
  const { script, adresses } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "o'brien@essai.fr" }],
    "Essai",
  );

  assert.deepEqual(adresses, ["o'brien@essai.fr"], "l'adresse doit être retenue");
  assert.ok(
    script.includes("PrimarySmtpAddress -eq 'o''brien@essai.fr'"),
    "apostrophe doublée une fois attendue",
  );
  assert.ok(
    !script.includes("'''"),
    "trois apostrophes : le doublement a été appliqué deux fois",
  );
});

test("le nom du périmètre est sûr, même avec un nom de société exotique", () => {
  const { nomPerimetre } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Éts. Léon & Fils'; Remove-Mailbox *",
  );

  assert.match(nomPerimetre, /^Safentreprise-[A-Za-z0-9]*$/);
  assert.ok(!nomPerimetre.includes("'"));
  assert.ok(!nomPerimetre.includes(" "));
});

test("le script vérifie le rôle au lieu de le supposer", () => {
  const { script } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
  );

  assert.ok(script.includes("Get-ManagementRole"), "il doit interroger les rôles");
  assert.ok(
    script.includes("Application Mail.ReadWrite"),
    "le rôle attendu doit être nommé",
  );
  assert.ok(
    script.includes("ARRET : le role"),
    "il doit s'arrêter si le rôle est absent",
  );
  assert.ok(
    script.includes("Application *"),
    "il doit lister les rôles disponibles pour qu'on sache quoi corriger",
  );
});

test("le client_id est repris tel quel dans le script", () => {
  const { script } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
  );
  assert.ok(script.includes(`$AppId = '${CLIENT_ID}'`));
});

test("les boîtes surveillées sont listées en clair, en commentaire", () => {
  const { script } = construireScript(
    CLIENT_ID,
    [
      { graph_user_id: "1", upn: "dg@essai.fr" },
      { graph_user_id: "2", upn: "compta@essai.fr" },
    ],
    "Essai",
  );
  assert.ok(script.includes("#     dg@essai.fr"));
  assert.ok(script.includes("#     compta@essai.fr"));
});
