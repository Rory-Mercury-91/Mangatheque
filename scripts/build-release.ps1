# @description Compile desktop (installateur Windows) + APK Android et les regroupe dans release/Mangatheque_X.Y.Z/.
# Usage :
#   .\scripts\build-release.ps1
#   .\scripts\build-release.ps1 -SkipAndroid
#   .\scripts\build-release.ps1 -Version 0.2.0

param(
    [switch]$SkipDesktop,
    [switch]$SkipAndroid,
    [string]$Version = "",
    [string]$OutputRoot = "release"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

function Read-ProjectVersion {
    $packageJsonPath = Join-Path $ProjectRoot "package.json"
    $tauriConfPath = Join-Path $ProjectRoot "src-tauri\tauri.conf.json"

    $package = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $tauri = Get-Content $tauriConfPath -Raw | ConvertFrom-Json

    if ($package.version -ne $tauri.version) {
        Write-Warning "Versions differentes : package.json=$($package.version), tauri.conf.json=$($tauri.version)"
        Write-Warning "Utilisation de package.json comme reference."
    }

    return $package.version
}

function Copy-FirstMatch {
    param(
        [string[]]$Patterns,
        [string]$DestinationFile
    )

    foreach ($pattern in $Patterns) {
        $resolved = Resolve-Path -Path $pattern -ErrorAction SilentlyContinue
        if ($resolved) {
            $source = ($resolved | Select-Object -First 1).Path
            Copy-Item -Path $source -Destination $DestinationFile -Force
            return $source
        }
    }

    return $null
}

$resolvedVersion = if ($Version) { $Version } else { Read-ProjectVersion }
$folderName = "Mangatheque_$resolvedVersion"
$releaseDir = Join-Path $ProjectRoot (Join-Path $OutputRoot $folderName)
$desktopDir = Join-Path $releaseDir "desktop"
$androidDir = Join-Path $releaseDir "android"

Write-Host ""
Write-Host "=== Mangatheque - build release v$resolvedVersion ===" -ForegroundColor Cyan
Write-Host "Sortie : $releaseDir"
Write-Host ""

if (Test-Path $releaseDir) {
    Write-Host "Nettoyage du dossier release existant..." -ForegroundColor DarkGray
    Remove-Item -Recurse -Force $releaseDir
}

New-Item -ItemType Directory -Path $desktopDir -Force | Out-Null
New-Item -ItemType Directory -Path $androidDir -Force | Out-Null

$artifacts = @()

if (-not $SkipDesktop) {
    Write-Host "[1/2] Compilation desktop (installateur Windows)..." -ForegroundColor Yellow
    npm run build:desktop
    if ($LASTEXITCODE -ne 0) {
        throw "Echec du build desktop (code $LASTEXITCODE)."
    }

    $nsisDest = Join-Path $desktopDir "Mangatheque_${resolvedVersion}_windows-x64-setup.exe"
    $nsisSource = Copy-FirstMatch @(
        "src-tauri\target\release\bundle\nsis\*.exe"
    ) $nsisDest

    if (-not $nsisSource) {
        throw "Installateur NSIS introuvable dans src-tauri\target\release\bundle\nsis\"
    }

    $artifacts += "desktop\$([System.IO.Path]::GetFileName($nsisDest))"

    $msiDest = Join-Path $desktopDir "Mangatheque_${resolvedVersion}_windows-x64.msi"
    $msiSource = Copy-FirstMatch @(
        "src-tauri\target\release\bundle\msi\*.msi"
    ) $msiDest

    if ($msiSource) {
        $artifacts += "desktop\$([System.IO.Path]::GetFileName($msiDest))"
    } else {
        Write-Host "MSI non trouve (optionnel, ignore)." -ForegroundColor DarkGray
    }
} else {
    Write-Host "[1/2] Desktop ignore (-SkipDesktop)." -ForegroundColor DarkGray
}

if (-not $SkipAndroid) {
    Write-Host "[2/2] Compilation Android (APK)..." -ForegroundColor Yellow

    $keystoreProps = Join-Path $ProjectRoot "src-tauri\gen\android\keystore.properties"
    if (-not (Test-Path $keystoreProps)) {
        Write-Warning "keystore.properties absent - l'APK peut etre non signe et non installable."
    }

    npm run build:android -- --apk
    if ($LASTEXITCODE -ne 0) {
        throw "Echec du build Android (code $LASTEXITCODE)."
    }

    $apkDest = Join-Path $androidDir "Mangatheque_${resolvedVersion}_android-universal.apk"
    $apkSource = Copy-FirstMatch @(
        "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk",
        "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk",
        "src-tauri\gen\android\app\build\outputs\apk\**\*.apk"
    ) $apkDest

    if (-not $apkSource) {
        throw "APK introuvable dans src-tauri\gen\android\app\build\outputs\apk\"
    }

    if ($apkSource -match "unsigned") {
        Write-Warning "APK copie depuis une variante non signee."
    }

    $artifacts += "android\$([System.IO.Path]::GetFileName($apkDest))"
} else {
    Write-Host "[2/2] Android ignore (-SkipAndroid)." -ForegroundColor DarkGray
}

$manifest = @{
    product   = "Mangatheque"
    version   = $resolvedVersion
    builtAt   = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    artifacts = $artifacts
} | ConvertTo-Json -Depth 4

$manifest | Set-Content -Path (Join-Path $releaseDir "manifest.json") -Encoding UTF8

Write-Host ""
Write-Host "Release prete :" -ForegroundColor Green
Write-Host "  $releaseDir"
foreach ($item in $artifacts) {
    Write-Host "  - $item" -ForegroundColor White
}
Write-Host ""
