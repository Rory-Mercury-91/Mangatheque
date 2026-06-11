# @description Configure Cargo, Rustup et Gradle sur le lecteur F: et nettoie les caches de build locaux.
# Usage : .\scripts\setup-toolchains-f.ps1
#         .\scripts\setup-toolchains-f.ps1 -Migrate   # copie les caches depuis C: vers F:
#         .\scripts\setup-toolchains-f.ps1 -RemoveOldC # supprime les anciens caches C: (après vérif)

param(
    [switch]$Migrate,
    [switch]$RemoveOldC
)

$ErrorActionPreference = "Stop"
$ToolchainsRoot = "F:\Dev\Toolchains"
$CargoHome = Join-Path $ToolchainsRoot ".cargo"
$RustupHome = Join-Path $ToolchainsRoot ".rustup"
$GradleHome = Join-Path $ToolchainsRoot ".gradle"
$OldCargo = Join-Path $env:USERPROFILE ".cargo"
$OldRustup = Join-Path $env:USERPROFILE ".rustup"
$OldGradle = Join-Path $env:USERPROFILE ".gradle"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

Write-Host "=== Mangathèque : toolchains sur F: ===" -ForegroundColor Cyan
Write-Host "Racine cible : $ToolchainsRoot"

foreach ($dir in @($ToolchainsRoot, $CargoHome, $RustupHome, $GradleHome)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Créé : $dir"
    }
}

# Variables utilisateur persistantes (nouveaux terminaux + redémarrages)
[Environment]::SetEnvironmentVariable("CARGO_HOME", $CargoHome, "User")
[Environment]::SetEnvironmentVariable("RUSTUP_HOME", $RustupHome, "User")
[Environment]::SetEnvironmentVariable("GRADLE_USER_HOME", $GradleHome, "User")

# Session courante
$env:CARGO_HOME = $CargoHome
$env:RUSTUP_HOME = $RustupHome
$env:GRADLE_USER_HOME = $GradleHome

Write-Host "Variables définies (User + session) :" -ForegroundColor Green
Write-Host "  CARGO_HOME       = $CargoHome"
Write-Host "  RUSTUP_HOME      = $RustupHome"
Write-Host "  GRADLE_USER_HOME = $GradleHome"

function Copy-CacheIfNeeded {
    param([string]$Source, [string]$Dest, [string]$Label)
    if (-not (Test-Path $Source)) {
        Write-Host "$Label : rien à migrer sur C:" -ForegroundColor DarkGray
        return
    }
    if ((Get-ChildItem $Dest -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
        Write-Host "$Label : destination déjà peuplée, migration ignorée." -ForegroundColor Yellow
        return
    }
    Write-Host "Migration $Label : $Source -> $Dest ..." -ForegroundColor Cyan
    robocopy $Source $Dest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Échec robocopy pour $Label (code $LASTEXITCODE)" }
    Write-Host "$Label : migration terminée." -ForegroundColor Green
}

if ($Migrate) {
    Copy-CacheIfNeeded -Source $OldCargo -Dest $CargoHome -Label "Cargo"
    Copy-CacheIfNeeded -Source $OldRustup -Dest $RustupHome -Label "Rustup"
    Copy-CacheIfNeeded -Source $OldGradle -Dest $GradleHome -Label "Gradle"
}

# Arrêt Gradle + nettoyage caches Kotlin/Gradle du projet Android
$AndroidDir = Join-Path $ProjectRoot "src-tauri\gen\android"
if (Test-Path (Join-Path $AndroidDir "gradlew.bat")) {
    Write-Host "Arrêt du daemon Gradle..." -ForegroundColor Cyan
    Push-Location $AndroidDir
    & .\gradlew.bat --stop 2>$null
    Pop-Location
}

$cleanPaths = @(
    (Join-Path $AndroidDir "app\build\kotlin"),
    (Join-Path $AndroidDir "app\build\tmp\kotlin-classes"),
    (Join-Path $AndroidDir ".gradle"),
    (Join-Path $AndroidDir "build")
)
foreach ($p in $cleanPaths) {
    if (Test-Path $p) {
        Remove-Item -Recurse -Force $p
        Write-Host "Nettoyé : $p" -ForegroundColor DarkGray
    }
}

if ($RemoveOldC) {
    foreach ($old in @($OldCargo, $OldRustup, $OldGradle)) {
        if (Test-Path $old) {
            Remove-Item -Recurse -Force $old
            Write-Host "Supprimé (C:) : $old" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Terminé. Redémarrez Cursor / vos terminaux pour prendre en compte les variables." -ForegroundColor Green
Write-Host "Prochaine étape : copiez keystore.properties.example vers keystore.properties et renseignez le mot de passe."
