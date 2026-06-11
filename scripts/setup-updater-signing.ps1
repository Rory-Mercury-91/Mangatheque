# @description Genere une cle minisign pour l'updater Tauri et affiche les secrets GitHub a configurer.
# Usage : .\scripts\setup-updater-signing.ps1

param(
    [string]$KeyPath = ".tauri/mangatheque.key",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

if (-not $Password) {
    $Password = Read-Host "Mot de passe de la cle privee (CI + builds signes)"
}

New-Item -ItemType Directory -Path (Split-Path $KeyPath -Parent) -Force | Out-Null

$env:CI = "true"
npx tauri signer generate -w $KeyPath -p $Password --ci -f
if ($LASTEXITCODE -ne 0) {
    throw "Echec de la generation de cle."
}

$pubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $pubKeyPath)) {
    throw "Fichier public introuvable : $pubKeyPath"
}

$pubKey = (Get-Content $pubKeyPath -Raw).Trim()

Write-Host ""
Write-Host "=== Cle publique (a coller dans src-tauri/tauri.conf.json > plugins.updater.pubkey) ===" -ForegroundColor Cyan
Write-Host $pubKey
Write-Host ""
Write-Host "=== Secrets GitHub (Settings > Secrets and variables > Actions) ===" -ForegroundColor Yellow
Write-Host "TAURI_SIGNING_PRIVATE_KEY = contenu du fichier $KeyPath"
Write-Host "TAURI_SIGNING_PRIVATE_KEY_PASSWORD = le mot de passe choisi"
Write-Host ""
Write-Host "Ne commitez jamais la cle privee (.tauri/ est gitignore)." -ForegroundColor Red
Write-Host ""
