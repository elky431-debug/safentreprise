/**
 * L'écran d'état : où en est le raccordement, et sur quoi repose la promesse.
 *
 * ⚠ IL MONTRE LA PREUVE, PAS SEULEMENT LE VERDICT. Quand on vend de la
 *   sécurité, « voici la réponse de Microsoft, vérifiez vous-même » vaut mieux
 *   que « faites-nous confiance ». La phrase en français dit ce qui a été
 *   constaté ; la réponse brute de Microsoft est repliée juste dessous, pour
 *   qui veut la lire.
 *
 * ⚠ UNE BOÎTE COCHÉE N'EST PAS UNE BOÎTE SURVEILLÉE. Trois états distincts
 *   coexistent, et les confondre laisserait un client se croire couvert :
 *   choisie, vérifiée, abonnée. Seule la dernière fait arriver les messages.
 */
import type { Raccordement } from "@/lib/microsoft/etat";
import { Encadre, Etiquette, dateLisible } from "./commun";

export function EtatSurveillance({ etat }: { etat: Raccordement }) {
  const choisies = etat.boites.filter((b) => b.choisie);
  const abonnees = choisies.filter((b) => b.abonnee).length;

  // Une boîte retirée garde son abonnement Microsoft quelques jours, le temps
  // qu'il expire. Ses messages ne sont plus analysés — les notifications sont
  // refusées à l'entrée — mais le client doit pouvoir le constater plutôt que
  // de découvrir une ligne fantôme dans ses journaux Microsoft.
  const retirees = etat.boites.filter((b) => !b.choisie && b.abonnee);

  return (
    <div className="space-y-4">
      {etat.statut === "revoque" && (
        <Encadre ton="danger" titre="L'autorisation Microsoft a été retirée">
          Plus aucun message n&apos;est analysé. Pour reprendre la surveillance,
          il faut redonner l&apos;accord administrateur depuis le début du
          parcours.
          {etat.derniere_erreur && <> {etat.derniere_erreur}</>}
        </Encadre>
      )}

      {etat.statut === "erreur" && (
        <Encadre ton="danger" titre="Le raccordement est en erreur">
          <p>
            Les messages ne sont plus analysés de façon fiable. Nous en avons
            été prévenus.
          </p>
          {etat.derniere_erreur && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11.5px] text-muted">
              {etat.derniere_erreur}
            </pre>
          )}
        </Encadre>
      )}

      {/* --- Les boîtes ---------------------------------------------------- */}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              Boîtes surveillées
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {abonnees === 0
                ? "Aucune boîte n'est surveillée pour l'instant."
                : abonnees === 1
                  ? "1 boîte reçoit ses messages à l'analyse."
                  : `${abonnees} boîtes reçoivent leurs messages à l'analyse.`}
            </p>
          </div>
        </div>

        {choisies.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Aucune boîte choisie.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {choisies.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
              >
                <span className="min-w-[200px] flex-1 truncate font-mono text-[12.5px] text-foreground">
                  {b.upn}
                </span>

                {b.abonnee ? (
                  <Etiquette ton="succes">Surveillée</Etiquette>
                ) : b.restriction_verifiee_at ? (
                  <Etiquette ton="attention">Vérifiée, non démarrée</Etiquette>
                ) : b.actif ? (
                  <Etiquette ton="attention">Active, sans preuve</Etiquette>
                ) : (
                  <Etiquette ton="neutre">Choisie, en attente</Etiquette>
                )}

                <span className="tabular w-[190px] shrink-0 text-right text-[11.5px] text-faint">
                  {b.abonnee
                    ? `Abonnement jusqu'au ${dateLisible(b.abonnement_expire_at)}`
                    : b.restriction_verifiee_at
                      ? `Vérifiée le ${dateLisible(b.restriction_verifiee_at)}`
                      : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {retirees.length > 0 && (
          <div className="border-t border-border bg-surface-2/40 px-5 py-3.5">
            <p className="text-[12.5px] font-medium text-foreground">
              Retirées de la surveillance
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Leurs messages ne sont plus analysés. L&apos;abonnement que
              Microsoft avait ouvert pour elles n&apos;est plus renouvelé : il
              s&apos;éteint de lui-même sous quelques jours, et d&apos;ici là
              les notifications qu&apos;il produit sont refusées.
            </p>
            <ul className="mt-2 space-y-1">
              {retirees.map((b) => (
                <li key={b.id} className="font-mono text-[12px] text-muted">
                  {b.upn}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border px-5 py-3">
          <p className="text-[12px] leading-relaxed text-muted">
            Les abonnements Microsoft expirent au bout de quelques jours et sont
            renouvelés automatiquement. Si un renouvellement échouait de façon
            répétée, nous en serions prévenus.
          </p>
        </div>
      </section>

      {/* --- La preuve ----------------------------------------------------- */}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-foreground">
            Preuve de la restriction d&apos;accès
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Ce qui garantit que Safentreprise ne peut pas lire vos autres
            boîtes.
          </p>
        </div>

        <div className="px-5 py-4">
          {etat.restriction_verifiee_at ? (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                Le{" "}
                <span className="font-medium text-foreground">
                  {dateLisible(etat.restriction_verifiee_at)}
                </span>
                , nous avons essayé de lire{" "}
                {etat.temoin_upn ? (
                  <span className="font-mono text-foreground">
                    {etat.temoin_upn}
                  </span>
                ) : (
                  "une boîte hors surveillance"
                )}
                , qui ne fait pas partie de vos boîtes surveillées.{" "}
                <strong className="font-medium text-foreground">
                  Microsoft nous l&apos;a refusée.
                </strong>{" "}
                C&apos;est ce refus, et lui seul, qui prouve que la restriction
                est en place.
              </p>

              {etat.temoin_upn && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  Cette boîte de contrôle{" "}
                  {etat.temoin_origine === "cree"
                    ? "a été créée pour ce contrôle : elle est vide, partagée, et ne sert à rien d'autre."
                    : "existait déjà dans votre organisation ; nous ne l'avons pas modifiée."}{" "}
                  Elle ne peut pas être mise sous surveillance : ce serait perdre
                  le moyen de vérifier.
                </p>
              )}

              {etat.restriction_preuve && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] text-muted hover:text-foreground">
                    Voir la réponse exacte de Microsoft
                  </summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11.5px] text-muted">
                    {etat.restriction_preuve}
                  </pre>
                </details>
              )}
            </>
          ) : (
            <Encadre ton="attention" titre="Aucune preuve à ce jour">
              La restriction n&apos;a jamais été vérifiée sur ce locataire. Tant
              qu&apos;elle ne l&apos;est pas, l&apos;autorisation délivrée par
              Microsoft porte techniquement sur toutes vos boîtes, et aucun
              message n&apos;est analysé.
            </Encadre>
          )}
        </div>
      </section>

      {/* --- L'autorisation ------------------------------------------------ */}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-foreground">
            Autorisation Microsoft
          </h3>
        </div>
        <dl className="space-y-3 px-5 py-4">
          <Ligne
            label="Accordée par"
            valeur={etat.consenti_par ?? "Non enregistré"}
          />
          <Ligne label="Le" valeur={dateLisible(etat.consenti_at)} />
          <Ligne
            label="Locataire Microsoft"
            valeur={etat.tenant_id ?? "—"}
            mono
          />
        </dl>
      </section>
    </div>
  );
}

function Ligne({
  label,
  valeur,
  mono = false,
}: {
  label: string;
  valeur: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right text-[13px] text-foreground ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}
