import { PageHeader } from "@/components/ui";
import { Raccordement } from "@/components/microsoft/Raccordement";
import { lireRaccordement } from "@/lib/microsoft/parcours";

// L'état vient de la base à chaque affichage : le client revient sur cette
// page après que son administrateur a agi ailleurs, parfois plusieurs jours
// plus tard. Une page mise en cache lui montrerait une étape périmée.
export const dynamic = "force-dynamic";

/** Raccordement et surveillance des boîtes Microsoft 365. */
export default async function MicrosoftPage() {
  const etat = await lireRaccordement();

  return (
    <div className="w-full">
      <PageHeader
        title="Microsoft 365"
        description="Safentreprise analyse les messages qui arrivent dans les boîtes que vous choisissez, et signale les tentatives de fraude au président et au fournisseur avant que quelqu'un n'agisse dessus."
      />

      <Raccordement etat={etat} />
    </div>
  );
}
