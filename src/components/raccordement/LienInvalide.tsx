import { Encadre } from "@/components/microsoft/commun";

/**
 * Ce qu'on affiche quand le lien ne mène nulle part.
 *
 * ⚠ « CE LIEN N'EST PLUS VALABLE » SANS RAISON EST UN CUL-DE-SAC, et le
 *   principe 2 du document l'interdit. Les quatre refus sont distingués parce
 *   qu'ils appellent quatre gestes différents : redemander, attendre, ne rien
 *   faire, ou nous appeler. Un message unique obligerait l'informaticien à
 *   deviner lequel.
 *
 * ⚠ ÇA NE DIVULGUE RIEN. Il faut déjà connaître un jeton de 32 caractères
 *   hexadécimaux — 122 bits — pour obtenir l'un de ces quatre mots.
 */

type Motif = string;

const CAS: Record<
  string,
  { titre: string; corps: string; suite: string }
> = {
  inconnu: {
    titre: "Ce lien ne correspond à rien",
    corps:
      "L’adresse a peut-être été tronquée en passant d’un message à l’autre — " +
      "c’est le cas le plus fréquent.",
    suite:
      "Revenez au message d’origine et cliquez sur le lien plutôt que de le " +
      "recopier. S’il ne fonctionne toujours pas, demandez-en un nouveau à la " +
      "personne qui vous l’a transmis.",
  },
  revoque: {
    titre: "Ce lien a été remplacé",
    corps:
      "La société a généré un nouveau lien depuis son espace, ce qui annule " +
      "celui-ci. C’est ce qui se passe quand le raccordement est confié à " +
      "quelqu’un d’autre.",
    suite:
      "Si c’est bien vous qui devez faire l’installation, demandez le lien le " +
      "plus récent.",
  },
  termine: {
    titre: "Le raccordement est déjà terminé",
    corps:
      "La surveillance est en place. Il n’y a rien à faire sur ce lien, et " +
      "rien n’a été perdu.",
    suite:
      "Si vous devez modifier le périmètre des boîtes surveillées, cela se " +
      "pilote depuis l’espace Safentreprise de la société.",
  },
  expire: {
    titre: "Ce lien a expiré",
    corps:
      "Les liens de raccordement sont valables quatorze jours. Passé ce " +
      "délai, ils cessent de fonctionner, même s’ils n’ont jamais été " +
      "ouverts.",
    suite:
      "Demandez un nouveau lien à la personne qui vous l’a transmis : elle le " +
      "régénère en un clic depuis son espace.",
  },
  "erreur-technique": {
    titre: "Nous n’arrivons pas à lire ce lien",
    corps:
      "Ce n’est pas votre lien qui est en cause : c’est notre service qui n’a " +
      "pas répondu. Le raccordement n’a pas avancé, mais rien n’est perdu non " +
      "plus.",
    suite:
      "Réessayez dans quelques minutes. Si l’erreur persiste, écrivez-nous à " +
      "contact@safentreprise.com en joignant l’adresse de cette page.",
  },
};

export function LienInvalide({ motif }: { motif: Motif }) {
  const cas = CAS[motif] ?? CAS.inconnu;

  return (
    <div className="space-y-4">
      <h1 className="titre-section text-foreground">{cas.titre}</h1>

      <Encadre ton={motif === "termine" ? "succes" : "attention"}>
        <p>{cas.corps}</p>
      </Encadre>

      {/* ⚠ TOUJOURS UNE SUITE, Y COMPRIS SUR UN ÉCHEC. C'est le principe 2 :
          on ne laisse jamais quelqu'un devant un constat sans geste suivant. */}
      <div>
        <p className="titre-bloc text-foreground">Ce que vous pouvez faire</p>
        <p className="texte-courant mt-1.5 text-muted">{cas.suite}</p>
      </div>
    </div>
  );
}
