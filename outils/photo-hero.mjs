/**
 * Prépare la photo du hero.
 *
 *   node outils/photo-hero.mjs [source]
 *
 * Source par défaut : `public/bureaux-pme.jpg`, la photo déjà présente dans le
 * dépôt et qui sert aussi de fond à la section « Ce que Safentreprise repère ».
 * Sortie : `public/marque/hero/bureau-{640,1280}.{avif,webp,jpg}`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ UNE NOUVELLE SOURCE SE DÉPOSE DANS `outils/sources/`, PAS DANS `public/`.
 *   Tout ce qui est dans `public/` est servi tel quel à qui en devine
 *   l'adresse : un original de plusieurs méga-octets partirait sur le réseau
 *   sans qu'aucune page ne le demande. Même règle que pour les portraits de
 *   l'équipe.
 *
 *   `bureaux-pme.jpg` fait exception parce qu'elle était déjà servie avant, en
 *   fond de la section « Ce que Safentreprise repère ». La déplacer casserait
 *   cette section pour rien.
 *
 * ⚠ DEUX LARGEURS, PAS UNE. La colonne de droite fait au plus ~600 px : 640
 *   suffit en densité simple, 1280 couvre la densité double. Servir du 2400
 *   partout coûterait 250 Ko là où 60 suffisent, sur l'image qui décide du LCP.
 *
 * ⚠ LE RECADRAGE EST CENTRÉ ET ASSUMÉ. `sharp` sait recadrer sur l'entropie ou
 *   sur l'attention, mais les deux déplacent le cadre d'une photo à l'autre :
 *   les étiquettes de `LandingHero` sont positionnées en pourcentage sur
 *   l'image FINALE, et un recadrage qui bouge les décrocherait de leur poste de
 *   travail. Centre fixe = positions reproductibles.
 *
 *   Si le cadrage ne convient pas, décaler `DECALAGE_X` plutôt que de changer
 *   de stratégie — et revérifier les ancres dans `LandingHero`.
 * ─────────────────────────────────────────────────────────────────────────
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = process.argv[2] ?? "public/bureaux-pme.jpg";
const SORTIE = "public/marque/hero";
const NOM = "bureau";

/** Format d'affichage de la carte. 4:3 — assez haut pour équilibrer la colonne
 *  de texte, assez large pour qu'on lise la scène. */
const RATIO = 4 / 3;

/** Largeurs produites. La première sert de `src` de repli. */
const LARGEURS = [640, 1280];

/** Décalage horizontal du recadrage, en fraction de la marge disponible.
 *  0 = centré, -1 = collé à gauche, +1 = collé à droite. */
const DECALAGE_X = 0;

await mkdir(SORTIE, { recursive: true });

const source = sharp(SOURCE);
const meta = await source.metadata();

// Le plus grand rectangle au bon format qui tienne dans la source.
let largeur = meta.width;
let hauteur = Math.round(largeur / RATIO);
if (hauteur > meta.height) {
  hauteur = meta.height;
  largeur = Math.round(hauteur * RATIO);
}

const margeX = meta.width - largeur;
const gauche = Math.round((margeX / 2) * (1 + DECALAGE_X));
const haut = Math.round((meta.height - hauteur) / 2);

console.log(
  `source ${meta.width}×${meta.height} → cadre ${largeur}×${hauteur} ` +
    `à (${gauche}, ${haut})`,
);

for (const w of LARGEURS) {
  const cadre = sharp(SOURCE)
    .extract({ left: gauche, top: haut, width: largeur, height: hauteur })
    .resize(w, Math.round(w / RATIO));

  // ⚠ LES QUALITÉS SONT PLUS BASSES SUR LA GRANDE. À taille d'affichage
  //   double, l'œil ne voit plus les artefacts : garder la même qualité
  //   doublerait le poids pour rien.
  const fin = w === LARGEURS[0];

  await cadre.clone().avif({ quality: fin ? 58 : 46 }).toFile(`${SORTIE}/${NOM}-${w}.avif`);
  await cadre.clone().webp({ quality: fin ? 76 : 66 }).toFile(`${SORTIE}/${NOM}-${w}.webp`);
  await cadre
    .clone()
    .jpeg({ quality: fin ? 80 : 72, mozjpeg: true })
    .toFile(`${SORTIE}/${NOM}-${w}.jpg`);

  console.log(`  ${w} px produit`);
}
