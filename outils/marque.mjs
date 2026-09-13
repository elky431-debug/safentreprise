/**
 * Chaîne de production des fichiers de marque.
 *
 *   node outils/marque.mjs
 *
 * Elle part des DEUX SOURCES déposées par le client dans `public/marque/` —
 * `logo-safentreprise.png` et `icone-safentreprise.png`, fond blanc, pleine
 * définition — et produit tout le reste. Les sources ne sont jamais modifiées :
 * on doit pouvoir tout refaire après un changement de charte, d'un seul appel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS DÉCISIONS QUI ONT DEMANDÉ UN ARBITRAGE, ET LEUR RAISON
 *
 * 1. LE DÉTOURAGE SE FAIT PAR DIFFUSION DEPUIS LES BORDS, PAS PAR SEUIL.
 *    L'intérieur du bouclier est blanc, du même blanc que le fond. Un seuil
 *    global le percerait de part en part : contour correct et trou au milieu,
 *    invisible sur fond clair et catastrophique sur marine. On ne rend donc
 *    transparent que le blanc RELIÉ AU BORD de l'image.
 *
 * 2. IL FAUT UNE VARIANTE MONOCHROME BLANCHE, ET CE N'EST PAS UN CONFORT.
 *    Mesuré sur le dessin : le côté sombre du bouclier vaut #141922, soit
 *    1,14 : 1 de contraste sur le marine des bandes (#0f2444). En dessous de
 *    1,5 : 1 l'œil ne distingue plus rien, et cette masse représente 43 % du
 *    bouclier. Sur une bande marine, près de la moitié du logo disparaît.
 *
 *    La variante N'EST PAS une silhouette pleine : remplir la forme en blanc
 *    ferait disparaître le « S », qui est sombre sur champ blanc. On inverse
 *    le dessin — ce qui est sombre devient blanc, ce qui est blanc devient
 *    transparent — et le S réapparaît en réserve.
 *
 * 3. LE FAVICON 16 ET 32 PX EST REDESSINÉ, PAS RÉDUIT.
 *    À 16 px on dispose de 256 pixels en tout. Un rendu 3D — dégradés,
 *    biseaux, ombres — s'y réduit en bouillie grise : c'est arithmétique,
 *    aucun algorithme n'y peut rien. On dessine donc une silhouette en aplat
 *    du bleu de marque. Elle ne cherche pas à ressembler au logo de près, elle
 *    cherche à être reconnue dans un onglet.
 * ─────────────────────────────────────────────────────────────────────────
 */
import sharp from "sharp";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const RACINE = path.resolve(import.meta.dirname, "..");
const MARQUE = path.join(RACINE, "public", "marque");
const SRC_LOGO = path.join(MARQUE, "logo-safentreprise.png");
const SRC_ICONE = path.join(MARQUE, "icone-safentreprise.png");

/** Bleu de marque, celui des titres. Voir `--bleu` dans globals.css. */
const BLEU = "#17356b";

/* ==========================================================================
   1. Détourage
   ========================================================================== */

const BLANC_DUR = 244; // au-delà : c'est le fond, SI relié au bord
const BLANC_DOUX = 200; // en deçà : c'est le dessin, pleinement opaque
const NEUTRE = 20; // écart max entre canaux : le fond est gris neutre

async function detourer(entree) {
  const { data, info } = await sharp(entree)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: L, height: H } = info;
  const n = L * H;
  const fond = new Uint8Array(n);

  const candidat = (i) => {
    const r = data[i * 4], v = data[i * 4 + 1], b = data[i * 4 + 2];
    const max = Math.max(r, v, b);
    return max >= BLANC_DUR && max - Math.min(r, v, b) <= NEUTRE;
  };

  const pile = [];
  for (let x = 0; x < L; x += 1) pile.push(x, (H - 1) * L + x);
  for (let y = 0; y < H; y += 1) pile.push(y * L, y * L + L - 1);

  while (pile.length) {
    const i = pile.pop();
    if (fond[i] || !candidat(i)) continue;
    fond[i] = 1;
    const x = i % L, y = (i / L) | 0;
    if (x > 0) pile.push(i - 1);
    if (x < L - 1) pile.push(i + 1);
    if (y > 0) pile.push(i - L);
    if (y < H - 1) pile.push(i + L);
  }

  // Seule la frontière nous intéresse : au-delà de 3 px du fond, un pixel est
  // du dessin et reste opaque quoi qu'il arrive.
  const frontiere = new Uint8Array(n);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < L; x += 1) {
      const i = y * L + x;
      if (fond[i]) continue;
      for (let dy = -3; dy <= 3 && !frontiere[i]; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= L || ny >= H) continue;
          if (fond[ny * L + nx]) { frontiere[i] = 1; break; }
        }
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    if (fond[i]) { data[p + 3] = 0; continue; }
    if (!frontiere[i]) { data[p + 3] = 255; continue; }

    const max = Math.max(data[p], data[p + 1], data[p + 2]);
    if (max <= BLANC_DOUX) { data[p + 3] = 255; continue; }

    const a = Math.min(1, Math.max(0, (255 - max) / (255 - BLANC_DOUX)));
    if (a <= 0.004) { data[p + 3] = 0; continue; }

    // ⚠ ON DÉ-PRÉMULTIPLIE. Les pixels de frontière sont un mélange du dessin
    //   et du blanc du fond. Les laisser tels quels donnerait un liseré clair,
    //   invisible sur blanc et très laid sur marine.
    for (let c = 0; c < 3; c += 1) {
      const v = (data[p + c] - 255 * (1 - a)) / a;
      data[p + c] = Math.min(255, Math.max(0, Math.round(v)));
    }
    data[p + 3] = Math.round(a * 255);
  }

  return sharp(data, { raw: { width: L, height: H, channels: 4 } })
    .png()
    .trim({ threshold: 0 })
    .toBuffer();
}

/* ==========================================================================
   2. Monochrome blanc
   ========================================================================== */

async function monochrome(mémoire) {
  const { data, info } = await sharp(mémoire)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < info.width * info.height; i += 1) {
    const p = i * 4;
    if (data[p + 3] === 0) continue;
    const max = Math.max(data[p], data[p + 1], data[p + 2]);
    // Plus le pixel d'origine est sombre, plus il devient blanc et opaque.
    const a = Math.min(255, Math.round((255 - max) * (data[p + 3] / 255) * 1.15));
    data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = a;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/* ==========================================================================
   3. La silhouette des très petites tailles
   ========================================================================== */

const silhouette = (côté) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${côté}" height="${côté}" viewBox="0 0 100 100">
  <path d="M50 4 L88 17 v34 C88 74 71 89 50 96 C29 89 12 74 12 51 V17 Z" fill="${BLEU}"/>
  <path d="M50 15 L78 24 v27 C78 68 66 79 50 85 C34 79 22 68 22 51 V24 Z" fill="#ffffff"/>
  <path d="M64 33 C58 28 42 28 38 35 C34 42 44 46 50 48 C58 51 68 55 64 64
           C60 72 42 73 35 67 C39 70 52 70 55 64 C58 58 47 55 41 52
           C33 49 28 42 33 35 C38 27 57 27 64 33 Z" fill="${BLEU}"/>
</svg>`);

/* ==========================================================================
   4. Écriture
   ========================================================================== */

/** Carre une image en la centrant sur un fond transparent. */
async function carrer(mémoire) {
  const m = await sharp(mémoire).metadata();
  const côté = Math.max(m.width, m.height);
  const h = côté - m.height, l = côté - m.width;
  return sharp(mémoire)
    .extend({
      top: Math.round(h / 2), bottom: h - Math.round(h / 2),
      left: Math.round(l / 2), right: l - Math.round(l / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

const écrits = [];

/**
 * Écrit une image en AVIF, WebP et PNG.
 *
 * ⚠ LE PNG N'EST PAS DÉCORATIF, c'est le repli. Tous les navigateurs ne lisent
 *   pas l'AVIF, et `<picture>` descend la liste jusqu'à ce qu'un format passe.
 *   Le retirer ferait disparaître le logo là où on ne le teste pas.
 */
async function décliner(mémoire, nom, largeur) {
  const base = sharp(mémoire).resize({ width: largeur, kernel: "lanczos3" });
  for (const [ext, options] of [
    ["avif", { quality: 62, effort: 6 }],
    ["webp", { quality: 82, effort: 6 }],
    ["png", { compressionLevel: 9, palette: true }],
  ]) {
    const chemin = path.join(MARQUE, `${nom}.${ext}`);
    await base.clone().toFormat(ext, options).toFile(chemin);
    écrits.push(chemin);
  }
}

async function écrirePng(mémoire, chemin, côté, { palette = true, quality = 90 } = {}) {
  await sharp(mémoire)
    .resize(côté, côté, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette, quality })
    .toFile(chemin);
  écrits.push(chemin);
}

/* ========================================================================== */

await mkdir(MARQUE, { recursive: true });

// On efface les productions précédentes, jamais les sources : sans ça, un
// fichier devenu inutile resterait servi indéfiniment.
for (const f of await readdir(MARQUE)) {
  if (f === "logo-safentreprise.png" || f === "icone-safentreprise.png") continue;
  await unlink(path.join(MARQUE, f));
}

const icôneDétourée = await carrer(await detourer(SRC_ICONE));
const icôneBlanche = await monochrome(icôneDétourée);
const logoDétouré = await detourer(SRC_LOGO);
const logoBlanc = await monochrome(logoDétouré);

// L'en-tête affiche l'icône à 28 px, l'emblème à 96 : on couvre 1×, 2× et 3×.
for (const t of [64, 128, 256]) {
  await décliner(icôneDétourée, `icone-${t}`, t);
  await décliner(icôneBlanche, `icone-blanc-${t}`, t);
}

// Le logo horizontal sert à l'image Open Graph et aux usages pleine largeur.
for (const t of [480, 960]) {
  await décliner(logoDétouré, `logo-${t}`, t);
  await décliner(logoBlanc, `logo-blanc-${t}`, t);
}

// Favicons. 16 et 32 sont la silhouette redessinée ; au-delà, le dessin réel
// tient la réduction.
for (const t of [16, 32]) {
  await écrirePng(silhouette(t * 8), path.join(MARQUE, `favicon-${t}.png`), t, { palette: false });
}
await écrirePng(icôneDétourée, path.join(MARQUE, "favicon-48.png"), 48, { palette: false });
// ⚠ QUANTIFIÉES, À DESSEIN. Un dégradé en 24 bits sur 512 px pèse 212 Ko,
//   pour une image que le navigateur ne demande QU'À l'installation d'un
//   raccourci. À cette taille la palette ne se voit pas ; le poids, si.
await écrirePng(icôneDétourée, path.join(MARQUE, "pwa-192.png"), 192);
await écrirePng(icôneDétourée, path.join(MARQUE, "pwa-512.png"), 512);

// Conventions Next : `icon.png` devient le favicon, `apple-icon.png` l'icône
// d'écran d'accueil iOS. Elles ne sont référencées nulle part — c'est le nom
// du fichier qui les branche.
await écrirePng(silhouette(256), path.join(RACINE, "src", "app", "icon.png"), 32, { palette: false });
await écrirePng(icôneDétourée, path.join(RACINE, "src", "app", "apple-icon.png"), 180);

let total = 0;
for (const f of écrits.sort()) {
  const o = (await stat(f)).size;
  total += o;
  console.log(String(Math.round(o / 102.4) / 10).padStart(7) + " Ko  " + path.relative(RACINE, f));
}
console.log(`\n${écrits.length} fichiers, ${(total / 1024).toFixed(1)} Ko au total sur le disque.`);
