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
};

/**
 * Le script prêt à coller, pour l'administrateur Exchange du client.
 *
 * ⚠ IL VÉRIFIE LE NOM DU RÔLE AU LIEU DE LE SUPPOSER. Le libellé
 *   « Application Mail.ReadWrite » est celui que documente Microsoft, mais il
 *   n'a pas pu être constaté sur un locataire réel depuis l'environnement de
 *   développement. Plutôt que de partir sur une supposition dans un script
 *   remis à un client, le script liste les rôles disponibles et s'arrête avec
 *   un message clair si celui qu'il attend n'y est pas.
 */
export function construireScript(
  clientId: string,
  boites: BoiteChoisie[],
  nomSociete: string,
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
# 1. Se connecter
# ------------------------------------------------------------
# Install-Module ExchangeOnlineManagement -Scope CurrentUser   # une seule fois
Connect-ExchangeOnline

# ------------------------------------------------------------
# 2. Vérifier que le rôle attendu existe sur votre locataire
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
# 3. Déclarer l'application dans Exchange
# ------------------------------------------------------------
$AppId = '${doublerApostrophes(clientId)}'
$Sp = Get-ServicePrincipal -Identity $AppId -ErrorAction SilentlyContinue

if (-not $Sp) {
    $Entra = Get-MgServicePrincipal -Filter "AppId eq '$AppId'" -ErrorAction SilentlyContinue
    if (-not $Entra) {
        Write-Host ""
        Write-Host "ARRET : application introuvable dans votre annuaire." -ForegroundColor Red
        Write-Host "L'autorisation administrateur a-t-elle bien ete accordee ?" -ForegroundColor Yellow
        return
    }
    $Sp = New-ServicePrincipal -AppId $AppId -ObjectId $Entra.Id -DisplayName 'Safentreprise'
}

# ------------------------------------------------------------
# 4. Créer le périmètre : les boîtes choisies, et elles seules
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
# 5. Attribuer le rôle, limité à ce périmètre
# ------------------------------------------------------------
$NomAttribution = "$NomPerimetre-MailReadWrite"
if (-not (Get-ManagementRoleAssignment -Identity $NomAttribution -ErrorAction SilentlyContinue)) {
    New-ManagementRoleAssignment -Name $NomAttribution \`
        -App $Sp.ObjectId \`
        -Role $RoleAttendu \`
        -CustomResourceScope $NomPerimetre
}

# ------------------------------------------------------------
# 6. Contrôle
# ------------------------------------------------------------
Write-Host ""
Write-Host "Termine. Perimetre applique :" -ForegroundColor Green
Get-ManagementRoleAssignment -Identity $NomAttribution |
    Format-List Name, Role, CustomResourceScope
Write-Host ""
Write-Host "Retournez sur Safentreprise et lancez la verification." -ForegroundColor Cyan
Write-Host "La prise en compte par Exchange peut demander quelques minutes." -ForegroundColor Yellow
`;

  return { script, nomPerimetre, adresses, ignorees };
}
