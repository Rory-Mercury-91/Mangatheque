import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { fetchOwners } from "@/services/ownerService";
import type { Owner } from "@/types/database";

type OwnersContextValue = {
  owners: Owner[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
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

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOwners(await fetchOwners());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSupabaseSync(reload);

  const value = useMemo(
    () => ({ owners, loading, error, reload }),
    [owners, loading, error, reload],
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
