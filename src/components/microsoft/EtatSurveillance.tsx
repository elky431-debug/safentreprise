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
import {
  annuaireCoupe,
  surveillanceInterrompue,
  type Raccordement,
} from "@/lib/microsoft/etat";
import { Encadre, Etiquette, dateLisible } from "./commun";

export function EtatSurveillance({ etat }: { etat: Raccordement }) {
  const choisies = etat.boites.filter((b) => b.choisie);
  const abonnees = choisies.filter((b) => b.abonnee).length;
  const interrompue = surveillanceInterrompue(etat);
  const annuaireKo = annuaireCoupe(etat);

  // Une boîte retirée garde son abonnement Microsoft quelques jours, le temps
  // qu'il expire. Ses messages ne sont plus analysés — les notifications sont
  // refusées à l'entrée — mais le client doit pouvoir le constater plutôt que
  // de découvrir une ligne fantôme dans ses journaux Microsoft.
  const retirees = etat.boites.filter((b) => !b.choisie && b.abonnee);

  return (
    <div className="space-y-4">
      {/* ⚠ DEUX PANNES, DEUX TEXTES, DEUX CONDUITES À TENIR. Les écrire du même
          ton enverrait un client refaire tout son parcours pour une
          indisponibilité de cinq minutes, ou en laisserait un autre attendre
          un rétablissement qui ne viendra jamais. Ce qui les sépare est écrit
          dans `constater_sante_tenant` : trois refus d'autorisation
          consécutifs, et rien d'autre, font une révocation. */}

      {etat.statut === "revoque" && etat.panne_portee === "tout" && (
        <Encadre ton="danger" titre="Votre surveillance est arrêtée">
          <p>
            Microsoft refuse désormais de nous délivrer la moindre
            autorisation
            {etat.sante_bascule_at && (
              <>
                , le{" "}
                <strong className="font-medium text-foreground">
                  {dateLisible(etat.sante_bascule_at)}
                </strong>
              </>
            )}
            . L&apos;application Safentreprise a probablement été supprimée ou
            désactivée dans votre annuaire.{" "}
            <strong className="font-medium text-foreground">
              Depuis, plus aucun message n&apos;est analysé
            </strong>{" "}
            et aucune tentative de fraude n&apos;est signalée.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-foreground">
              Deux gestes sont nécessaires, dans cet ordre.
            </strong>{" "}
            D&apos;abord le bouton «&nbsp;Autoriser chez Microsoft&nbsp;» en
            haut de cette page, qu&apos;un administrateur général doit valider.
            Ensuite, faites réexécuter par un administrateur Exchange le script
            PowerShell de l&apos;étape «&nbsp;Restreindre l&apos;accès&nbsp;».
            Le premier seul ne rétablira pas l&apos;analyse du courrier.
          </p>
          {etat.derniere_erreur && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] hover:text-foreground">
                Voir la réponse de Microsoft
              </summary>
              <pre className="script mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
                {etat.derniere_erreur}
              </pre>
            </details>
          )}
        </Encadre>
      )}

      {etat.statut === "revoque" && etat.panne_portee !== "tout" && (
        <Encadre ton="danger" titre="Votre surveillance est arrêtée">
          <p>
            L&apos;attribution de rôle qui nous donne accès à vos boîtes a été
            retirée dans Exchange
            {etat.sante_bascule_at && (
              <>
                , le{" "}
                <strong className="font-medium text-foreground">
                  {dateLisible(etat.sante_bascule_at)}
                </strong>
              </>
            )}
            .{" "}
            <strong className="font-medium text-foreground">
              Depuis, plus aucun message n&apos;est analysé
            </strong>{" "}
            et aucune tentative de fraude n&apos;est signalée.
          </p>
          {/* ⚠ CE PARAGRAPHE EXISTE PARCE QUE LA PREMIÈRE VERSION DISAIT LE
              CONTRAIRE. Elle envoyait le client cliquer « Autoriser chez
              Microsoft » — un geste qui ne rétablit RIEN ici, puisque le
              consentement Entra est toujours valable. Un test réel l'a
              montré : l'accès au courrier vient du RBAC Exchange posé par le
              script, pas d'un rôle d'application Entra. */}
          <p className="mt-2">
            <strong className="font-medium text-foreground">
              Ce n&apos;est pas le bouton «&nbsp;Autoriser chez
              Microsoft&nbsp;» qui réglera ce problème
            </strong>{" "}
            — cette autorisation-là est toujours valable.
          </p>
          <p className="mt-2">
            Il faut faire réexécuter par un administrateur Exchange le script
            PowerShell de l&apos;étape «&nbsp;Restreindre l&apos;accès&nbsp;»,
            celui qui déclare Safentreprise dans Exchange et lui attribue
            l&apos;accès à vos seules boîtes choisies.{" "}
            <strong className="font-medium text-foreground">
              Vos boîtes choisies et le périmètre déjà défini sont conservés
            </strong>
            , il n&apos;y a pas tout à refaire.
          </p>
          {etat.derniere_erreur && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] hover:text-foreground">
                Voir la réponse de Microsoft
              </summary>
              <pre className="script mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
                {etat.derniere_erreur}
              </pre>
            </details>
          )}
        </Encadre>
      )}

      {/* ⚠ AMBRE, PAS ROUGE, ET CE N'EST PAS UN ADOUCISSEMENT. Les messages
          sont TOUJOURS analysés : dire « arrêtée » serait faux. Ce qui tombe,
          c'est la reconnaissance des dirigeants et collaborateurs, donc
          l'usurpation d'annuaire. Et le remède est l'inverse exact de celui du
          courrier coupé — d'où deux encadrés, jamais un seul. */}
      {annuaireKo && (
        <Encadre ton="attention" titre="Votre protection est amoindrie">
          <p>
            <strong className="font-medium text-foreground">
              Vos messages sont toujours analysés
            </strong>{" "}
            — la surveillance fonctionne. En revanche, nous n&apos;avons plus
            accès à votre annuaire Microsoft
            {etat.annuaire_ko_at && (
              <>
                {" "}
                depuis le{" "}
                <strong className="font-medium text-foreground">
                  {dateLisible(etat.annuaire_ko_at)}
                </strong>
              </>
            )}
            .
          </p>
          <p className="mt-2">
            <strong className="font-medium text-foreground">
              Ce qui se dégrade en attendant :
            </strong>{" "}
            le moteur ne reconnaît plus les noms et adresses de vos dirigeants
            et de vos collaborateurs. Une tentative qui se présente au nom de
            l&apos;un d&apos;eux — le scénario le plus courant de l&apos;arnaque
            au président — ne sera plus repérée comme telle. Les autres règles
            de détection continuent de fonctionner.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-foreground">
              Pour rétablir :
            </strong>{" "}
            le bouton «&nbsp;Autoriser chez Microsoft&nbsp;» en haut de cette
            page. Un administrateur général doit réaccorder le consentement. Il
            n&apos;y a rien d&apos;autre à refaire.
          </p>
          {etat.annuaire_erreur && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] hover:text-foreground">
                Voir la réponse de Microsoft
              </summary>
              <pre className="script mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
                {etat.annuaire_erreur}
              </pre>
            </details>
          )}
        </Encadre>
      )}

      {etat.statut === "erreur" && (
        <Encadre
          ton="attention"
          titre="Nous ne savons plus si votre surveillance fonctionne"
        >
          <p>
            Depuis{" "}
            {etat.sante_bascule_at ? (
              <strong className="font-medium text-foreground">
                le {dateLisible(etat.sante_bascule_at)}
              </strong>
            ) : (
              "quelques instants"
            )}
            , Microsoft ne répond plus à nos vérifications.{" "}
            <strong className="font-medium text-foreground">
              Considérez que les messages ne sont pas analysés
            </strong>{" "}
            tant que ce cadre est affiché.
          </p>
          <p className="mt-2">
            {/* ⚠ ON NE DEMANDE RIEN AU CLIENT ICI, ET C'EST VOLONTAIRE. Dans la
                grande majorité des cas la cause est chez Microsoft ou chez
                nous, et se résout seule. L'envoyer refaire son parcours
                détruirait un raccordement valide. */}
            Vous n&apos;avez rien à faire : nous revérifions automatiquement
            toutes les trente minutes, et ce message disparaîtra de lui-même dès
            que la surveillance aura repris. Si le problème vient d&apos;un
            retrait d&apos;autorisation, il sera confirmé au bout de trois
            vérifications et vous serez prévenu.
            {etat.echecs_sante > 0 && (
              <>
                {" "}
                <span className="tabular">
                  ({etat.echecs_sante} refus d&apos;autorisation sur 3)
                </span>
              </>
            )}
          </p>
          {etat.derniere_erreur && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] hover:text-foreground">
                Voir la réponse de Microsoft
              </summary>
              <pre className="script mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
                {etat.derniere_erreur}
              </pre>
            </details>
          )}
        </Encadre>
      )}

      {/* --- Les boîtes ---------------------------------------------------- */}

      <section className="overflow-hidden rounded-[16px] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              Boîtes surveillées
            </h3>
            {/* ⚠ CETTE PHRASE NE DOIT JAMAIS COMPTER DES BOÎTES QUAND LA
                SURVEILLANCE EST COUPÉE. Les abonnements restent « actif » en
                base plusieurs jours après un retrait d'autorisation : compter
                dessus faisait annoncer « 3 boîtes reçoivent leurs messages à
                l'analyse » à un client dont plus rien n'était analysé. */}
            <p className="mt-0.5 text-[12.5px] text-muted">
              {interrompue
                ? "Aucune boîte n'est analysée tant que l'accès Microsoft n'est pas rétabli."
                : abonnees === 0
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
                <span className="min-w-[200px] flex-1 truncate text-[12.5px] text-foreground">
                  {b.upn}
                </span>

                {interrompue ? (
                  /* Une boîte dont l'abonnement vit encore mais dont le
                     locataire est coupé n'est pas surveillée. L'étiquette
                     verte y serait un mensonge, ligne à ligne. */
                  <Etiquette ton="danger">Non analysée</Etiquette>
                ) : b.abonnee ? (
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
                <li key={b.id} className="text-[12px] text-muted">
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

      <section className="overflow-hidden rounded-[16px] border border-border bg-surface">
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
                  <span className="text-foreground">
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
                  <pre className="script mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-muted">
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

      <section className="overflow-hidden rounded-[16px] border border-border bg-surface">
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
          mono ? "text-[12px]" : ""
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}
