# Mangathèque

Application desktop + Android pour suivre les achats manga, webtoon et light novels du foyer (Céline, Sébastien, Alexandre).

## Stack

- Tauri 2 + React + TypeScript + Vite
- Supabase (PostgreSQL)

## Démarrage local

```powershell
npm install
copy .env.example .env   # puis renseigner les clés Supabase
```

| Commande | Effet |
|----------|--------|
| `npm run dev:desktop` | **App bureau** Tauri (fenêtre native uniquement) |
| `npm run dev:web` | Navigateur seul → http://localhost:1420 |
| `npm run dev` | Serveur Vite sans ouvrir de fenêtre (utilisé par Tauri en interne) |

Pour le quotidien, préfère `npm run dev:desktop`.

## Import Nautiljon (Tampermonkey)

1. Lancer **Mangathèque en mode bureau** (`npm run dev:desktop`) — le serveur local écoute sur le port `40000`.
2. Installer le script `public/tampermonkey/Nautiljon-Mangatheque.user.js` dans Tampermonkey.
3. Sur une fiche Nautiljon, cliquer **Importer dans Mangathèque** — la modale s'ouvre pré-remplie pour validation.

## Migrations Supabase

Pour un **nouveau projet** Supabase, exécuter une seule fois dans le [SQL Editor](https://supabase.com/dashboard/project/_/sql/new) :

- `supabase/schema.sql`

Pour un projet **déjà en place**, appliquer aussi :

- `supabase/migrations/20260613100000_planning_sync.sql`
- `supabase/migrations/20260613110000_profiles_planning_seen_rls.sql`

### Sync planning Nautiljon (app Tauri)

Nautiljon bloque les requêtes HTTP automatisées (Edge Functions, GitHub Actions, scripts Node). La sync passe par une **WebView cachée** dans l'app **bureau ou Android** :

- **Automatique** : au lancement, max 1× par 24 h.
- **Manuelle** : cloche « Mises à jour » → bouton synchroniser.

Test local :

```powershell
npm run dev:desktop
```

Puis ouvrir la cloche et lancer la synchronisation.

## Navigation

| Page | Route |
|------|--------|
| Tableau de bord (coûts, derniers ajouts) | `#/` |
| Bibliothèque | `#/library` |
| Journal (suppressions…) | `#/logs` |
| Fiche œuvre | `#/work/:id` |

## Modèle de données

### Œuvre (`works`)

| Champ | Description |
|-------|-------------|
| `title` | Titre VF ou commercialisé en France |
| `demographic_type` | Genre démographique (shonen, seinen…) |
| `genres`, `themes` | Listes affichées en badges |
| `publisher_vf` | Éditeur français |
| `volumes_vf_count` / `volumes_vo_total` | Tomes VF parus / total VO |
| `default_price` | Prix par défaut (broché ou numérique) |
| `price_format` | `broche` ou `numerique` |
| `synopsis`, `cover_url` | Fiche œuvre |

### Tome (`volumes`)

| Champ | Description |
|-------|-------------|
| `volume_number` | Numéro du tome |
| `cover_url` | Couverture du tome |
| `release_date`, `purchase_date` | Sortie et achat |
| `purchase_price` | Prix manuel (si override) |
| `price_manual_override` | Exclut le tome des mises à jour de prix œuvre |
| `edition_type` | `classic` ou `collector` |

### Propriétaires par tome (`volume_owners`)

- **Achat solo** : un propriétaire paie le prix entier du tome.
- **Co-achat** : prix ÷ nombre de propriétaires (ex. 10 € / 3 ≈ 3,33 € chacun).
- **Mihon** (`has_mihon` + propriétaire choisi) : indique **sur quel compte Mihon** le tome a été téléchargé (Céline, Sébastien ou Alexandre). 0 € dépensé, économie = prix du tome. Un tome est soit acheté, soit sur Mihon — pas les deux.

### Exemple financier (5 tomes à 10 €)

| Tome | Répartition | Dépensé | Économie Mihon |
|------|-------------|---------|----------------|
| 1 | Sébastien seul | 10 € | — |
| 2 | Céline seule | 10 € | — |
| 3 | Alexandre seul | 10 € | — |
| 4 | Mihon (1 personne) | 0 € | 10 € |
| 5 | Co-achat × 3 | 10 € (3,33 € / pers.) | — |

- **Valeur catalogue** : 50 €
- **Coût total dépensé** : 40 €
- **Économie Mihon** : 10 €
- **Coût par personne** : 13,33 € (10 € solo + 3,33 € part commune)

Logique implémentée dans `src/services/volumePriceService.ts`.

## Mises à jour automatiques

Configurées via `tauri-plugin-updater` + GitHub Releases (clé minisign à générer).
