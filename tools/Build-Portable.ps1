<#
.SYNOPSIS
    Construit le paquet portable Windows de Rackula-planner (sans Docker).

.DESCRIPTION
    Compile l'application (vite build), puis assemble un dossier autonome :

        rackula-planner-portable\
            app\                          application statique compilee
            Lancer-Rackula-Planner.ps1    serveur local + ouverture navigateur
            Lancer-Rackula-Planner.cmd    lanceur double-clic
            LISEZMOI.txt                  mode d'emploi
            VERSION.txt                   version et commit
            LICENSE

    Le dossier est ensuite compresse en ZIP dans le meme repertoire de sortie.
    Aucun Node.js n'est necessaire sur la machine cible : seul PowerShell
    (fourni avec Windows) est utilise.

.PARAMETER OutputDir
    Repertoire de sortie. Defaut : <depot>\release.

.PARAMETER SkipBuild
    Reutiliser le dist\ existant au lieu de relancer npm run build.

.PARAMETER NoZip
    Ne pas creer l'archive ZIP.

.EXAMPLE
    .\tools\Build-Portable.ps1

.EXAMPLE
    .\tools\Build-Portable.ps1 -SkipBuild -OutputDir D:\Partage
#>
[CmdletBinding()]
param(
    [string]$OutputDir = "",
    [switch]$SkipBuild,
    [switch]$NoZip
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))

if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot "release"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

function Invoke-NpmBuild {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm est introuvable. Installez Node.js, ou utilisez -SkipBuild avec un dist\ deja compile."
    }

    Push-Location $repoRoot
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
            Write-Host "  Installation des dependances (npm ci)..." -ForegroundColor Yellow
            & npm ci
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci a echoue (code $LASTEXITCODE)."
            }
        }

        Write-Host "  Compilation (npm run build)..." -ForegroundColor Yellow
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build a echoue (code $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
}

function Read-BuildInfo {
    $versionFile = Join-Path $repoRoot "dist\version.json"
    if (Test-Path -LiteralPath $versionFile) {
        return Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
    }
    return [pscustomobject]@{ version = "dev"; commit = ""; buildTime = "" }
}

# --------------------------------------------------------------------------
# 1. Compilation
# --------------------------------------------------------------------------

if (-not $SkipBuild) {
    Invoke-NpmBuild
}

$distDir = Join-Path $repoRoot "dist"
if (-not (Test-Path -LiteralPath (Join-Path $distDir "index.html"))) {
    throw "dist\index.html est absent. Lancez sans -SkipBuild pour compiler l'application."
}

$info = Read-BuildInfo
$version = [string]$info.version

# --------------------------------------------------------------------------
# 2. Assemblage
# --------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$stage = Join-Path $OutputDir "rackula-planner-portable"
if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
$appDir = Join-Path $stage "app"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "  Copie de l'application..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $distDir "*") -Destination $appDir -Recurse -Force

$launcherPs1 = Join-Path $repoRoot "Lancer-Rackula-Planner.ps1"
$launcherCmd = Join-Path $repoRoot "Lancer-Rackula-Planner.cmd"
$license = Join-Path $repoRoot "LICENSE"
foreach ($file in @($launcherPs1, $launcherCmd, $license)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Fichier requis introuvable : $file"
    }
    Copy-Item -LiteralPath $file -Destination $stage -Force
}

$readme = @"
Rackula-planner $version - version portable Windows
========================================================

Aucune installation, aucun Docker, aucun droit administrateur.
Seul PowerShell (fourni avec Windows) est necessaire.

Demarrage
---------
1. Decompresser ce dossier ou vous voulez.
2. Double-cliquer sur "Lancer-Rackula-Planner.cmd".
   Le navigateur s'ouvre sur http://127.0.0.1:8420/

Si Windows affiche un avertissement au decompressage :
clic droit sur le fichier ZIP > Proprietes > cocher "Debloquer",
puis decompresser a nouveau.

Donnees
-------
Les plans sont enregistres par le navigateur (IndexedDB) pour l'adresse
http://127.0.0.1:8420. Gardez le meme port pour les retrouver.
Exportez regulierement vos layouts (.rackula.yaml) depuis l'application :
c'est la seule sauvegarde portable d'un PC a un autre.

Options
-------
Lancer-Rackula-Planner.cmd -Port 9000        autre port (donnees separees)
Lancer-Rackula-Planner.cmd -NoBrowser        ne pas ouvrir le navigateur
Lancer-Rackula-Planner.cmd -VerboseRequests  journaliser les requetes

Arret : Ctrl+C dans la fenetre noire.

Contenu
-------
app\                          application compilee (Rackula + dimensionnement)
Lancer-Rackula-Planner.ps1    serveur HTTP local + ouverture du navigateur
Lancer-Rackula-Planner.cmd    lanceur double-clic
LICENSE                       licence MIT (Rackula, (c) Gareth Evans)
VERSION.txt                   version, commit et date de compilation
"@
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText((Join-Path $stage "LISEZMOI.txt"), $readme, $utf8Bom)

$versionText = @(
    "Rackula-planner $version",
    "commit: $($info.commit)",
    "build:  $($info.buildTime)",
    "package: portable Windows (sans Docker)"
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $stage "VERSION.txt"), $versionText + "`r`n", $utf8Bom)

# --------------------------------------------------------------------------
# 3. Archive ZIP
# --------------------------------------------------------------------------

$files = Get-ChildItem -LiteralPath $stage -Recurse -File
$sizeMb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host ("  Paquet : {0} ({1} fichiers, {2} Mo)" -f $stage, $files.Count, $sizeMb) -ForegroundColor Green

if (-not $NoZip) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $OutputDir ("rackula-planner-portable-{0}.zip" -f $version)
    if (Test-Path -LiteralPath $zip) {
        Remove-Item -LiteralPath $zip -Force
    }
    Write-Host "  Creation du ZIP..." -ForegroundColor Yellow

    # Creation manuelle des entrees : ZipFile.CreateFromDirectory ecrit des
    # separateurs "\" sous .NET Framework, ce qui viole la specification ZIP.
    # On force des "/" pour rester compatible avec tous les extracteurs.
    $baseName = Split-Path -Leaf $stage
    $zipStream = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
    try {
        $archive = New-Object -TypeName System.IO.Compression.ZipArchive -ArgumentList @(
            $zipStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            foreach ($file in (Get-ChildItem -LiteralPath $stage -Recurse -File)) {
                $relative = $file.FullName.Substring($stage.Length + 1).Replace("\", "/")
                $entryName = "$baseName/$relative"
                $entry = $archive.CreateEntry(
                    $entryName,
                    [System.IO.Compression.CompressionLevel]::Optimal
                )
                $entryStream = $entry.Open()
                try {
                    $input = [System.IO.File]::OpenRead($file.FullName)
                    try {
                        $input.CopyTo($entryStream, 65536)
                    } finally {
                        $input.Dispose()
                    }
                } finally {
                    $entryStream.Dispose()
                }
            }
        } finally {
            $archive.Dispose()
        }
    } finally {
        $zipStream.Dispose()
    }

    $zipMb = [math]::Round(((Get-Item -LiteralPath $zip).Length / 1MB), 1)
    Write-Host ("  Archive : {0} ({1} Mo)" -f $zip, $zipMb) -ForegroundColor Green
}

Write-Host ""
Write-Host "  Termine. Double-cliquez sur Lancer-Rackula-Planner.cmd dans le paquet." -ForegroundColor Cyan
Write-Host ""
