import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠ LA VERSION DU CODE, FIGÉE AU MOMENT DE LA COMPILATION.
  //
  //   Netlify expose `COMMIT_REF` pendant le build, pas nécessairement à
  //   l'exécution : le lire depuis `process.env` dans une fonction rendrait
  //   « inconnu » là où on en a le plus besoin. Passer par `env` ici le fait
  //   INLINER dans le bundle, donc il décrit la version réellement servie.
  //
  //   Sans ce repère, quatre déploiements successifs ont pu n'avoir aucun
  //   effet sans que rien ne le signale : la tâche planifiée appelait un
  //   permalien de déploiement figé. « Le code que je viens de pousser
  //   est-il celui qui tourne ? » doit avoir une réponse.
  env: {
    COMMIT_REF:
      process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    DEPLOY_ID: process.env.DEPLOY_ID ?? "",
    BRANCHE_DEPLOYEE: process.env.BRANCH ?? "",
  },
  images: {
    // AVIF d'abord, WebP en repli, JPEG d'origine en dernier recours : c'est
    // `next/image` qui choisit selon l'en-tête Accept du navigateur. La photo
    // de fond de « Trois fraudes » est le premier fichier lourd de la vitrine
    // — en AVIF elle pèse environ le tiers du JPEG.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
