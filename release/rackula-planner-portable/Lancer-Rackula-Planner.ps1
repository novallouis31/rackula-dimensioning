<#
.SYNOPSIS
    Lance Rackula-planner en local, sans Docker et sans Node.js.

.DESCRIPTION
    Sert l'application statique (dossier app\ du paquet portable, ou dist\ du
    depot) sur http://127.0.0.1:<port>/ puis ouvre le navigateur par defaut.

    Le serveur est un mini serveur HTTP ecrit en PowerShell : aucune
    installation, aucun droit administrateur, aucune connexion reseau externe.
    Il n'ecoute que sur la boucle locale (127.0.0.1).

    Les donnees Rackula sont stockees par le navigateur (IndexedDB/localStorage)
    pour l'origine http://127.0.0.1:<port>. Gardez donc le meme port pour
    retrouver vos plans, et exportez regulierement vos layouts en .rackula.yaml.

.PARAMETER Port
    Port d'ecoute local. Defaut : 8420. Changez-le seulement si le port est
    deja utilise (les donnees du navigateur sont liees au port).

.PARAMETER Root
    Dossier de l'application a servir. Par defaut : app\ puis dist\ a cote du
    script.

.PARAMETER NoBrowser
    Ne pas ouvrir le navigateur automatiquement.

.PARAMETER Rebuild
    Forcer la reconstruction (npm run build) avant le lancement, si Node.js et
    les dependances sont disponibles.

.PARAMETER VerboseRequests
    Afficher chaque requete HTTP traitee.

.EXAMPLE
    .\Lancer-Rackula-Planner.ps1

.EXAMPLE
    .\Lancer-Rackula-Planner.ps1 -Port 9000 -NoBrowser
#>
[CmdletBinding()]
param(
    [int]$Port = 8420,
    [string]$Root = "",
    [switch]$NoBrowser,
    [switch]$Rebuild,
    [switch]$VerboseRequests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Write-Banner {
    param([string]$Version, [string]$Url, [string]$DataRoot)

    Write-Host ""
    Write-Host "  Rackula-planner $Version" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  Application : $Url" -ForegroundColor Green
    Write-Host "  Fichiers    : $DataRoot" -ForegroundColor DarkGray
    Write-Host "  Donnees     : stockage local du navigateur (origine $Url)" -ForegroundColor DarkGray
    Write-Host "  Arret       : Ctrl+C" -ForegroundColor DarkGray
    Write-Host ""
}

function Get-AppVersion {
    param([string]$AppRoot)

    $versionFile = Join-Path $AppRoot "version.json"
    if (Test-Path -LiteralPath $versionFile) {
        try {
            $info = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
            if ($info.version) {
                return [string]$info.version
            }
        } catch {
            # version.json illisible : on continue avec la version inconnue.
        }
    }
    return "dev"
}

function Resolve-AppRoot {
    param([string]$Requested, [string]$BaseDir, [bool]$ForceBuild)

    if ($Requested) {
        $candidate = [System.IO.Path]::GetFullPath($Requested)
        if (-not (Test-Path -LiteralPath (Join-Path $candidate "index.html"))) {
            throw "Le dossier '$candidate' ne contient pas index.html."
        }
        return $candidate
    }

    $candidates = @(
        (Join-Path $BaseDir "app"),
        (Join-Path $BaseDir "dist")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate "index.html")) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    $packageJson = Join-Path $BaseDir "package.json"
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($ForceBuild -or ($npm -and (Test-Path -LiteralPath $packageJson))) {
        if (-not $npm) {
            throw "Aucune application compilee et npm est introuvable. Utilisez le paquet portable (dossier app\) ou installez Node.js pour construire dist\."
        }
        Write-Host "  Aucune application compilee : construction de dist\..." -ForegroundColor Yellow
        Push-Location $BaseDir
        try {
            & npm run build
            if ($LASTEXITCODE -ne 0) {
                throw "npm run build a echoue (code $LASTEXITCODE)."
            }
        } finally {
            Pop-Location
        }
        $built = Join-Path $BaseDir "dist"
        if (Test-Path -LiteralPath (Join-Path $built "index.html")) {
            return [System.IO.Path]::GetFullPath($built)
        }
    }

    throw "Application introuvable. Attendu : un dossier 'app' (paquet portable) ou 'dist' (npm run build) a cote de ce script."
}

function Get-MimeType {
    param([string]$Extension)

    $map = @{
        ".html" = "text/html; charset=utf-8"
        ".htm"  = "text/html; charset=utf-8"
        ".js"   = "text/javascript; charset=utf-8"
        ".mjs"  = "text/javascript; charset=utf-8"
        ".css"  = "text/css; charset=utf-8"
        ".json" = "application/json; charset=utf-8"
        ".map"  = "application/json; charset=utf-8"
        ".svg"  = "image/svg+xml"
        ".png"  = "image/png"
        ".webp" = "image/webp"
        ".jpg"  = "image/jpeg"
        ".jpeg" = "image/jpeg"
        ".gif"  = "image/gif"
        ".ico"  = "image/x-icon"
        ".woff" = "font/woff"
        ".woff2" = "font/woff2"
        ".ttf"  = "font/ttf"
        ".txt"  = "text/plain; charset=utf-8"
        ".yaml" = "text/yaml; charset=utf-8"
        ".yml"  = "text/yaml; charset=utf-8"
        ".xml"  = "application/xml; charset=utf-8"
        ".pdf"  = "application/pdf"
        ".wasm" = "application/wasm"
    }

    if ($map.ContainsKey($Extension)) {
        return $map[$Extension]
    }
    return "application/octet-stream"
}

function Receive-RequestText {
    param([System.IO.Stream]$Stream)

    $buffer = New-Object byte[] 8192
    $memory = New-Object System.IO.MemoryStream
    try {
        while ($memory.Length -lt 65536) {
            $read = $Stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) {
                break
            }
            $memory.Write($buffer, 0, $read)
            $text = [System.Text.Encoding]::ASCII.GetString($memory.ToArray())
            if ($text.IndexOf("`r`n`r`n", [System.StringComparison]::Ordinal) -ge 0) {
                return $text
            }
        }
        return [System.Text.Encoding]::ASCII.GetString($memory.ToArray())
    } finally {
        $memory.Dispose()
    }
}

function Send-Headers {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$Reason,
        [string]$ContentType,
        [long]$ContentLength,
        [string]$CacheControl
    )

    $header = @(
        "HTTP/1.1 $StatusCode $Reason",
        "Content-Type: $ContentType",
        "Content-Length: $ContentLength",
        "Cache-Control: $CacheControl",
        "X-Content-Type-Options: nosniff",
        "Referrer-Policy: no-referrer",
        "Connection: close",
        "",
        ""
    ) -join "`r`n"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($bytes, 0, $bytes.Length)
}

function Send-TextResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$Reason,
        [string]$Text,
        [bool]$HeadOnly
    )

    $body = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Headers -Stream $Stream -StatusCode $StatusCode -Reason $Reason `
        -ContentType "text/plain; charset=utf-8" -ContentLength $body.Length `
        -CacheControl "no-store"
    if (-not $HeadOnly) {
        $Stream.Write($body, 0, $body.Length)
    }
    $Stream.Flush()
}

function Send-FileResponse {
    param(
        [System.IO.Stream]$Stream,
        [string]$FilePath,
        [string]$RequestPath,
        [bool]$HeadOnly
    )

    $extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
    $contentType = Get-MimeType -Extension $extension
    if ($RequestPath.StartsWith("/assets/")) {
        $cacheControl = "public, max-age=31536000, immutable"
    } else {
        $cacheControl = "no-cache"
    }

    $file = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        Send-Headers -Stream $Stream -StatusCode 200 -Reason "OK" `
            -ContentType $contentType -ContentLength $file.Length `
            -CacheControl $cacheControl
        if (-not $HeadOnly) {
            $file.CopyTo($Stream, 65536)
        }
        $Stream.Flush()
    } finally {
        $file.Dispose()
    }
}

# --------------------------------------------------------------------------
# Resolution de l'application
# --------------------------------------------------------------------------

$appRoot = Resolve-AppRoot -Requested $Root -BaseDir $scriptDir -ForceBuild ([bool]$Rebuild)
$rootFull = [System.IO.Path]::GetFullPath($appRoot)
if (-not $rootFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootFull = $rootFull + [System.IO.Path]::DirectorySeparatorChar
}

$version = Get-AppVersion -AppRoot $appRoot
$url = "http://127.0.0.1:$Port/"

# --------------------------------------------------------------------------
# Serveur
# --------------------------------------------------------------------------

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  Impossible d'ecouter sur le port $Port." -ForegroundColor Red
    Write-Host "  Le port est peut-etre deja utilise. Essayez : .\Lancer-Rackula-Planner.ps1 -Port 8421" -ForegroundColor Yellow
    Write-Host "  ($($_.Exception.Message))" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

Write-Banner -Version $version -Url $url -DataRoot $appRoot

if (-not $NoBrowser) {
    try {
        Start-Process $url | Out-Null
    } catch {
        Write-Host "  Ouvrez manuellement $url dans votre navigateur." -ForegroundColor Yellow
    }
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $statusForLog = 0
        $pathForLog = ""
        $methodForLog = ""
        $stream = $null

        try {
            $client.NoDelay = $true
            $client.ReceiveTimeout = 15000
            $stream = $client.GetStream()
            $stream.ReadTimeout = 15000

            $raw = Receive-RequestText -Stream $stream
            if ([string]::IsNullOrWhiteSpace($raw)) {
                continue
            }

            $firstLine = ($raw -split "`r`n")[0]
            $match = [regex]::Match($firstLine, '^([A-Za-z]+)\s+(\S+)\s+HTTP/\d\.\d$')
            if (-not $match.Success) {
                Send-TextResponse -Stream $stream -StatusCode 400 -Reason "Bad Request" `
                    -Text "Requete HTTP invalide." -HeadOnly $false
                $statusForLog = 400
                continue
            }

            $method = $match.Groups[1].Value.ToUpperInvariant()
            $target = $match.Groups[2].Value
            $methodForLog = $method

            $headOnly = ($method -eq "HEAD")
            if ($method -ne "GET" -and -not $headOnly) {
                Send-TextResponse -Stream $stream -StatusCode 405 -Reason "Method Not Allowed" `
                    -Text "Seules les methodes GET et HEAD sont acceptees." -HeadOnly $false
                $statusForLog = 405
                continue
            }

            $requestPath = $target
            if ($requestPath.StartsWith("http://") -or $requestPath.StartsWith("https://")) {
                try {
                    $requestPath = ([System.Uri]$requestPath).AbsolutePath
                } catch {
                    $requestPath = "/"
                }
            }
            $requestPath = ($requestPath -split '\?', 2)[0]
            $requestPath = ($requestPath -split '#', 2)[0]
            try {
                $requestPath = [System.Uri]::UnescapeDataString($requestPath)
            } catch {
                $requestPath = "/"
            }
            $pathForLog = $requestPath

            if ($requestPath -eq "" -or $requestPath -eq "/") {
                $requestPath = "/index.html"
            }
            if ($requestPath.EndsWith("/")) {
                $requestPath = $requestPath + "index.html"
            }
            if ($requestPath -eq "/login") {
                $requestPath = "/login.html"
            }

            if ($requestPath.IndexOf([char]0) -ge 0 -or $requestPath.Contains(":")) {
                Send-TextResponse -Stream $stream -StatusCode 400 -Reason "Bad Request" `
                    -Text "Chemin invalide." -HeadOnly $headOnly
                $statusForLog = 400
                continue
            }

            $relative = $requestPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $rootFull $relative))

            if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                Send-TextResponse -Stream $stream -StatusCode 403 -Reason "Forbidden" `
                    -Text "Acces refuse." -HeadOnly $headOnly
                $statusForLog = 403
                continue
            }

            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $extension = [System.IO.Path]::GetExtension($fullPath)
                if ($extension -eq "") {
                    # Application monopage : les chemins sans extension retombent sur index.html.
                    $fullPath = Join-Path $rootFull "index.html"
                } else {
                    Send-TextResponse -Stream $stream -StatusCode 404 -Reason "Not Found" `
                        -Text "Fichier introuvable : $requestPath" -HeadOnly $headOnly
                    $statusForLog = 404
                    continue
                }
            }

            Send-FileResponse -Stream $stream -FilePath $fullPath -RequestPath $requestPath -HeadOnly $headOnly
            $statusForLog = 200
        } catch {
            $message = $_.Exception.Message
            if ($VerboseRequests) {
                Write-Warning "Connexion interrompue : $message"
            }
            if ($statusForLog -eq 0 -and $null -ne $stream) {
                try {
                    Send-TextResponse -Stream $stream -StatusCode 500 -Reason "Internal Server Error" `
                        -Text "Erreur interne du serveur local." -HeadOnly $false
                } catch {
                    # Le client a deja ferme la connexion.
                }
                $statusForLog = 500
            }
        } finally {
            try {
                $client.Close()
            } catch {
                # Rien a faire : la connexion est deja fermee.
            }
        }

        if ($VerboseRequests) {
            Write-Host ("  {0,-4} {1,3} {2}" -f $methodForLog, $statusForLog, $pathForLog) -ForegroundColor DarkGray
        }
    }
} finally {
    $listener.Stop()
    Write-Host ""
    Write-Host "  Serveur arrete." -ForegroundColor DarkGray
}
