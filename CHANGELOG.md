# Changelog

## [1.0.3] - 2026-06-11

### Corrigé

- Sync Supabase Realtime : un seul canal partagé (`supabaseSyncHub`) pour éviter le crash après connexion.

## [1.0.2] - 2026-06-11

### Corrigé

- Ecran noir apres connexion (session + chemins assets Tauri `base: './'`).
- Warning CI `uploadUpdaterJson` remplace par `includeUpdaterJson`.

## [1.0.1] - 2026-06-11

### Corrigé

- Build CI/release : injection des variables Supabase (`VITE_SUPABASE_*`) pour desktop et Android.

## [1.0.0] - 2026-06-11

### Ajouté

- Application desktop Windows (installateur NSIS / MSI) et APK Android.
- Bibliothèque, tableau de bord, fiche œuvre, journal d'activité, personnalisation.
- Import Nautiljon via Tampermonkey (desktop).
- Auth Supabase, sync temps réel multi-appareils.
- Filtres bibliothèque, proxy images couvertures (desktop + mobile).
- Script local `npm run build:release` et workflow GitHub Release sur tag `v*`.
- Mises à jour automatiques desktop (Tauri updater + `latest.json`).

### Notes release

- Tag Git `v1.0.0` déclenche le workflow `.github/workflows/release.yml`.
- Secrets GitHub requis pour une release complète :
  - `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (updater desktop)
  - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (APK signé)
