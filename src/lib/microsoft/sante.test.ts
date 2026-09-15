/**
 * La sonde de santé : ce qui vaut une révocation, et ce qui n'en vaut pas.
 *
 *   npm run sante:test
 *
 * ⚠ CE QUE CES ESSAIS PROTÈGENT. Un classement trop sévère annonce à un client
 *   payant que son administrateur a retiré l'accord alors que Microsoft a
 *   simplement hoqueté ; un classement trop indulgent laisse un client coupé se
 *   croire protégé. Les deux erreurs sont graves et elles sont symétriques :
 *   chaque cas ci-dessous fixe le côté du trait.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ErreurGraph } from "./graph.ts";
import { classer, panneGenerale } from "./sante.ts";

/* --------------------------------------------------------------------------
   Ce qui est PASSAGER — la surveillance est douteuse, pas perdue
   -------------------------------------------------------------------------- */

test("un 429 est passager", () => {
  assert.equal(classer(new ErreurGraph("trop de requêtes", 429, null, true)), "passager");
});

test("un 500 est passager", () => {
  assert.equal(classer(new ErreurGraph("Graph indisponible", 503, null, true)), "passager");
});

test("une panne réseau est passagère", () => {
  assert.equal(classer(new TypeError("fetch failed")), "passager");
});

test("un code inconnu est passager, pas définitif", () => {
  // ⚠ LE DOUTE PROFITE AU CLIENT. Microsoft ajoute des codes sans prévenir ;
  //   le défaut doit être celui qui ne déclenche pas de révocation à tort.
  assert.equal(
    classer(new ErreurGraph("quelque chose de neuf", 418, "CodeInedit", false)),
    "passager",
  );
});

test("un secret d'application invalide n'est PAS une révocation", () => {
  // ⚠ C'EST NOTRE FAUTE, PAS CELLE DU CLIENT. `invalid_client` veut dire que
  //   le secret Safentreprise a expiré : il frappe tout le parc d'un coup, et
  //   aucun client ne peut rien y faire. Le classer « définitif » enverrait à
  //   chacun un mail l'accusant d'avoir retiré son accord.
  assert.equal(
    classer(new ErreurGraph("Authentification refusée : invalid_client", 401, "invalid_client", false)),
    "passager",
  );
});

/* --------------------------------------------------------------------------
   Ce qui est DÉFINITIF — l'autorisation elle-même est en cause
   -------------------------------------------------------------------------- */

test("un consentement retiré est définitif", () => {
  assert.equal(
    classer(new ErreurGraph("refusé", 401, "unauthorized_client", false)),
    "definitif",
  );
});

test("un 403 Authorization_RequestDenied est définitif", () => {
  assert.equal(
    classer(new ErreurGraph("refusé", 403, "Authorization_RequestDenied", false)),
    "definitif",
  );
});

test("l'application supprimée du locataire est définitive, par son message", () => {
  // Microsoft répond AADSTS700016 quand l'application d'entreprise a été
  // supprimée : c'est la forme que prend une révocation « radicale ».
  assert.equal(
    classer(
      new ErreurGraph(
        "AADSTS700016: Application with identifier was not found in the directory",
        400,
        null,
        false,
      ),
    ),
    "definitif",
  );
});

test("un 401 nu reste définitif", () => {
  assert.equal(classer(new ErreurGraph("jeton refusé", 401, null, false)), "definitif");
});

/* --------------------------------------------------------------------------
   Le garde-fou de la panne générale
   -------------------------------------------------------------------------- */

test("tout le parc en échec = panne générale", () => {
  assert.equal(
    panneGenerale(["definitif", "definitif", "definitif", "passager"]),
    true,
  );
});

test("un seul locataire sain suffit à écarter la panne générale", () => {
  // Si l'un répond, notre configuration est bonne : les autres sont
  // réellement en cause, chacun pour son compte.
  assert.equal(panneGenerale(["definitif", "definitif", "ok", "definitif"]), false);
});

test("sous trois locataires, l'indice statistique ne vaut rien", () => {
  // ⚠ NE PAS « AMÉLIORER » EN ABAISSANT CE SEUIL. Avec un seul client en base
  //   — le cas de l'amorçage — sa révocation bien réelle ressemblerait à une
  //   panne générale, et ne serait jamais constatée.
  assert.equal(panneGenerale(["definitif"]), false);
  assert.equal(panneGenerale(["definitif", "definitif"]), false);
});
