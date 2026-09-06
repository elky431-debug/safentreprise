/**
 * Étape 6 du raccordement : restreindre l'accès aux seules boîtes choisies.
 *
 * POURQUOI CETTE ÉTAPE EXISTE. Les permissions d'application délivrées par
 * Microsoft — Mail.ReadWrite — portent sur TOUTES les boîtes du locataire. Ce
 * n'est pas réglable côté Safentreprise : une case décochée dans l'interface
 * n'est qu'une politesse tant que l'accès technique reste total.
 *
 * La seule restriction réelle se pose dans le locataire du client, par son
 * administrateur Exchange, avec RBAC for Applications. Les stratégies d'accès
 * aux applications (New-ApplicationAccessPolicy) sont l'ancien mécanisme, que
 * Microsoft a déclaré hérité : on ne s'en sert pas pour une nouvelle
 * configuration.
 */

/** Une boîte retenue par le client. */
export type BoiteChoisie = { graph_user_id: string; upn: string };

/**
 * Double les apostrophes, pour une valeur placée entre apostrophes dans le
 * filtre OPATH d'Exchange : 'o''brien@essai.fr'.
 *
 * ⚠ À N'APPLIQUER QU'UNE FOIS. Le filtre ainsi construit est ensuite inséré
 *   dans une chaîne PowerShell entre GUILLEMETS, où l'apostrophe est un
 *   caractère ordinaire. L'échapper une seconde fois produirait ''…'', que le
 *   filtre Exchange refuserait — le périmètre ne correspondrait alors à
 *   aucune boîte, et la restriction bloquerait tout.
 */
function doublerApostrophes(valeur: string): string {
  return valeur.replace(/'/g, "''");
}

/**
 * Une adresse plausible ? Rien d'autre n'entre dans le script.
 *
 * L'apostrophe est ACCEPTÉE — o'brien@essai.fr est une adresse légitime, et
 * l'écarter reviendrait à laisser une boîte sans protection. Elle est doublée
 * pour le filtre. En revanche guillemet, dollar, accent grave, point-virgule,
 * barre verticale et esperluette sont refusés : ils ont tous un sens en
 * PowerShell, et aucun n'a de raison de figurer dans une adresse.
 */
export function adressePlausible(adresse: string): boolean {
  return /^[^\s@"`;|&$]+@[^\s@"`;|&$']+\.[a-z]{2,}$/i.test(adresse.trim());
}

export type ScriptRestriction = {
  script: string;
  nomPerimetre: string;
  adresses: string[];
  ignorees: string[];
  /** Adresse de la boîte témoin que le script créera, le cas échéant. */
  temoinACreer: string | null;
};

/**
 * Ce qu'on sait du témoin au moment d'écrire le script.
 *
 *   existant : une boîte hors périmètre a été trouvée dans l'annuaire. Le
 *              script n'a rien à créer.
 *   aucun    : l'annuaire a été lu, et toutes ses boîtes sont surveillées. Le
 *              script crée une boîte partagée pour servir de témoin.
 *   inconnu  : l'annuaire n'a PAS pu être lu. On ne crée rien — créer une
 *              boîte dans le locataire d'un client sur une ignorance serait
 *              une modification qu'il n'a pas demandée.
 */
export type EtatTemoin =
  | { etat: "existant"; upn: string }
  | { etat: "aucun" }
  | { etat: "inconnu" };

/** Ce qu'il faut savoir d'une boîte pour juger si elle ferait un témoin. */
export type BoiteTemoinPossible = {
  graph_user_id: string;
  upn: string;
  /** Boîte partagée ou de ressource : compte désactivé, adresse bien réelle. */
  partagee: boolean;
};

/**
 * Les boîtes qui peuvent servir de témoin, dans l'ordre où on les essaiera.
 *
 * ⚠ L'ORDRE N'EST PAS UN DÉTAIL. Les boîtes partagées et les salles de réunion
 *   passent en premier : elles existent, elles ont une adresse, elles ne
 *   coûtent pas de licence, et personne ne s'en sert pour écrire. Une boîte
 *   nominative ferait un témoin tout aussi valable, mais si le client la met
 *   un jour sous surveillance, la preuve serait perdue — la boîte partagée
 *   bouge moins.
 *
 *   Le témoin déjà retenu passe avant tout le reste : en changer sans raison
 *   ferait mentir la preuve enregistrée la fois précédente.
 */
export function candidatsTemoin<T extends BoiteTemoinPossible>(
  toutes: T[],
  choisies: Set<string>,
  dejaRetenu: string | null = null,
): T[] {
  return toutes
    .filter((b) => !choisies.has(b.graph_user_id))
    .sort((a, b) => {
      if (a.graph_user_id === dejaRetenu) return -1;
      if (b.graph_user_id === dejaRetenu) return 1;
      if (a.partagee !== b.partagee) return a.partagee ? -1 : 1;
      return a.upn.localeCompare(b.upn, "fr");
    });
}

/** L'adresse retenue pour une boîte témoin créée par nos soins. */
export function adresseTemoin(domaine: string): string {
  return `safentreprise-controle@${domaine.trim().toLowerCase()}`;
}

/**
 * La commande de création, en une ligne.
 *
 * Elle sert à deux endroits, et doit y être identique : dans le script, et
 * dans le message que Safentreprise affiche si la création a échoué — pour
 * que le client puisse la relancer à la main sans la recomposer.
 */
export function commandeCreationTemoin(adresse: string): string {
  return (
    `New-Mailbox -Shared -Name 'Safentreprise Controle' ` +
    `-DisplayName 'Safentreprise - boite de controle' ` +
    `-PrimarySmtpAddress '${doublerApostrophes(adresse)}'`
  );
}

/**
 * Le script prêt à coller, pour l'administrateur Exchange du client.
 *
 * ⚠ IL VÉRIFIE LE NOM DU RÔLE AU LIEU DE LE SUPPOSER. Le libellé
 *   « Application Mail.ReadWrite » est celui que documente Microsoft, mais il
 *   n'a pas pu être constaté sur un locataire réel depuis l'environnement de
 *   développement. Plutôt que de partir sur une supposition dans un script
 *   remis à un client, le script liste les rôles disponibles et s'arrête avec
 *   un message clair si celui qu'il attend n'y est pas.
 *
 * ⚠ AUCUNE COMMANDE Mg* — ET ÇA NE DOIT PAS REVENIR. Un essai réel a montré
 *   ce que coûtait la dépendance à Microsoft.Graph.Applications, seulement
 *   pour lire l'ObjectId du service principal :
 *
 *     • le module 2.39 ne se charge pas en PowerShell 5.1
 *       (TypeLoadException), il oblige donc à installer PowerShell 7 ;
 *     • installé, il entre en conflit avec WAM et fait échouer
 *       Connect-ExchangeOnline sur une NullReferenceException ;
 *     • et l'appel se faisait sans Connect-MgGraph : il n'aurait de toute
 *       façon rien rendu.
 *
 *   L'ObjectId est désormais lu par le serveur et passé en paramètre. Un test
 *   vérifie qu'aucune commande Mg* ne réapparaît dans le script.
 */
export function construireScript(
  clientId: string,
  /** ObjectId du service principal, lu côté serveur. Voir obtenirServicePrincipal. */
  spObjectId: string,
  boites: BoiteChoisie[],
  nomSociete: string,
  temoin: EtatTemoin = { etat: "aucun" },
  domaine: string | null = null,
): ScriptRestriction {
  const retenues = boites.filter((b) => adressePlausible(b.upn));
  const ignorees = boites
    .filter((b) => !adressePlausible(b.upn))
    .map((b) => b.upn);

  const adresses = retenues.map((b) => b.upn.trim().toLowerCase());
  const suffixe = nomSociete
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 20) || "Client";
  const nomPerimetre = `Safentreprise-${suffixe}`;

  const filtre = adresses
    .map((a) => `PrimarySmtpAddress -eq '${doublerApostrophes(a)}'`)
    .join(" -or ");

  const liste = adresses.map((a) => `#     ${a}`).join("\n");

  // La boîte témoin : une boîte HORS périmètre, que Microsoft doit refuser.
  // Sans elle, la restriction ne peut pas être démontrée.
  //
  // On ne crée que si le locataire n'a rien. Une boîte partagée ou une salle
  // de réunion existante fait un témoin parfait — et ne coûte rien.
  //
  // Le domaine est repris de la première boîte surveillée : c'est
  // nécessairement un domaine accepté du locataire, puisqu'une boîte y reçoit
  // déjà du courrier. On ne devine donc rien.
  const domaineTemoin = (domaine ?? adresses[0]?.split("@")[1] ?? "").trim();
  const temoinACreer =
    temoin.etat === "aucun" && domaineTemoin ? adresseTemoin(domaineTemoin) : null;

  const blocTemoin =
    temoin.etat === "existant"
      ? `# ------------------------------------------------------------
# 8. Boîte témoin — rien à faire
# ------------------------------------------------------------
# ${temoin.upn} existe déjà et reste hors du périmètre ci-dessus.
# C'est elle qui servira à prouver que la restriction fonctionne.
# Le script ne la modifie pas et n'y lit rien.
`
      : temoinACreer
        ? `# ------------------------------------------------------------
# 8. Boîte témoin — à créer
# ------------------------------------------------------------
# Aucune boîte de votre organisation ne reste hors du périmètre : il n'y a
# donc rien qui permette de VÉRIFIER que la restriction fonctionne.
#
# On crée pour cela une boîte partagée, vide, jamais surveillée, qui sert
# uniquement de témoin. Une boîte partagée sans licence ne peut pas dépasser
# 50 Go ; celle-ci reste vide.
#
# Si cette étape échoue, le script continue : la restriction ci-dessus est
# déjà appliquée. Safentreprise vous proposera alors une autre voie.
$AdresseTemoin = '${doublerApostrophes(temoinACreer)}'
$Temoin = Get-Mailbox -Identity $AdresseTemoin -ErrorAction SilentlyContinue

if (-not $Temoin) {
    try {
        ${commandeCreationTemoin(temoinACreer)} -ErrorAction Stop | Out-Null
        Write-Host "Boite temoin creee : $AdresseTemoin" -ForegroundColor Green
        Write-Host "Elle peut demander quelques minutes avant d'etre visible." -ForegroundColor Yellow
    } catch {
        Write-Host ""
        Write-Host "La boite temoin n'a PAS pu etre creee :" -ForegroundColor Yellow
        Write-Host $_.Exception.Message -ForegroundColor Yellow
        Write-Host "La restriction ci-dessus reste appliquee." -ForegroundColor Yellow
        Write-Host "Retournez sur Safentreprise : deux autres voies vous seront proposees." -ForegroundColor Cyan
    }
} else {
    Write-Host "Boite temoin deja presente : $AdresseTemoin" -ForegroundColor Green
}
`
        : `# ------------------------------------------------------------
# 8. Boîte témoin — rien pour l'instant
# ------------------------------------------------------------
# L'annuaire de votre organisation n'a pas pu être lu au moment où ce script
# a été produit : nous ne savons donc pas s'il reste une boîte hors du
# périmètre. Le script ne crée rien sur cette ignorance.
# Lancez la vérification depuis Safentreprise : elle vous dira quoi faire.
`;

  const script = `# ============================================================
# Safentreprise — restreindre l'accès aux seules boîtes choisies
# ============================================================
#
# À exécuter par un administrateur Exchange Online de votre organisation.
# Le script ne modifie AUCUNE boîte et ne lit AUCUN message : il ne fait que
# limiter ce que l'application Safentreprise a le droit d'atteindre.
#
# Sans lui, les autorisations délivrées par Microsoft portent sur TOUTES vos
# boîtes. Tant qu'il n'a pas été exécuté et vérifié, Safentreprise n'analyse
# aucun message.
#
# Boîtes qui seront surveillées, et elles seules :
${liste}
#
# ------------------------------------------------------------
# Pourquoi tout est dans une fonction
# ------------------------------------------------------------
# Les contrôles ci-dessous s'arrêtent avec « return » quand un prérequis
# manque. Au premier niveau d'une console, « return » ne met pas toujours fin
# à un bloc collé : la suite s'exécuterait quand même, et l'arrêt propre
# n'arrêterait rien. Dans une fonction, il met fin à la fonction — que le
# script soit collé dans une console ou enregistré en .ps1.

function Invoke-SafentrepriseRestriction {

# ------------------------------------------------------------
# PRÉREQUIS
# ------------------------------------------------------------
#   • le rôle « Administrateur Exchange » attribué au compte utilisé.
#     Administrateur général NE SUFFIT PAS : Connect-ExchangeOnline répond
#     « vous n'êtes pas autorisé à accéder à cette ressource ». Après
#     attribution, comptez jusqu'à une heure de propagation.
#   • le module ExchangeOnlineManagement. Rien d'autre : ce script n'utilise
#     aucun module Microsoft.Graph, et fonctionne en PowerShell 5.1.
#
# ------------------------------------------------------------
# 1. Vérifier le module, avant toute chose
# ------------------------------------------------------------
if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Write-Host ""
    Write-Host "ARRET : le module ExchangeOnlineManagement n'est pas installe." -ForegroundColor Red
    Write-Host "Installez-le avec la commande ci-dessous, puis relancez ce script :" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force" -ForegroundColor Cyan
    Write-Host ""
    return
}

Import-Module ExchangeOnlineManagement -ErrorAction Stop

# ------------------------------------------------------------
# 2. Se connecter
# ------------------------------------------------------------
try {
    Connect-ExchangeOnline -ShowBanner:$false -ErrorAction Stop
} catch {
    Write-Host ""
    Write-Host "ARRET : la connexion a Exchange Online a echoue." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Cause la plus frequente : le compte utilise n'a pas le role" -ForegroundColor Yellow
    Write-Host "'Administrateur Exchange'. Etre administrateur general ne suffit pas." -ForegroundColor Yellow
    Write-Host "Attribuez-le dans le centre d'administration Microsoft 365, puis" -ForegroundColor Yellow
    Write-Host "attendez la propagation - jusqu'a une heure - avant de reessayer." -ForegroundColor Yellow
    return
}

# ------------------------------------------------------------
# 3. Vérifier que ce compte peut réellement administrer Exchange
# ------------------------------------------------------------
# Exchange Online ne construit la session qu'avec les commandes autorisees par
# les roles du compte. Une commande absente n'est donc pas un bug du script :
# c'est le role qui manque. On le dit avant d'echouer plus loin sur une erreur
# incomprehensible.
$Compte = (Get-ConnectionInformation | Select-Object -First 1).UserPrincipalName
$Manquantes = @()
foreach ($Commande in 'Get-ManagementRole','New-ManagementScope','New-ManagementRoleAssignment','New-ServicePrincipal') {
    if (-not (Get-Command $Commande -ErrorAction SilentlyContinue)) {
        $Manquantes += $Commande
    }
}

if ($Manquantes.Count -gt 0) {
    Write-Host ""
    Write-Host "ARRET : le compte connecte n'a pas les droits necessaires." -ForegroundColor Red
    Write-Host "Compte : $Compte" -ForegroundColor Yellow
    Write-Host "Commandes indisponibles dans cette session :" -ForegroundColor Yellow
    $Manquantes | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Il lui faut le role 'Administrateur Exchange', attribue explicitement." -ForegroundColor Yellow
    Write-Host "Comptez jusqu'a une heure de propagation apres l'attribution." -ForegroundColor Yellow
    return
}

Write-Host "Connecte en tant que $Compte" -ForegroundColor Green

# ------------------------------------------------------------
# 4. Vérifier que le rôle attendu existe sur votre locataire
# ------------------------------------------------------------
$RoleAttendu = 'Application Mail.ReadWrite'
$Role = Get-ManagementRole | Where-Object { $_.Name -eq $RoleAttendu }

if (-not $Role) {
    Write-Host ""
    Write-Host "ARRET : le role '$RoleAttendu' n'existe pas sur ce locataire." -ForegroundColor Red
    Write-Host "Roles d'application disponibles :" -ForegroundColor Yellow
    Get-ManagementRole | Where-Object { $_.Name -like 'Application *' } |
        Select-Object -ExpandProperty Name
    Write-Host ""
    Write-Host "Transmettez cette liste a Safentreprise avant de continuer." -ForegroundColor Yellow
    return
}

# ------------------------------------------------------------
# 5. Déclarer l'application dans Exchange
# ------------------------------------------------------------
# Les deux identifiants viennent de Safentreprise : nous les avons lus dans
# VOTRE annuaire, avec l'autorisation que vous avez accordee. Aucun module
# Microsoft.Graph n'est donc necessaire ici.
$AppId = '${doublerApostrophes(clientId)}'
$SpObjectId = '${doublerApostrophes(spObjectId)}'
$Sp = Get-ServicePrincipal -Identity $AppId -ErrorAction SilentlyContinue

if (-not $Sp) {
    try {
        $Sp = New-ServicePrincipal -AppId $AppId -ObjectId $SpObjectId \`
            -DisplayName 'Safentreprise' -ErrorAction Stop
    } catch {
        Write-Host ""
        Write-Host "ARRET : impossible de declarer l'application dans Exchange." -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Si le message parle d'un objet introuvable, l'autorisation" -ForegroundColor Yellow
        Write-Host "administrateur a peut-etre ete retiree depuis. Relancez le" -ForegroundColor Yellow
        Write-Host "raccordement depuis Safentreprise." -ForegroundColor Yellow
        return
    }
}

# ------------------------------------------------------------
# 6. Créer le périmètre : les boîtes choisies, et elles seules
# ------------------------------------------------------------
$NomPerimetre = '${doublerApostrophes(nomPerimetre)}'
$Filtre = "${filtre}"

$Perimetre = Get-ManagementScope -Identity $NomPerimetre -ErrorAction SilentlyContinue
if ($Perimetre) {
    Set-ManagementScope -Identity $NomPerimetre -RecipientRestrictionFilter $Filtre
} else {
    $Perimetre = New-ManagementScope -Name $NomPerimetre -RecipientRestrictionFilter $Filtre
}

# ------------------------------------------------------------
# 7. Attribuer le rôle, limité à ce périmètre
# ------------------------------------------------------------
$NomAttribution = "$NomPerimetre-MailReadWrite"
if (-not (Get-ManagementRoleAssignment -Identity $NomAttribution -ErrorAction SilentlyContinue)) {
    New-ManagementRoleAssignment -Name $NomAttribution \`
        -App $Sp.ObjectId \`
        -Role $RoleAttendu \`
        -CustomResourceScope $NomPerimetre
}

${blocTemoin}
# ------------------------------------------------------------
# 9. Contrôle
# ------------------------------------------------------------
Write-Host ""
Write-Host "Termine. Perimetre applique :" -ForegroundColor Green
Get-ManagementRoleAssignment -Identity $NomAttribution |
    Format-List Name, Role, CustomResourceScope
Write-Host ""
Write-Host "Retournez sur Safentreprise et lancez la verification." -ForegroundColor Cyan
Write-Host "La prise en compte par Exchange peut demander quelques minutes." -ForegroundColor Yellow

}

Invoke-SafentrepriseRestriction
`;

  return { script, nomPerimetre, adresses, ignorees, temoinACreer };
}
