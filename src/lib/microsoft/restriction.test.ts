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
import {
  adressePlausible,
  adresseTemoin,
  candidatsTemoin,
  commandeCreationTemoin,
  construireScript,
} from "./restriction.ts";

const CLIENT_ID = "11112222-3333-4444-5555-666677778888";

/** Une boîte de l'annuaire, pour les essais de témoin. */
function boite(upn: string, partagee = false) {
  return { graph_user_id: upn.split("@")[0]!, upn, partagee };
}

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

/* ==========================================================================
   La boîte témoin
   ========================================================================== */

test("on cherche un témoin existant avant d'en créer un", () => {
  const annuaire = [
    boite("dg@essai.fr"),
    boite("compta@essai.fr"),
    boite("salle-reunion@essai.fr", true),
  ];
  const candidats = candidatsTemoin(annuaire, new Set(["dg", "compta"]));

  assert.deepEqual(
    candidats.map((b) => b.upn),
    ["salle-reunion@essai.fr"],
  );
});

test("les boîtes partagées passent avant les boîtes nominatives", () => {
  // Une boîte nominative peut être mise sous surveillance plus tard, et la
  // preuve serait perdue. La salle de réunion, elle, ne bouge pas.
  const annuaire = [
    boite("alice@essai.fr"),
    boite("salle@essai.fr", true),
    boite("bob@essai.fr"),
    boite("imprimante@essai.fr", true),
  ];
  const candidats = candidatsTemoin(annuaire, new Set());

  assert.deepEqual(
    candidats.map((b) => b.upn),
    ["imprimante@essai.fr", "salle@essai.fr", "alice@essai.fr", "bob@essai.fr"],
  );
});

test("le témoin déjà retenu reste le témoin", () => {
  // En changer sans raison ferait mentir la preuve enregistrée la fois d'avant.
  const annuaire = [boite("salle@essai.fr", true), boite("bob@essai.fr")];
  const candidats = candidatsTemoin(annuaire, new Set(), "bob");

  assert.equal(candidats[0]?.upn, "bob@essai.fr");
});

test("une boîte surveillée n'est jamais proposée comme témoin", () => {
  // Elle serait dans le périmètre, donc lisible : elle « prouverait » que la
  // restriction ne marche pas, alors qu'elle marche.
  const annuaire = [boite("dg@essai.fr"), boite("compta@essai.fr", true)];
  const candidats = candidatsTemoin(
    annuaire,
    new Set(["dg", "compta"]),
    "compta",
  );

  assert.deepEqual(candidats, [], "aucune boîte hors périmètre");
});

test("un témoin existant : le script ne crée rien", () => {
  const { script, temoinACreer } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
    { etat: "existant", upn: "salle@essai.fr" },
  );

  assert.equal(temoinACreer, null);
  assert.ok(!script.includes("New-Mailbox"), "aucune boîte ne doit être créée");
  assert.ok(script.includes("salle@essai.fr"), "le témoin doit être nommé");
});

test("aucun témoin disponible : le script en crée un, sans s'arrêter en cas d'échec", () => {
  const { script, temoinACreer } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
    { etat: "aucun" },
  );

  assert.equal(temoinACreer, "safentreprise-controle@essai.fr");
  assert.ok(script.includes("New-Mailbox -Shared"));
  // La restriction est déjà posée à ce stade : un échec de création ne doit
  // pas arrêter le script, sinon le client repart sans rien.
  assert.ok(script.includes("try {") && script.includes("} catch {"));
  assert.ok(
    script.includes("La restriction ci-dessus reste appliquee."),
    "l'échec doit dire que la restriction, elle, est en place",
  );
  assert.ok(
    script.includes("Get-Mailbox -Identity $AdresseTemoin"),
    "il doit vérifier avant de créer, pour rester rejouable",
  );
});

test("annuaire illisible : on ne crée AUCUNE boîte chez le client", () => {
  // Créer une boîte dans le locataire d'un client parce qu'on n'a pas su lire
  // son annuaire serait une modification qu'il n'a pas demandée.
  const { script, temoinACreer } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
    { etat: "inconnu" },
  );

  assert.equal(temoinACreer, null);
  assert.ok(!script.includes("New-Mailbox"));
});

test("la commande de création est la même dans le script et dans le repli", () => {
  // Le client qui la relance à la main ne doit pas avoir à la recomposer.
  const adresse = adresseTemoin("essai.fr");
  const { script } = construireScript(
    CLIENT_ID,
    [{ graph_user_id: "1", upn: "dg@essai.fr" }],
    "Essai",
    { etat: "aucun" },
  );

  assert.equal(adresse, "safentreprise-controle@essai.fr");
  assert.ok(script.includes(commandeCreationTemoin(adresse)));
});

test("le témoin n'échappe pas à la règle d'échappement des apostrophes", () => {
  const commande = commandeCreationTemoin("o'brien@essai.fr");
  assert.ok(commande.includes("'o''brien@essai.fr'"));
  assert.ok(!commande.includes("'''"));
});
