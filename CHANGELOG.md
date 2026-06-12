# Changelog

## [1.1.10] - 2026-06-12

### Ajouté

- Modale de confirmation avant **Déconnexion** et **Quitter** (mobile + desktop).

### Modifié

- Marge basse Android renforcée (`6rem` minimum + `scroll-padding` sur la zone de défilement).

## [1.1.9] - 2026-06-12

### Modifié

- Terminologie « Série(s) » complétée (messages d'erreur desktop + script Tampermonkey v1.4.2).

## [1.1.8] - 2026-06-12

### Ajouté

- Tri bibliothèque **A → Z** et **Z → A**.
- Bouton **Retour en haut** dans la barre de navigation mobile (toutes les pages).
- Tooltip au tap sur les pastilles propriétaire (Mihon / Achat).

### Modifié

- Marge basse mobile renforcée (barre système Android).
- « Œuvre(s) » → **« Série(s) »** dans l'interface.
- Bibliothèque mobile : boutons **Script** et **Ajouter** sur une ligne.
- Fiche détail : ordre **Retour | Nautiljon | Modifier | Supprimer** ; légende supprimée.
- Graphique récap achat mobile : labels mois sur deux lignes, colonnes plus espacées.

## [1.1.7] - 2026-06-12

### Ajouté

- Contrôle anti-doublon par titre de série (import JSON, création et modification).

### Modifié

- Fiche détail mobile : flèche retour seule, alignée avec les boutons d'action sur une ligne.
- Modale création : sections renommées (Import Json / Informations générales / Tomes).
- Import JSON mobile : bouton Coller retiré, Appliquer uniquement (collage manuel dans le champ).

## [1.1.6] - 2026-06-12

### Modifié

- Modale série (mobile) : sections Import JSON, Série et Tomes réorganisées ; en-tête tomes sticky + scroll interne.
- Import JSON mobile : Coller / Appliquer sans fichier `.json` ; collage manuel dans le champ supporté.
- Renommage « Œuvre » → « Série » dans la modale.
- Fiche détail mobile : barre d'actions sticky, bouton retour en haut ; suppression du bouton « Ajouter un tome » en bas.

## [1.1.5] - 2026-06-12

### Corrigé

- Navigation toujours visible au scroll sur Android (scroll interne, plus de `position: fixed` fragile).
- Ancre sticky invisible sous la nav sur toutes les pages ; filtres/recherche bibliothèque et journal alignés.

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
