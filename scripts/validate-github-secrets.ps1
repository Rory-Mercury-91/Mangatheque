# @description Verifie localement les secrets GitHub Actions avant de les configurer.
# Usage : .\scripts\validate-github-secrets.ps1

param(
    [string]$KeyPath = ".tauri/mangatheque.key",
    [string]$KeystorePath = "mangatheque-release.jks",
    [string]$KeyAlias = "mangatheque"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

function Write-Ok($message) {
    Write-Host "[OK] $message" -ForegroundColor Green
}

function Write-Ko($message) {
    Write-Host "[KO] $message" -ForegroundColor Red
}

function Write-Info($message) {
    Write-Host "[--] $message" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== Validation des secrets GitHub Actions ===" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# --- 1. Cle publique Tauri (committee dans tauri.conf.json) ---
Write-Host "1. Updater Tauri (minisign)" -ForegroundColor Yellow

$pubKeyPath = "$KeyPath.pub"
$tauriConfPath = "src-tauri/tauri.conf.json"

if (-not (Test-Path $pubKeyPath)) {
    Write-Ko "Fichier public introuvable : $pubKeyPath"
    Write-Info "Lancez : .\scripts\setup-updater-signing.ps1"
    $allOk = $false
} else {
    $localPubKey = (Get-Content $pubKeyPath -Raw).Trim()
    Write-Ok "Cle publique locale : $pubKeyPath ($($localPubKey.Length) caracteres)"
}

if (-not (Test-Path $tauriConfPath)) {
    Write-Ko "tauri.conf.json introuvable"
    $allOk = $false
} else {
    $tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
    $confPubKey = $tauriConf.plugins.updater.pubkey.Trim()

    if ($confPubKey -match "REMPLACER") {
        Write-Ko "pubkey dans tauri.conf.json non configuree"
        $allOk = $false
    } elseif ($localPubKey -and $confPubKey -ne $localPubKey) {
        Write-Ko "pubkey tauri.conf.json != $pubKeyPath"
        Write-Info "Mettez a jour tauri.conf.json ou regenerez les cles"
        $allOk = $false
    } else {
        Write-Ok "pubkey tauri.conf.json alignee avec $pubKeyPath"
    }
}

# --- 2. Cle privee Tauri (secret GitHub) ---
Write-Host ""
Write-Host "2. TAURI_SIGNING_PRIVATE_KEY (secret GitHub)" -ForegroundColor Yellow

if (-not (Test-Path $KeyPath)) {
    Write-Ko "Cle privee introuvable : $KeyPath"
    $allOk = $false
} else {
    $privateKey = (Get-Content $KeyPath -Raw).Trim()
    Write-Ok "Cle privee locale : $KeyPath ($($privateKey.Length) caracteres, 1 ligne)"

    if ($privateKey -match "public key") {
        Write-Ko "Vous avez peut-etre copie la cle PUBLIQUE (.pub) au lieu de la PRIVEE (.key)"
        $allOk = $false
    }

    Write-Host ""
    Write-Host "   Coller dans GitHub > Settings > Secrets > TAURI_SIGNING_PRIVATE_KEY :" -ForegroundColor Cyan
    Write-Host "   -> Contenu COMPLET du fichier $KeyPath (une seule ligne)" -ForegroundColor White
    Write-Host "   -> PAS le fichier .pub, PAS la pubkey de tauri.conf.json" -ForegroundColor White

    $testFile = Join-Path $env:TEMP "mangatheque-sign-test.txt"
    Set-Content -Path $testFile -Value "test" -NoNewline

    $password = Read-Host "   Mot de passe de la cle (Entree si vide, pour tester localement)"

    $signArgs = @("sign", $testFile, "-f", $KeyPath)
    if ($password) {
        $signArgs += @("-p", $password)
    }

    $env:CI = "true"
    $signOutput = & npx tauri signer @signArgs 2>&1
    $signOk = ($LASTEXITCODE -eq 0)
    if ($signOk) {
        Write-Ok "Signature locale reussie (cle + mot de passe valides)"
        Remove-Item "$testFile.sig" -ErrorAction SilentlyContinue
    } else {
        Write-Ko "Signature locale echouee - verifiez le mot de passe ou le contenu du .key"
        Write-Info ($signOutput | Out-String).Trim()
        $allOk = $false
    }
    Remove-Item $testFile -ErrorAction SilentlyContinue

    if ($privateKey -notmatch "minisign" -and $signOk) {
        Write-Info "Cle chiffree minisign (format normal, le mot 'minisign' n'apparait pas dans le .key)"
    }

    Write-Host ""
    Write-Host "   Secret GitHub TAURI_SIGNING_PRIVATE_KEY_PASSWORD :" -ForegroundColor Cyan
    if ($password) {
        Write-Host "   -> Exactement le meme mot de passe que ci-dessus" -ForegroundColor White
    } else {
        Write-Host "   -> Laissez VIDE ou ne creez pas le secret si la cle n'a pas de mot de passe" -ForegroundColor White
    }
}

# --- 3. Keystore Android ---
Write-Host ""
Write-Host "3. Secrets Android (APK signe)" -ForegroundColor Yellow

if (-not (Test-Path $KeystorePath)) {
    Write-Ko "Keystore introuvable : $KeystorePath"
    Write-Info "Generez-le avec keytool ou reutilisez votre .jks existant"
    $allOk = $false
} else {
    $jksBytes = [IO.File]::ReadAllBytes((Resolve-Path $KeystorePath))
    $jksBase64 = [Convert]::ToBase64String($jksBytes)
    Write-Ok "Keystore : $KeystorePath ($($jksBytes.Length) octets)"

    Write-Host ""
    Write-Host "   ANDROID_KEYSTORE_BASE64 :" -ForegroundColor Cyan
    Write-Host "   -> Copiez la ligne ci-dessous (tout sur une ligne) :" -ForegroundColor White
    Write-Host ""
    Write-Host $jksBase64
    Write-Host ""

    Write-Host "   ANDROID_KEYSTORE_PASSWORD :" -ForegroundColor Cyan
    Write-Host "   -> Mot de passe du fichier .jks" -ForegroundColor White
    Write-Host ""
    Write-Host "   ANDROID_KEY_ALIAS :" -ForegroundColor Cyan
    Write-Host "   -> Valeur recommandee : $KeyAlias" -ForegroundColor White

    if (Get-Command keytool -ErrorAction SilentlyContinue) {
        Write-Info "Test keytool -list (mot de passe demande) :"
        keytool -list -keystore $KeystorePath -alias $KeyAlias 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Alias '$KeyAlias' valide dans le keystore"
        }
    }
}

# --- 4. Supabase (build Vite embarque au compile time) ---
Write-Host ""
Write-Host "4. Supabase (VITE_SUPABASE_* pour CI)" -ForegroundColor Yellow

$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Ko "Fichier .env local introuvable - impossible de verifier Supabase"
    Write-Info "Copiez .env.example vers .env et renseignez VITE_SUPABASE_ANON_KEY"
    $allOk = $false
} else {
    $envContent = Get-Content $envFile -Raw
    $urlMatch = [regex]::Match($envContent, '(?m)^VITE_SUPABASE_URL=(.+)$')
    $keyMatch = [regex]::Match($envContent, '(?m)^VITE_SUPABASE_ANON_KEY=(.+)$')

    if (-not $urlMatch.Success -or -not $keyMatch.Success) {
        Write-Ko "VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant dans .env"
        $allOk = $false
    } else {
        $url = $urlMatch.Groups[1].Value.Trim()
        $anonKey = $keyMatch.Groups[1].Value.Trim()

        if ($url -match "votre_cle|example|placeholder" -or $anonKey -match "votre_cle|example|placeholder") {
            Write-Ko "Valeurs placeholder dans .env - renseignez la vraie cle anon Supabase"
            $allOk = $false
        } else {
            Write-Ok "VITE_SUPABASE_URL present dans .env"
            Write-Ok "VITE_SUPABASE_ANON_KEY present dans .env ($($anonKey.Length) caracteres)"
        }

        Write-Host ""
        Write-Host "   GitHub secrets (memes noms, memes valeurs que .env) :" -ForegroundColor Cyan
        Write-Host "   -> VITE_SUPABASE_URL" -ForegroundColor White
        Write-Host "   -> VITE_SUPABASE_ANON_KEY" -ForegroundColor White
        Write-Host "   (La cle anon est publique cote client ; RLS protege les donnees.)" -ForegroundColor DarkGray
    }
}

# --- Resume ---
Write-Host ""
Write-Host "=== Resume ===" -ForegroundColor Cyan
if ($allOk) {
    Write-Ok "Configuration locale coherente. Copiez les secrets dans GitHub puis relancez les workflows."
} else {
    Write-Ko "Corrigez les points [KO] avant de configurer GitHub."
}
Write-Host ""
Write-Host "Secrets GitHub a creer (Settings > Secrets and variables > Actions) :" -ForegroundColor Yellow
Write-Host "  - TAURI_SIGNING_PRIVATE_KEY"
Write-Host "  - TAURI_SIGNING_PRIVATE_KEY_PASSWORD  (si mot de passe)"
Write-Host "  - ANDROID_KEYSTORE_BASE64"
Write-Host "  - ANDROID_KEYSTORE_PASSWORD"
Write-Host "  - ANDROID_KEY_ALIAS"
Write-Host "  - VITE_SUPABASE_URL"
Write-Host "  - VITE_SUPABASE_ANON_KEY"
Write-Host ""
Write-Host "Apres configuration : Actions > workflow en echec > Re-run failed jobs" -ForegroundColor DarkGray
Write-Host ""
