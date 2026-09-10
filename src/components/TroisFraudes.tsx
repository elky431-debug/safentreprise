import Image from "next/image";

/**
 * Première bande marine : les trois fraudes que le produit couvre.
 *
 * ⚠ ÉCRIT DU POINT DE VUE DE LA VICTIME, PAS DE CELUI DU PRODUIT. Un dirigeant
 *   de PME ne cherche pas « la détection d'usurpation d'identité » : il
 *   reconnaît la scène qui s'est jouée chez lui. Chaque bloc décrit donc ce
 *   qui arrive, pas ce que Safentreprise fait.
 *
 * ⚠ CES TROIS FRAUDES RECOUPENT LA SECTION « Les deux fraudes qui coûtent le
 *   plus » plus bas dans la page. Les deux disent la même chose du président
 *   et du fournisseur. L'une des deux devrait disparaître.
 */
const FRAUDES = [
  {
    cle: "president",
    titre: "La fraude au président",
    texte:
      "Un message signé du dirigeant arrive à la comptabilité. Il est urgent, il est confidentiel, il demande de sortir du circuit habituel. L’adresse ressemble à la vraie, à un caractère près.",
  },
  {
    cle: "fournisseur",
    titre: "La fraude au fournisseur",
    texte:
      "Un fournisseur que vous payez depuis des années annonce un changement de coordonnées bancaires. Le nom est le bon, l’historique est le bon. Le compte, non.",
  },
  {
    cle: "facture",
    titre: "La fraude à la facture",
    texte:
      "Une facture plausible se glisse dans le flux : bon montant, bonne mise en forme, référence crédible. Elle correspond à une prestation qui n’a jamais eu lieu.",
  },
];

/** Pictogramme : trois traits, sans métaphore de sécurité. */
function Filet({ index }: { index: number }) {
  return (
    <span
      aria-hidden
      className="font-mono text-[12px] tracking-[0.16em] text-accent-text"
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

/**
 * Le fond photographique et son voile.
 *
 * ⚠ TROIS COUCHES, ET L'ORDRE COMPTE. Le marine plein de `.sur-marine` est
 *   peint en premier — c'est lui qu'on voit tant que la photo n'est pas
 *   arrivée, et c'est pourquoi le texte est lisible dès la première seconde
 *   sans rien attendre. La photo se pose dessus, le voile par-dessus encore.
 *
 * ⚠ `isolate` SUR LA SECTION EST INDISPENSABLE. Sans lui, `-z-10` sortirait de
 *   la section et irait se ranger derrière le fond de la page : la photo
 *   disparaîtrait purement et simplement. Avec, les deux couches restent dans
 *   la pile de la section — au-dessus de son fond, sous son contenu.
 *
 * ⚠ PAS DE `background-attachment: fixed`. Le fond doit défiler avec sa
 *   section ; `fixed` produirait l'effet de parallaxe qu'on ne veut pas, et se
 *   comporte mal sur iOS.
 */
function FondPhoto() {
  return (
    <>
      <Image
        src="/bureaux-pme.jpg"
        // Décorative : l'alternative est vide, et le lecteur d'écran passe.
        // Ce que dit l'image est déjà écrit dans le titre juste à côté.
        alt=""
        aria-hidden
        fill
        // Elle occupe toute la largeur de la fenêtre à toutes les tailles :
        // sans cette indication, Next servirait la variante la plus large.
        sizes="100vw"
        // Différé : la section est sous la ligne de flottaison. Le marine
        // plein tient le décor jusqu'à son arrivée.
        loading="lazy"
        // ⚠ PAS DE `quality` PERSONNALISÉE. Next 16 n'accepte que les valeurs
        //   déclarées dans `images.qualities` (75 par défaut) et refuse les
        //   autres au chargement. Ouvrir la configuration pour cinq points de
        //   compression n'en vaut pas le prix, d'autant que la photo passe
        //   sous un voile à 78 % : ses détails fins ne se voient pas.
        className={
          // ⚠ ANCRAGE DÉCALÉ SUR MOBILE. À 390 px de large, la section est
          //   haute et étroite : `cover` n'y laisse voir qu'un bandeau
          //   vertical d'environ 15 % de la largeur de la photo. Centré, il
          //   tombe entre les fenêtres et le mur. À 52 % il se cale sur la
          //   silhouette du premier plan — celle qui donne la scène.
          //   Comparé à 45, 58 et 68 % avant de retenir cette valeur.
          // ⚠ AUCUNE DÉSATURATION, ET C'EST VÉRIFIÉ. On redoutait que les
          //   bleus de fenêtre virent au turquoise sous le voile marine. Ils
          //   n'y virent pas : aux trois emplacements de texte, le bleu reste
          //   26 à 32 points au-dessus du vert, ce qui est franchement marine.
          //   Pour assourdir davantage la photo malgré tout, ajouter
          //   `[filter:saturate(0.8)]` ici — c'est le seul levier à toucher,
          //   surtout pas le fichier.
          "-z-10 object-cover object-[52%_center] md:object-center"
        }
      />

      {/* Le voile. Même marine que la charte (#0f2444), à 78 %. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "rgba(15, 36, 68, 0.78)" }}
      />
    </>
  );
}

export function TroisFraudes() {
  return (
    <section className="sur-marine relative isolate overflow-hidden px-6 py-20 md:py-24 lg:px-8">
      <FondPhoto />

      {/* `relative` : le contenu se range au-dessus des deux couches de fond. */}
      <div className="relative mx-auto max-w-[1400px]">
        <h2 className="mx-auto max-w-2xl text-center text-[clamp(1.6rem,3vw,2.35rem)] font-semibold leading-tight text-foreground">
          Trois fraudes qui visent votre trésorerie
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-center text-[14.5px] leading-relaxed text-muted">
          Elles n’exploitent aucune faille technique. Elles exploitent une
          habitude de travail, et elles passent les filtres parce qu’elles
          ressemblent à du courrier ordinaire.
        </p>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-[10px] border border-border bg-border md:grid-cols-3">
          {/* ⚠ CARTES TRANSLUCIDES, ET C'EST LA SEULE DÉCISION DE STYLE PRISE
              ICI. Elles étaient en `bg-background`, un marine PLEIN : posées
              sur la photo, elles formaient un bandeau opaque sur toute la
              largeur et masquaient la moitié basse de l'image — le fond
              n'aurait plus été visible qu'autour du titre. À 72 % elles
              restent nettement plus sombres que la photo voilée, donc le texte
              y gagne même en contraste. Pour revenir en arrière : remplacer le
              `style` par la classe `bg-background`. */}
          {FRAUDES.map((fraude, index) => (
            <li
              key={fraude.cle}
              className="px-7 py-8"
              style={{ background: "rgba(15, 36, 68, 0.72)" }}
            >
              <Filet index={index} />
              <h3 className="mt-4 text-[17px] font-semibold text-foreground">
                {fraude.titre}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                {fraude.texte}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
