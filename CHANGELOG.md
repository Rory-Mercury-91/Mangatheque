# Changelog

## [1.2.26] - 2026-07-13

### Ajouté

- Page **Suivi de lecture** : aperçu bibliothèque/possédées, tomes et chapitres lus, statuts cliquables, 6 dernières lectures, liste des séries en cours, filtre par propriétaire.

### Modifié

- Couvertures : normalisation centralisée des URLs Nautiljon (`imagesmin`, `mini`), variantes `CoverImage` (natural / tile / fill), grille bibliothèque et affichage fiche détail.
- Userscript Nautiljon 1.15.8 : prise en charge des éditions scan/trad et import sans édition VF obligatoire.
- Bibliothèque bureau : pagination 32 œuvres (4×8) et tuiles à largeur plafonnée.
- Sync Supabase : rechargement silencieux sur le suivi de lecture ; tables de progression utilisateur écoutées.

### Corrigé

- Pixellisation des couvertures (miniatures Nautiljon étirées).
- Flash de rechargement sur la page Suivi de lecture lors des syncs sans changement de données.

## [1.2.25] - 2026-06-22

### Corrigé

- Userscript Nautiljon 1.15.7 : export JSON Firefox Android — ancre blob en priorité (comme v1.15), `@downloadMode browser`, suppression du faux succès GM_download.

## [1.2.24] - 2026-06-22

### Corrigé

- Userscript Nautiljon 1.15.6 : téléchargement fichier JSON (data URL base64, partage Android, messages honnêtes si seul le presse-papiers fonctionne).

## [1.2.23] - 2026-06-22

### Corrigé

- Userscript Nautiljon 1.15.5 : export JSON fiable sur PC, Android et tablette (GM_download multi-stratégies, retour visuel, presse-papiers mobile en secours).

## [1.2.22] - 2026-06-22

### Corrigé

- Userscript Nautiljon 1.15.3 : bouton « Télécharger JSON » actif par défaut (type VF pré-coché), style distinct quand activé, export possible malgré les doublons de numéros.

## [1.2.21] - 2026-06-22

### Corrigé

- Fiche série : saisie « Chapitres lus » enregistrée à la validation (blur ou Entrée), plus à chaque chiffre tapé.

## [1.2.20] - 2026-06-22

### Corrigé

- Bibliothèque (bureau) : suppression de l'espace vide en bas de page causé par le préchargement de la page suivante dans le flux scroll.

## [1.2.19] - 2026-06-22

### Ajouté

- Cache local des fiches série (IndexedDB) : affichage instantané puis revalidation en arrière-plan.
- Préchargement des fiches des pages courante et suivante de la bibliothèque.
- Buffer pagination bibliothèque : page courante et suivante montées en DOM ; couvertures de la page suivante en chargement prioritaire.

### Modifié

- Tri bibliothèque par défaut : titre A→Z.
- Filtres bibliothèque : repli du tiroir principal au scroll volontaire de la liste.
- Journal d'activité : suppression du verrouillage du scroll quand le tiroir filtres est ouvert.

## [1.2.18] - 2026-06-23

### Modifié

- Filtres bibliothèque (mobile) : quatre groupes principaux sur une ligne ; repli auto des volets au scroll de la liste.
- Suppression du verrouillage du scroll quand le tiroir filtres est ouvert.
- Modale d'aide filtres : légende visuelle alignée sur les six groupes (icônes et disposition).

## [1.2.17] - 2026-06-22

### Corrigé

- Filtres bibliothèque (mobile / tablette) : deux rangées (4 + 2) au lieu des six groupes sur une seule ligne.

## [1.2.16] - 2026-06-22

### Modifié

- Filtres bibliothèque : Démographie (👥) et Genres (🏷️) avec icônes et libellés responsive.
- Mobile / tablette : les six groupes de filtres sur un seul accordéon horizontal.

## [1.2.15] - 2026-06-22

### Modifié

- Filtres bibliothèque : en-têtes Profil / Favoris / Statut / Lecture avec icônes.
- Mobile : onglets filtres en icône + chevron ; tablette et PC : icône, libellé et chevron.
- Tablette : accordéon horizontal pour les quatre groupes principaux (comme le mobile).

## [1.2.14] - 2026-06-22

### Corrigé

- Bibliothèque (téléphone) : libellé « Ajouter » visible à côté du + (règle CSS fiche série ne masquait plus tout l'app).

## [1.2.13] - 2026-06-22

### Modifié

- Modale série (mobile) : plus de repli automatique des sections au scroll (lecture complète des champs).
- Bibliothèque (mobile) : bouton « Ajouter » avec libellé visible, pas icône seule.

## [1.2.12] - 2026-06-22

### Modifié

- Modale série (édition) : accordéon comme en création (une section ouverte à la fois) ; « Informations communes » ouverte par défaut.
- Bibliothèque : bouton « Ajouter » aligné sur les boutons d'action du bandeau (style ghost).

## [1.2.11] - 2026-06-22

### Modifié

- Modale création série : bouton « Importer .json » dans la barre d'outils (toujours visible), sans zone de texte ni Appliquer.
- Création série : accordéon (une section ouverte à la fois) ; « Informations communes » ouverte par défaut.
- Userscript Nautiljon 1.15.2 : export JSON par téléchargement direct (plus de copie presse-papiers).

## [1.2.10] - 2026-06-22

### Modifié

- Modale série (mobile / tablette) : sections du haut repliées par défaut, repli auto au scroll si masquées.
- En-têtes de sections épinglés dans la modale ; sections repliées plus compactes.
- Scroll tactile : marges de scroll sur pages et modales pour éviter le contenu sous les barres fixes.

### Ajouté

- Hook `useAutoCollapseWhenObscured` pour les sections réductibles.

## [1.2.9] - 2026-06-22

### Modifié

- Modales série et tome (téléphone) : layout une colonne, couvertures réduites.
- Section Suivi et édition (tablette) : blocs tomes puis chapitres empilés ; champs en deux colonnes à l'intérieur.

### Ajouté

- Détection téléphone tactile (`touch-phone-layout`) distincte de la tablette.

## [1.2.8] - 2026-06-21

### Corrigé

- Détection tablette tactile : plus petit côté d'écran (Galaxy Tab vs S24), plus la largeur viewport.
- Layout tablette (finances, tomes, suivi) : classes explicites et priorité CSS sur le mode desktop une ligne.

## [1.2.7] - 2026-06-21

### Modifié

- Layout tablette tactile : détection via `touch-tablet-layout` (Galaxy Tab, viewport ≥ 768 px).
- Tableau de bord et fiche série : cartes financières sur deux lignes (totaux puis comptes).
- Modale tome et section Tomes : achat physique et Mihon côte à côte, label au-dessus.
- Section Suivi et édition : suivi tomes et chapitres en deux colonnes.

## [1.2.6] - 2026-06-21

### Modifié

- Filtres bibliothèque tablette : tri et épingle sur la ligne de recherche (comme PC).
- Modale d'aide filtres : présentation par appareil et précisions tri / statut / Ma lecture.
- Tableau de bord tablette : récap financier sur deux lignes (valeur catalogue + total dépensé, puis comptes).

## [1.2.5] - 2026-06-21

### Modifié

- Filtres bibliothèque mobile : accordéons dynamiques (Compte / Favoris / Statut / Ma lecture, puis Démographie / Genres).
- Filtres bibliothèque tablette : accordéon uniquement pour Démographie et Genres & thèmes.

## [1.2.4] - 2026-06-21

### Modifié

- Filtres bibliothèque mobile / tablette : labels au-dessus des pastilles (pleine largeur).

## [1.2.3] - 2026-06-21

Release consolidée (desktop Windows + APK Android).

### Ajouté

- Modale d'aide contextuelle sur le formulaire série (hors-série, éditions, achat / Mihon).
- Pagination bibliothèque adaptative selon la plateforme et la largeur (24 / 25 / 30 séries).

### Modifié

- Filtres bibliothèque : grille 4 colonnes sur PC (fenêtre réduite et plein écran).
- Mobile / tablette Tauri : barre recherche seule ; tri et filtres dans le tiroir.
- Détection tactile via la plateforme (`isMobileRuntime`), plus via la largeur viewport.
- Compteur de pagination sous la barre de recherche sur PC.
- Démographie : pastilles sur plusieurs lignes.
- Modale série : couverture responsive ; bouton aide dans l'en-tête.
- Pastilles Mihon : nom seul quand le label est déjà affiché.
- Modale tome : suppression via la ligne tome ; bouton « Dupliquer en Collector » compact.

### Corrigé

- Pastilles « Ma lecture » : style outline et alignement sur PC réduit.

## [1.2.2] - 2026-06-21

### Modifié

- Filtres bibliothèque : grille 4 colonnes identique sur PC (fenêtre réduite et plein écran).
- Mobile / tablette Tauri : barre recherche seule ; tri et filtres dans le tiroir.
- Détection tactile via la plateforme (`isMobileRuntime`), plus via la largeur viewport.
- Compteur de pagination sous la barre de recherche sur PC.
- Démographie : pastilles sur plusieurs lignes (plus de défilement horizontal).

### Corrigé

- Pastilles « Ma lecture » : style outline et alignement (plus d'étirement vertical sur PC réduit).

## [1.2.1] - 2026-06-21

### Ajouté

- Modale d'aide contextuelle sur le formulaire série (hors-série, éditions, achat / Mihon).
- Pagination bibliothèque adaptative selon la taille d'écran (24 / 25 / 30 séries).

### Modifié

- Filtres bibliothèque desktop : grille labellisée (Compte, Favoris, Statut, etc.).
- Modale série : couverture responsive tablette / mobile ; bouton aide dans l'en-tête.
- Pastilles Mihon : nom seul quand le label « Mihon » est déjà affiché.
- Modale tome : suppression via la ligne tome ; bouton « Dupliquer en Collector » compact.

## [1.2.0] - 2026-06-21

### Modifié

- Fiche détail : synopsis sous l'image (desktop, tablette, mobile), métadonnées labellisées (Éditeur, Parution, Possédés).
- Contraste visuel labels / valeurs sur la fiche série et le synopsis.
- Modale tome : vignettes réduites sur mobile et tablette ; collector uniquement via « Dupliquer en Collector » dans la modale.
- Userscript Nautiljon 1.15.1 : export JSON tablette (GM_download), styles alignés mobile.

### Ajouté

- Suppression d'un tome depuis la modale d'édition (justification + restauration journal).
- Segments stats `buildWorkStatsSegments` pour l'affichage structuré des compteurs.

## [1.1.54] - 2026-06-21

### Modifié

- Fiche détail tablette (641–1023 px) : synopsis sous la grille couverture + infos, couverture sans étirement.

## [1.1.53] - 2026-06-21

### Corrigé

- Progression « Ma lecture » : seuls les tomes possédés (achat physique ou Mihon) comptent dans le total et le statut Terminée.
- Fiche détail : bouton « Marquer lu » réservé aux tomes possédés.

### Ajouté

- Utilitaire `volumeOwnership` pour le filtrage des tomes suivis en lecture.

## [1.1.52] - 2026-06-21

### Corrigé

- Bibliothèque : saisie recherche réactive (brouillon local + filtre différé 300 ms) — plus de lag à chaque touche sur mobile.

### Modifié

- Android : bouton Quitter ferme l'Activity proprement (`destroy`) au lieu de `exit(0)`.
- Mises à jour : vérif au retour au premier plan et toutes les heures ; version ignorée mémorisée en localStorage.

### Ajouté

- Hook `useDebouncedSearchCommit` pour la recherche bibliothèque.

## [1.1.51] - 2026-06-21

### Modifié

- Navigation : actions en style ghost (icônes 18 px, sans cadre), barre grise sous les onglets supprimée.
- Fiche détail : boutons d'en-tête et section tomes alignés sur le même style discret.
- Filtres mobile (bibliothèque et journal) : défilement de la page bloqué tant que le tiroir est ouvert.

### Ajouté

- Composant CSS partagé `ghost-action-btn` et hook `useAppMainScrollLock`.

## [1.1.50] - 2026-06-18

### Corrigé

- Import direct Nautiljon : vérification doublon avant création (plus de série ajoutée puis modale « déjà existante »).
- Double traitement du même envoi HTTP (événement + file pending) supprimé.
- Modale fusion masquée si la fiche est déjà identique à l'import.

## [1.1.49] - 2026-06-18

### Ajouté

- Import Nautiljon : fusion proposée si la série existe déjà en bibliothèque.
- Modale d'aperçu avant / après (métadonnées et tomes) avant mise à jour.
- Import direct : ouverture de la modale de fusion au lieu d'échouer silencieusement.

### Modifié

- Import JSON et envoi + contrôle app : plus de blocage sur doublon de titre.

## [1.1.48] - 2026-06-18

### Ajouté

- Userscript Nautiljon v1.15.0 : toggle « Partagé » global et par tome, cartes tomes sur mobile.
- Import JSON : champ `sharedPurchase` par tome dans le payload Tampermonkey.

### Modifié

- Tableau de bord : clic carte propriétaire → bibliothèque (présent + Mihon exclu).
- Filtre Mihon « sans Mihon » cumulable avec un filtre propriétaire actif.
- Pastilles propriétaires du userscript alignées sur l'app (cadre coloré / actif blanc).

## [1.1.47] - 2026-06-18

### Ajouté

- Co-achat partagé par tome : toggle « Partagé » (coût divisé vs chacun paie le prix plein).
- Migrations SQL `20260618150000_volume_owner_copy_count.sql` et `20260618160000_volume_shared_purchase.sql`.
- Filtres bibliothèque : niveau 2 propriétaire (nom rouge) et Mihon exclu (nom barré).

### Modifié

- Finances : logique simplifiée sans sélecteur d'exemplaires (second exemplaire = autre édition).
- Pastilles colorées unifiées dans toute l'app (inactif cadre, actif fond + blanc).
- Aide bibliothèque : couleur Mihon corrigée (cyan), libellés filtres clarifiés.
- Statut VF : ordre Terminée puis Abandonnée, aligné sur « Ma lecture ».

## [1.1.46] - 2026-06-18

### Modifié

- Modale série : section « Suivi et édition » en deux blocs (tomes / chapitres) avec toggles.
- Éditeur VF et format dédiés au suivi chapitres (`publisher_vf_chapter`, `chapter_price_format`).
- Barre achat/Mihon déplacée dans la zone scrollable de la liste tomes.
- Scrollbars modale et liste tomes alignées sur le thème app (`app-scroll-themed`).

### Ajouté

- Migration SQL `20260618140000_work_chapter_publisher_format.sql`.
- Import Tampermonkey : champs `chapterPublisherVf` et `chapterPriceFormat` en mode hybride.

## [1.1.45] - 2026-06-18

### Ajouté

- Suivi hybride tomes + chapitres sur une seule fiche (compteurs VF/VO séparés).
- Migration SQL : `chapters_vf_count`, `has_volume_tracking`, `has_chapter_tracking`.
- Barre « Ma lecture » hybride : badge commun, compteurs et actions par bloc.
- Modale série : cases tomes / chapitres activables indépendamment.
- Userscript : payload hybride unique quand tomes et chapitres sont cochés.

### Modifié

- Chapitres considérés numériques / Mihon uniquement (sans coût d'achat par chapitre).
- Import JSON et services bibliothèque adaptés au profil hybride.

### Supprimé

- Série jumelle chapitres (`chapterSisterWork`) remplacée par le suivi hybride.

## [1.1.38] - 2026-06-17

### Corrigé

- Bibliothèque mobile : compteur de résultats visible sous la barre de recherche.
- Retour bibliothèque : restauration de la page et du scroll après ouverture d'une fiche.

## [1.1.37] - 2026-06-17

### Modifié

- Bibliothèque mobile : seule la barre de recherche reste visible par défaut.
- Bibliothèque mobile : tri, propriétaire, favoris et filtres avancés dans le tiroir repliable.

## [1.1.36] - 2026-06-17

### Modifié

- Bibliothèque mobile : Ma lecture et Statut dans la barre réduite (toujours visible).
- Bibliothèque mobile : tiroir repliable limité à démographie et genres.

## [1.1.35] - 2026-06-17

### Corrigé

- Bibliothèque mobile : filtres Propriétaire et Favoris empilés verticalement (comme desktop).
- Bibliothèque mobile : Ma lecture et Statut empilés dans le tiroir de filtres.

## [1.1.34] - 2026-06-17

### Ajouté

- Tomes Simple et Collector : unicité par édition, duplication depuis fiche détail, modale et formulaire série.
- Favoris fiche détail : bouton « Favoris ★ » dans le header (compte lié uniquement).
- Bibliothèque mobile : filtres favoris toujours visibles (tous les comptes).
- Userscript Nautiljon v1.14.8 : layout mobile empilé, panneau réductible, Mihon + achat cumulables, conflits par édition.
- Migration : unicité `(work_id, volume_number, edition_type)`.

### Corrigé

- Favoris : seul le propriétaire lié au compte peut basculer son favori (UI + service).
- Suppression série : justification minimum 4 caractères (au lieu de 10).

### Modifié

- Pagination bibliothèque : contrôles `<< < Page X/Y >> >`.
- Ligne tome formulaire : édition et actions sur la 2e ligne.
- Filtres bibliothèque mobile : favoris à côté des propriétaires.

## [1.1.33] - 2026-06-16

### Ajouté

- Bibliothèque : favoris par propriétaire (étoile, filtre, barre fiche détail).
- Journal : liaison propriétaire ↔ compte Supabase (section repliée).
- Journal : lignes compactes, auteurs avec pastilles, filtre auteur Nautiljon.
- Cache local IndexedDB + affichage immédiat (bibliothèque, tableau de bord).
- Overlay de chargement centré sur toutes les pages.
- Pagination bibliothèque (25 séries) avec restauration page et scroll.
- Migrations : `has_purchase` (Mihon + achat physique), favoris, retrait `purchase_date`.

### Corrigé

- Filtres propriétaire bibliothèque (requêtes PostgREST par lots).
- Valeur catalogue : tomes sans propriétaire exclus ; règles Mihon / co-achat alignées.
- Mihon + achat physique sur un même tome (coût non Mihon).
- Filtre auteur journal : masque Nautiljon sauf si sélectionné.

### Modifié

- Filtres bibliothèque version réduite (breakpoint 1024 px).
- Tableau de bord : snapshot financier unique, retrait graphique récap achats.
- Userscript Nautiljon v1.14.7 (retrait date d'achat).
- Cache images Android (blob URL mémoire).

## [1.1.32] - 2026-06-16

### Modifié

- Bump de version : synchronisation de tous les fichiers de configuration après release v1.1.31.

## [1.1.31] - 2026-06-16

### Ajouté

- Userscript Nautiljon v1.13.0 : interface mobile refaite (bottom sheet, touch targets ≥ 44 px, CSS responsive).
- Userscript : boutons « Envoi + contrôle app » et « Envoi direct » masqués sur Firefox Android (nécessitent le serveur local 127.0.0.1 indisponible sur mobile).
- Userscript : bouton « Télécharger JSON » sur mobile — copie presse-papiers + téléchargement de fichier simultanés.
- Import JSON dans l'app : bouton « Fichier .json » désormais disponible en vue mobile compacte pour charger un fichier téléchargé depuis le script.

## [1.1.30] - 2026-06-15

### Corrigé

- Mobile : chargement des propriétaires de tomes par lots Supabase pour éviter les erreurs 400 Bad Request (URL PostgREST trop longue) — bibliothèque et récap financier.

### Ajouté

- Userscript Nautiljon v1.12.1 : refactor (META_KEYS, traitement par lots), date d'achat par tome, correction métadonnées éditeur/compteurs selon l'édition sélectionnée.
- Formulaire œuvre : section dédiée Tomes/Chapitres VF ; titre de modale contextuel.
- Import Nautiljon : champ `purchaseDate` dans le payload.

### Modifié

- Formulaire œuvre : informations communes séparées des métadonnées tome/chapitre.

## [1.1.29] - 2026-06-15

### Modifié

- Vue liste mobile : couverture masquée pour libérer de l'espace.
- Vue liste mobile : mise en page 2 lignes — titre + prix entre parenthèses et badge propriétaire sur la ligne 1, dates et boutons d'action sur la ligne 2.

## [1.1.28] - 2026-06-11

### Ajouté

- Progression de lecture privée : tomes lus, chapitres (séries sans grille), série abandonnée.
- Migrations Supabase : `user_volume_reads`, `user_work_chapter_progress`, `user_work_reading_state`.
- Fiche détail : barre « Ma lecture », toggle abandonnée, vue grille/liste des tomes, édition rapide par tome.
- Bibliothèque : filtre « Ma lecture » (À lire, En cours, Terminée, Abandonnée), persistance des filtres en session.
- Bouton script Tampermonkey dans la barre de navigation globale (desktop et mobile).

### Modifié

- Navigation principale en barre d’onglets (indicateur sous l’onglet actif).
- Filtres bibliothèque : styles distincts propriétaires / Ma lecture / Statut VF ; compteur déplacé avant la recherche.
- Tableau de bord : retrait des derniers ajouts ; sous-titre du récap d’achat sous le titre.
- Cartes tomes fiche détail : mode liste compact, teinte abandonnée sur les tomes non lus.

## [1.1.27] - 2026-06-11

### Ajouté

- Graphique dépenses : filtre par année, tooltip au survol, modale détail au clic.
- Saisie de dates flexible (`4-6-26`) avec bouton calendrier natif.
- Import Nautiljon direct (sans modale de contrôle) — desktop et userscript v1.8.4.
- Zone globale d'appartenance (Achat / Mihon — tous les tomes) dans la section Tomes.
- Édition rapide d'un tome depuis la fiche détail (icône crayon + modale dédiée).
- Pastilles propriétaire contour (`Alex` / `Mihon : Alex`) via `OwnerOwnershipPill`.
- Journal d'activité : action « Modification de tome ».

### Modifié

- Appartenance tome : plus de propagation automatique depuis le tome 1.
- Userscript v1.8.4 : panneau déplaçable, fiche série éditable, envoi direct ou contrôle app.
- Filtres bibliothèque et légende pastilles alignés sur le style contour discret.
- Formulaire tome : hauteur uniforme des champs (input, select, date).

## [1.1.26] - 2026-06-11

### Ajouté

- Numéros de tome décimaux (ex. 1.5 entre le tome 1 et 2) — app, planning et userscript v1.7.1.
- Migration Supabase `volume_number` en `NUMERIC(6, 2)`.

### Modifié

- Formulaire tome : saisie du N° avec pas de 0.1.
- Parsing Nautiljon : URLs `volume-vol.+1.5` et libellés « Vol. 1.5 ».

## [1.1.25] - 2026-06-11

### Ajouté

- Champ prix (€) par tome dans le formulaire œuvre et affichage sur la fiche détail.
- Userscript v1.7.0 : tableau tomes (date VF, prix modifiable), présélection des VF parus uniquement.

### Modifié

- Pastilles appartenance compactes (« Achat : … » / « Mihon : … ») sans doublon de nom.
- Top 3 tableau de bord : libellé unique « Valeur série (Mihon déduit) ».
- Import Nautiljon : correction appartenance (achat co-propriété et Mihon) côté app et script.
- Userscript : date de parution VF (plus la VO) sur les fiches tome.

## [1.1.24] - 2026-06-11

### Ajouté

- Suivi par chapitres pour les webtoons (`tracking_unit` : volume ou chapitre).
- Migration Supabase `works.tracking_unit`.
- Import appartenance depuis Nautiljon : achat (Céline, Sébastien, Alexandre, co-propriété) et Mihon.
- Userscript v1.6.4 : overlay chapitres/tomes VF, appartenance, file d’imports multiples desktop.
- Import JSON mobile : `ownerNames` et `mihonOwnerName`.
- Badge appartenance sur fiche détail (tomes sous titre, chapitres en section dédiée).
- Ligne unique « Série numérique » pour les chapitres (plus de grille 1…200).

### Modifié

- Formulaire œuvre et statistiques adaptés au mode chapitre.
- Serveur import desktop : file d’attente des payloads en attente.

## [1.1.23] - 2026-06-11

### Modifié

- Top 3 dépenses : classement sur dépenses réelles (Mihon exclu).
- Tableau de bord en page d'accueil par défaut (`#/` ; bibliothèque → `#/library`).
- Filtres bibliothèque mobile : bouton reset sur la ligne recherche.

## [1.1.22] - 2026-06-13

### Ajouté

- Tri bibliothèque par défaut enregistrable par compte (Supabase).
- Persistance position/taille fenêtre sur desktop.
- Filtre Mihon en trois états (afficher / masquer / tout).

### Modifié

- Filtres bibliothèque : barre desktop compacte, section repliable mobile.
- Journal : retrait du bouton « haut » mobile dans la barre de filtres.

## [1.1.21] - 2026-06-13

### Corrigé

- Cloche mobile : bottom sheet plus compacte, bouton fermer et tap sur le fond.

## [1.1.20] - 2026-06-13

### Modifié

- Sync planning Nautiljon réservée au desktop ; encart informatif sur mobile.
- Cloche mobile : panneau en plein écran (portal) pour éviter le débordement.

### Supprimé

- Code mort mobile (HTTP Rust, WebView de repli, fetch navigateur).

## [1.1.19] - 2026-06-13

### Corrigé

- Android : sync planning — HTTP avec UA réel puis repli WebView si 403 ; plus de sync auto au lancement mobile.

## [1.1.18] - 2026-06-13

### Corrigé

- Build Android CI : annotation de type explicite dans `nautiljon_fetch.rs`.

## [1.1.17] - 2026-06-13

### Corrigé

- Android : sync planning Nautiljon via HTTP Rust (le fetch JS échouait avec « Failed to fetch » / CORS).

## [1.1.16] - 2026-06-11

### Modifié

- Import Tampermonkey **v1.5.9** : toutes les éditions volumes (VF/VO/sans drapeau), VF présélectionnée si présente.

## [1.1.15] - 2026-06-11

### Ajouté

- Import Tampermonkey **v1.5.8** : prix catalogue par tome (fiche Nautiljon), pour fanbooks, spéciaux et collectors.

### Corrigé

- Android : la sync planning n'ouvre plus Nautiljon en plein écran (fetch JS au lieu de WebView Rust).

## [1.1.14] - 2026-06-11

### Corrigé

- Build Android : `skip_taskbar` réservé au desktop (API absente sur mobile).

## [1.1.13] - 2026-06-11

### Corrigé

- Build Android CI : WebView planning (`focused` retiré, callback `eval_with_callback` typé).

## [1.1.12] - 2026-06-11

### Ajouté

- Sync planning Nautiljon via **WebView** dans l'app (auto 24 h + bouton cloche).
- Import Tampermonkey **v1.5.7** : sélection tome par tome, conflits Simple/Collector/Spécial, fetch parallèle + rattrapage 429, chrono et récap.
- Tomes **hors-série** (`volume_label`, numéro nullable) et champ libellé dans l'app.

### Modifié

- Cloche notifications planning : badge « Maj » et journal après migration RLS.

### Supprimé

- Workflow GitHub Actions `planning-sync` (Nautiljon bloque les IP datacenter).

### Notes release

- Migrations Supabase à appliquer : `20260613110000`, `20260613120000`, `20260613130000`.

## [1.1.11] - 2026-06-12

### Corrigé

- Zone safe area Android : suppression du double padding (bande noire inutile au-dessus de la barre système).

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
