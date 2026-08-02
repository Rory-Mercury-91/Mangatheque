/**
 * @description Options de rafraîchissement déclenché par le hub catalogue Supabase.
 */
export type SyncReloadOptions = {
  /** Ne pas afficher l'état de chargement (sync auto / manuelle / écriture). */
  silent?: boolean;
};
