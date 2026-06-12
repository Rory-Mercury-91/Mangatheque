import type { WorkReadingStatus } from "@/types/database";

/** Tri disponible dans la bibliothèque. */
export type LibrarySortKey =
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "title_asc"
  | "title_desc";

/** Filtres actifs de la bibliothèque. */
export interface LibraryFiltersState {
  search: string;
  sort: LibrarySortKey;
  ownerIds: string[];
  mihonOnly: boolean;
  readingStatuses: WorkReadingStatus[];
  demographics: string[];
  tags: string[];
}

/** Nombre maximal de séries affichées par page dans la bibliothèque. */
export const LIBRARY_PAGE_SIZE = 50;

export const DEFAULT_LIBRARY_FILTERS: LibraryFiltersState = {
  search: "",
  sort: "created_desc",
  ownerIds: [],
  mihonOnly: false,
  readingStatuses: [],
  demographics: [],
  tags: [],
};

/** Métadonnées par œuvre pour filtrage et tri. */
export interface LibraryWorkMeta {
  catalogValue: number;
  ownerIds: string[];
  mihonOwnerIds: string[];
}
