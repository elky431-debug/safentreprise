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

export function TroisFraudes() {
  return (
    <section className="sur-marine px-6 py-20 md:py-24 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <h2 className="mx-auto max-w-2xl text-center text-[clamp(1.6rem,3vw,2.35rem)] font-semibold leading-tight text-foreground">
          Trois fraudes qui visent votre trésorerie
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-center text-[14.5px] leading-relaxed text-muted">
          Elles n’exploitent aucune faille technique. Elles exploitent une
          habitude de travail, et elles passent les filtres parce qu’elles
          ressemblent à du courrier ordinaire.
        </p>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-[10px] border border-border bg-border md:grid-cols-3">
          {FRAUDES.map((fraude, index) => (
            <li key={fraude.cle} className="bg-background px-7 py-8">
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
