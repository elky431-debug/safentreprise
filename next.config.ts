import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF d'abord, WebP en repli, JPEG d'origine en dernier recours : c'est
    // `next/image` qui choisit selon l'en-tête Accept du navigateur. La photo
    // de fond de « Trois fraudes » est le premier fichier lourd de la vitrine
    // — en AVIF elle pèse environ le tiers du JPEG.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
