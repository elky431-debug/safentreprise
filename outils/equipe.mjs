/**
 * Découpe des portraits de l'équipe pour le bloc du hero.
 *
 *   node outils/equipe.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI 180 PX ET PAS 320. Les pastilles font 48 px sur téléphone et
 *   56 px au-delà. À 180 px on sert 3,2× la taille d'affichage : net jusqu'aux
 *   écrans à densité triple, et personne n'a d'écran plus dense. Servir du 320
 *   coûterait trois fois le poids pour un gain que l'œil ne voit pas.
 *
 * ⚠ LE CADRAGE EST ÉCRIT ICI, PAS DEVINÉ. Sans détection de visage, un
 *   recadrage automatique centre sur l'image et coupe les fronts. Les carrés
 *   ci-dessous ont été relevés à la main sur chaque source : le visage occupe
 *   environ 60 % de la largeur, ce qui remplit le cercle sans rogner le menton.
 *
 * ⚠ LES SOURCES SONT HORS DE `public/`, ET IL FAUT QU'ELLES Y RESTENT. Tout
 *   ce qui est dans `public/` est servi tel quel à qui en devine l'adresse :
 *   les originaux de 50 à 70 Ko partiraient sur le réseau sans qu'aucune page
 *   ne les demande. Ils vivent donc dans `outils/sources/`, d'où seul ce
 *   script les lit.
 *
 * ⚠ TROIS FORMATS, UNE SEULE IMAGE TÉLÉCHARGÉE. `<picture>` laisse le
 *   navigateur prendre l'AVIF s'il sait le lire, le WebP sinon, et le JPEG en
 *   dernier recours. Les trois déclinaisons sont produites ici ; une seule
 *   part sur le réseau.
 * ─────────────────────────────────────────────────────────────────────────
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SORTIE = "public/marque/equipe";
const COTE = 180;

/** Carré retenu sur la source, en pixels de la source. */
const PORTRAITS = [
  { source: "outils/sources/portrait-1.jfif", nom: "membre-1", left: 215, top: 70, taille: 260 },
  { source: "outils/sources/portrait-2.jfif", nom: "membre-2", left: 198, top: 75, taille: 340 },
  { source: "outils/sources/portrait-3.jfif", nom: "membre-3", left: 168, top: 142, taille: 248 },
];

await mkdir(SORTIE, { recursive: true });

for (const p of PORTRAITS) {
  const carre = sharp(p.source)
    .extract({ left: p.left, top: p.top, width: p.taille, height: p.taille })
    .resize(COTE, COTE);

  await carre.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(`${SORTIE}/${p.nom}.jpg`);
  await carre.clone().webp({ quality: 78 }).toFile(`${SORTIE}/${p.nom}.webp`);
  await carre.clone().avif({ quality: 62 }).toFile(`${SORTIE}/${p.nom}.avif`);

  console.log(p.nom, "←", p.source);
}
