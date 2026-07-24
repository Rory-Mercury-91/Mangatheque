# Mangathèque

Application **desktop** (Tauri 2) + **Android** pour gérer la bibliothèque manga / webtoon / light novels du foyer, et le **suivi animé** (visionnage, planning ADKami, trackers MAL / AniList).

## Stack

- Tauri 2 + React + TypeScript + Vite
- Supabase (PostgreSQL + auth)
- MyAnimeList / AniList (OAuth) · Jikan · agenda ADKami

## Démarrage local

```powershell
npm install
copy .env.example .env   # puis renseigner les clés
```

| Commande | Effet |
|----------|--------|
| `npm run dev:desktop` | App bureau Tauri (fenêtre native) |
| `npm run dev:web` | Navigateur seul → http://localhost:1420 |
| `npm run dev` | Vite seul (utilisé en interne par Tauri) |

Pour le quotidien : `npm run dev:desktop`.

### Variables d’environnement

Voir `.env.example` :

| Clé | Rôle |
|-----|------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Backend Supabase |
| `VITE_MAL_CLIENT_ID` | OAuth MyAnimeList (PKCE) |
| `VITE_ANILIST_CLIENT_ID` / `VITE_ANILIST_CLIENT_SECRET` | OAuth AniList |

Redirect OAuth à enregistrer côté trackers :

- Dev web : `http://localhost:1420/tracker-oauth.html`
- App Tauri / mobile : `mangatheque://tracker-callback`

## Navigation

| Zone | Route | Contenu |
|------|-------|---------|
| Tableau de bord | `#/` | Coûts foyer, aperçu bibliothèques |
| Bibliothèque → Lectures | `#/library/lectures` | Catalogue manga / LN |
| Bibliothèque → Animé | `#/library/anime` | Catalogue animé |
| Suivi → Lectures | `#/reading/lectures` | Stats & progression lecture |
| Suivi → Anime | `#/reading/anime` | Stats visionnage |
| Suivi → Planning | `#/reading/planning` | Agenda sorties ADKami |
| Suivi → Trackers | `#/reading/trackers` | MAL / AniList + sync |
| Journal | `#/logs` | Historique d’activité |
| Fiche manga | `#/work/:id` | Détail œuvre + tomes |
| Fiche animé | `#/anime/:id` | Détail série + streaming |

## Fonctionnalités

### Manga / light novels

- Catalogue foyer, tomes, co-achats, Mihon, favoris.
- Suivi de lecture (chapitres / tomes) par compte auth.
- Import **Nautiljon** via Tampermonkey + serveur local (port `40000`, desktop).
- Sync planning Nautiljon (WebView) : cloche « Mises à jour ».
- Trackers **MAL / AniList** : IDs, liens dynamiques, sync bidirectionnelle.

### Animé

- Catalogue enrichi MAL / Jikan (synopsis, genres, relations, saisons).
- Progression personnelle (`watching`, `completed`, etc.) + favoris.
- **Planning ADKami** : agenda, sync au lancement / ouverture de page (pas de polling), pastille « Vu » pour les épisodes déjà sortis.
- Import XML sur le planning :
  - **Mapping ADKami** (`series_adk_id` + `series_animedb_id`) → lie `adkami_id` aux fiches existantes.
  - **Export liste MAL** → crée / met à jour les séries *en cours*, *à voir*, *en pause*.
- Sync API anime (Trackers) : importe toute la liste MAL (`nsfw=true`, sinon titres « gray » manquants).
- Streaming (logos ADN, Crunchyroll, Netflix…).
- Traduction synopsis FR (bouton / auto selon contexte).

## Import Nautiljon (Tampermonkey)

1. Lancer `npm run dev:desktop` (serveur local port `40000`).
2. Installer `public/tampermonkey/Nautiljon-Mangatheque.user.js`.
3. Sur une fiche Nautiljon → **Importer dans Mangathèque**.

## Trackers (MAL / AniList)

1. Suivi → **Trackers** → connecter les comptes OAuth.
2. Renseigner MAL ID / AniList ID sur les fiches (recherche liste ou catalogue).
3. Sync manga et/ou **Sync anime** (création des fiches absentes + progression).
4. Sync auto : après OAuth, et une fois par session au démarrage.

## Planning ADKami

1. Appliquer les migrations animé / agenda (ci-dessous).
2. Avoir des fiches animé en BDD (sync MAL ou import XML liste).
3. Importer le **mapping ADKami** (XML avec `series_adk_id`) pour lier l’agenda.
4. **Actualiser** sur la page Planning si besoin (sinon sync au lancement de l’app et à l’ouverture de la page pour une semaine pas encore en cache).

Les sorties affichées sont celles **matchées** à votre catalogue (pas toute la grille ADKami « En visionnage »). Pas de rechargement périodique une fois les données affichées.

## Migrations Supabase

### Nouveau projet

Exécuter une fois dans le [SQL Editor](https://supabase.com/dashboard/project/_/sql/new) :

- `supabase/schema.sql`

### Projet déjà en place

Appliquer les fichiers manquants dans `supabase/migrations/` (ordre chronologique). Migrations animé / planning récentes :

| Fichier | Rôle |
|---------|------|
| `20260721120000_tracker_mal_anilist.sql` | Tokens trackers |
| `20260721140000_reading_progress_select_household.sql` | SELECT foyer progression lecture |
| `20260723210000_animes.sql` | Tables `animes` + `user_anime_progress` |
| `20260723220000_anime_favorites.sql` | Favoris animé |
| `20260723230000_anime_adkami_agenda.sql` | `adkami_id` + `anime_agenda_entries` |
| `20260723240000_anime_source_url.sql` | URL source |
| `20260723250000_animes_adkami_id_non_unique.sql` | Plusieurs saisons MAL ↔ même ADKami |
| `20260724260000_animes_adkami_section.sql` | Section URL ADKami (`anime` / `hentai` / …) |

## Modèle de données (aperçu)

### Œuvre manga (`works`) / tomes (`volumes`)

Titres, tags, éditeur VF, prix, possession par propriétaire (`volume_owners`), Mihon, co-achat partagé ou exemplaires distincts. Détail financier : `src/services/volumePriceService.ts`.

### Animé (`animes`)

Métadonnées MAL / Jikan, `mal_id` unique, `adkami_id` (partageable entre saisons), streaming JSON, relations.

### Progression animé (`user_anime_progress`)

Par compte auth : statut liste, épisodes vus, dates.

### Agenda (`anime_agenda_entries`)

Cache des sorties ADKami de la semaine, liées au catalogue si `matched`.

## Mises à jour automatiques

Desktop : `tauri-plugin-updater` + GitHub Releases (binaires signés).  
Android : APK via Releases (vérification de version au démarrage).

Tags sémantiques : `vX.Y.Z` → voir `CHANGELOG.md`.
