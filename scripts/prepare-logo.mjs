import sharp from "sharp";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/prepare-logo.mjs <source.png>");
  process.exit(1);
}

const img = sharp(src);
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// Fond blanc -> transparent (motif inchangé)
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r > 245 && g > 245 && b > 245) {
    data[i + 3] = 0;
  } else if (r > 230 && g > 230 && b > 230) {
    const whiteness = (r + g + b) / 3;
    data[i + 3] = Math.max(
      0,
      Math.min(255, Math.round((255 - whiteness) * 8)),
    );
  }
}

const base = sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

await base.clone().png().toFile("public/logo-safentreprise.png");
await base
  .clone()
  .resize({ width: Math.round(info.width * 2), kernel: "lanczos3" })
  .png()
  .toFile("public/logo-safentreprise@2x.png");

for (const s of [16, 32, 48, 128, 512]) {
  await base
    .clone()
    .resize({
      width: s,
      height: s,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(`public/logo/icon-${s}.png`);
}

console.log(`OK ${info.width}x${info.height} → PNG transparent`);
