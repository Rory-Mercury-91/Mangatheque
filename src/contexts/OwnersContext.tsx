import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { useStaleWhileRevalidate } from "@/hooks/useStaleWhileRevalidate";
import { LOCAL_CACHE_KEYS } from "@/services/localDataCache";
import { fetchOwners } from "@/services/ownerService";
import type { Owner } from "@/types/database";
import type { SyncReloadOptions } from "@/types/sync";

type OwnersContextValue = {
  owners: Owner[];
  loading: boolean;
  error: string | null;
  reload: (options?: SyncReloadOptions) => Promise<void>;
};

const OwnersContext = createContext<OwnersContextValue | null>(null);

type OwnersProviderProps = {
  children: ReactNode;
};

/**
 * @description Fournit la liste des propriétaires à toute l'application.
 */
export function OwnersProvider({ children }: OwnersProviderProps) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useStaleWhileRevalidate({
    cacheKey: LOCAL_CACHE_KEYS.owners,
    fetchFn: fetchOwners,
    setData: setOwners,
    setLoading,
    setError,
  });

  useSupabaseSync(reload);

  const stableReload = useCallback(
    (options?: SyncReloadOptions) => reload(options),
    [reload],
  );

  const value = useMemo(
    () => ({ owners, loading, error, reload: stableReload }),
    [owners, loading, error, stableReload],
  );

  return (
    <OwnersContext.Provider value={value}>{children}</OwnersContext.Provider>
  );
}

/**
 * @description Accès aux propriétaires du foyer.
 */
export function useOwners(): OwnersContextValue {
  const ctx = useContext(OwnersContext);
  if (!ctx) {
    throw new Error("useOwners doit être utilisé dans OwnersProvider.");
  }
  return ctx;
}
