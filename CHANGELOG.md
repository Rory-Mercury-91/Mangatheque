# Changelog

## [1.1.4] - 2026-06-12

### Modifié

- Barre de navigation **fixée en haut** sur toutes les pages (mobile et desktop).
- Hauteur du header mesurée dynamiquement (bannière MAJ, safe area).
- Tableau de bord : titre de page sticky sous la navigation.
- Filtres bibliothèque et journal recalés sous le header fixe.

## [1.1.3] - 2026-06-12

### Ajouté

- Bouton **Coller** dans l'import JSON (lecture presse-papiers).
- Script Tampermonkey v1.4.1 : export mobile copie uniquement le JSON (sans fichier).

### Modifié

- Installation du script sur mobile via URL GitHub (plus rapide que l'enregistrement local).
- Fiche détail mobile : barre d'actions en icônes seules (comme la navigation).
- Boutons « Ajouter un tome » harmonisés (haut et bas, alignés à droite).
- Carrousel derniers ajouts : couverture du tome (repli sur la série si absente).

### Notes release

- Mobile : Nautiljon → « Exporter JSON » → Mangathèque → « Coller ».
- Réinstaller le script via « Installer le script » pour la v1.4.1.

## [1.1.2] - 2026-06-12

### Ajouté

- Import JSON Nautiljon dans la modale « Ajouter une œuvre » (coller ou fichier `.json`).
- Script Tampermonkey v1.4.0 : export JSON sur mobile (Firefox), secours desktop.
- Bouton téléchargement du script visible aussi sur Android.

### Notes release

- Mobile : Nautiljon → « Exporter JSON » → Mangathèque → « Importer depuis JSON ».
- Re-télécharger le script depuis l'app pour obtenir la v1.4.0.

## [1.1.1] - 2026-06-12

### Ajouté

- Reset mot de passe (lien e-mail, page dédiée, cooldown anti-spam Supabase).
- Import Nautiljon global depuis toute page desktop (`DesktopImportBridge`).
- Filtre statut de lecture (En cours, En attente, Abandonnée, Terminée) dans la bibliothèque.
- Statut « En attente » (`on_hold`) et import depuis Nautiljon (script v1.3.0).
- Lien « Ouvrir sur Nautiljon » sur la fiche détail si URL source renseignée.
- Footer sticky « Ajouter un tome » (modale œuvre et fiche détail).
- Journal : filtres repliables sur mobile, auteur de restauration si différent du suppresseur.

### Modifié

- Propagation automatique des propriétaires du tome 1 vers les autres tomes (manuel + Mihon).
- Zone de test « Réinitialiser » visible uniquement en mode développement.
- Lightbox : bouton fermer décalé sous la barre de statut mobile.

### Corrigé

- Téléchargement du script Tampermonkey (permissions fs Tauri + script embarqué au build).
- Import Mihon ignoré sur la fiche détail (écouteur déplacé au layout global).

### Notes release

- Migrations Supabase : `20260612160000` (restaurateur journal), `20260612170000` (`on_hold`).
- Re-télécharger le script Tampermonkey depuis l'app (v1.3.0) pour le statut VF Nautiljon.

## [1.1.0] - 2026-06-12

### Ajouté

- Tableau de bord : récap d'achat mensuel, carrousel derniers ajouts, top dépenses.
- Bibliothèque : pagination (50 séries), filtres fixes, retour en haut, repli mobile.
- Journal : filtres (type, auteur, recherche), pagination, restauration suppressions, profils foyer.
- Fiche œuvre : statut de lecture, layout refondu, cartes financières série.
- Zone de test : réinitialisation totale des données (double confirmation).
- Migrations : `reading_status`, journal auteur/restauration, accents propriétaires, `profiles`.

### Modifié

- Libellés propriétaires harmonisés (Céline, Sébastien, Alex).
- Suppression page Personnalisation ; sync silencieuse sans scintillement.
- Bouton Quitter mobile corrigé.

### Notes release

- Appliquer les migrations Supabase `20260612120000` à `20260612150000` avant test multi-appareils.

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
