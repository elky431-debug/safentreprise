/**
 * detection-rules.js n'a ni import ni export : c'est un script classique,
 * imposé par Chrome pour un content script. TypeScript refuse alors de le
 * traiter comme un module. Ce fichier de déclaration lui dit « c'est un
 * module, sans rien exporter » — le chargement se fait pour son effet de
 * bord, l'API atterrit sur `self`.
 */
export {};
