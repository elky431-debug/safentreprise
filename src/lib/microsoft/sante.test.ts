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

/* --------------------------------------------------------------------------
   Les deux portes — la sonde elle-même
   -------------------------------------------------------------------------- */

/**
 * ⚠ CES ESSAIS REMPLACENT `fetch`, PAS `graph.ts`. La sonde ne vaut que par
 *   ce qu'elle conclut des RÉPONSES DE MICROSOFT ; substituer les fonctions du
 *   module masquerait justement la couche qui traduit un code HTTP en verdict.
 *   On répond donc à sa place, en réseau, et on lit ce qu'elle en fait.
 */
type Reponse = { statut: number; corps: unknown };

function serveur(reponses: (url: string) => Reponse) {
  const vrai = globalThis.fetch;
  globalThis.fetch = (async (entree: string | URL | Request) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    const r = reponses(url);
    return new Response(JSON.stringify(r.corps), {
      status: r.statut,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = vrai;
  };
}

/** Un jeton valable, pour les cas où l'authentification doit réussir. */
const JETON_OK = { access_token: "jeton-essai", expires_in: 3600 };

test("les deux portes ouvertes : verdict ok, annuaire ok", async (t) => {
  process.env.MS_CLIENT_ID ??= "essai";
  process.env.MS_CLIENT_SECRET ??= "secret";
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) return { statut: 200, corps: JETON_OK };
    return { statut: 200, corps: { value: [{ id: "x" }] } };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "ok");
  assert.equal(c.portee, null);
  assert.equal(c.annuaireOk, true);
});

test("jeton refusé : portée « tout », et l'annuaire compte pour coupé", async (t) => {
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) {
      return {
        statut: 401,
        corps: { error: "unauthorized_client", error_description: "AADSTS700016" },
      };
    }
    return { statut: 200, corps: { value: [] } };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "definitif");
  assert.equal(c.portee, "tout");
  // Tout est fermé : lever aussi le drapeau d'annuaire évite un encadré ambre
  // qui ferait doublon avec le rouge.
  assert.equal(c.annuaireOk, false);
});

test("annuaire refusé mais courrier lisible : AUCUNE coupure de surveillance", async (t) => {
  // ⚠ LE CAS QU'UN TEST RÉEL A RÉVÉLÉ. Révoquer le consentement Entra coupe
  //   `/users` et laisse le courrier passer. La surveillance CONTINUE : le
  //   verdict doit rester « ok », et seul le drapeau d'annuaire tombe.
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) return { statut: 200, corps: JETON_OK };
    if (url.includes("/users?")) {
      return {
        statut: 403,
        corps: { error: { code: "Authorization_RequestDenied", message: "refusé" } },
      };
    }
    return { statut: 200, corps: { value: [{ id: "m1" }] } };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "ok", "le courrier passe : rien ne doit être coupé");
  assert.equal(c.portee, null);
  assert.equal(c.annuaireOk, false, "mais l'annuaire est bien signalé coupé");
});

test("courrier refusé : portée « courrier », annuaire intact", async (t) => {
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) return { statut: 200, corps: JETON_OK };
    if (url.includes("/users?")) return { statut: 200, corps: { value: [{ id: "x" }] } };
    return {
      statut: 403,
      corps: { error: { code: "ErrorAccessDenied", message: "accès refusé" } },
    };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "definitif");
  assert.equal(c.portee, "courrier");
  assert.equal(c.annuaireOk, true);
});

test("boîte témoin introuvable : non concluant, jamais une coupure", async (t) => {
  // ⚠ UN 404 N'EST PAS UN REFUS. Un compte sans boîte aux lettres rend 404 ;
  //   le compter comme une coupure annoncerait une révocation à un client dont
  //   tout fonctionne. `sonderBoite` fait cette distinction, c'est la raison
  //   pour laquelle on la réutilise au lieu d'écrire une sonde à dossier.
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) return { statut: 200, corps: JETON_OK };
    if (url.includes("/users?")) return { statut: 200, corps: { value: [{ id: "x" }] } };
    return {
      statut: 404,
      corps: { error: { code: "ResourceNotFound", message: "pas de boîte" } },
    };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "passager");
  assert.equal(c.portee, null);
});

test("annuaire en 503 : on ne lève PAS le drapeau", async (t) => {
  // Une indisponibilité passagère de Graph ne veut pas dire que le
  // consentement a été retiré. Lever le drapeau là-dessus ferait afficher
  // « annuaire coupé » à un client dont tout va bien.
  const rendre = serveur((url) => {
    if (url.includes("/oauth2/")) return { statut: 200, corps: JETON_OK };
    if (url.includes("/users?")) return { statut: 503, corps: { error: { code: "x" } } };
    return { statut: 200, corps: { value: [{ id: "m1" }] } };
  });
  t.after(rendre);

  const { sonder } = await import("./sante.ts");
  const c = await sonder(`t-${Math.random()}`, "boite-1");

  assert.equal(c.verdict, "ok");
  assert.equal(c.annuaireOk, true, "un 503 n'est pas un refus d'autorisation");
});
