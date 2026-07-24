import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * @description Fournit la session Supabase à toute l'application.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  const refreshSession = useCallback(async () => {
    if (!configured) {
      setSession(null);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    void refreshSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [configured, refreshSession]);

  // Sync auto trackers une fois la session prête (une fois / session)
  useEffect(() => {
    if (!configured || loading || !session?.user) {
      return;
    }
    void import("@/services/tracker/trackerAutoSync")
      .then(({ runTrackerAutoSyncOncePerSession }) =>
        runTrackerAutoSyncOncePerSession(),
      )
      .then((summary) => {
        if (!summary) return;
        if (summary.seriesUpdated > 0) {
          console.info(
            `Sync trackers auto : ${summary.seriesUpdated} série(s) mise(s) à jour.`,
          );
        }
        if (summary.animesUpdated > 0) {
          console.info(
            `Sync anime MAL auto : ${summary.animesUpdated} fiche(s) / suivi(s) mis à jour.`,
          );
        }
      })
      .catch((error) => {
        console.warn("Sync trackers auto impossible :", error);
      });
  }, [configured, loading, session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured,
      refreshSession,
    }),
    [session, loading, configured, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * @description Accès au contexte d'authentification.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return ctx;
}
