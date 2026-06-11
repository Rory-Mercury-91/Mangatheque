import { useEffect, useRef } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

const SYNC_TABLES = ["owners", "works", "volumes", "volume_owners"] as const;
const DEBOUNCE_MS = 400;
const POLL_MS = 45_000;

/**
 * @description Recharge les données quand Supabase ou le focus fenêtre signalent un changement.
 * @param onReload - Callback de rafraîchissement (owners, works, etc.).
 */
export function useSupabaseSync(onReload: () => void | Promise<void>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  useEffect(() => {
    const scheduleReload = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void reloadRef.current();
      }, DEBOUNCE_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleReload();
      }
    };

    window.addEventListener("focus", scheduleReload);
    document.addEventListener("visibilitychange", onVisible);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        scheduleReload();
      }
    }, POLL_MS);

    let channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null =
      null;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      channel = supabase.channel("mangatheque-data-sync");

      for (const table of SYNC_TABLES) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          scheduleReload,
        );
      }

      void channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          scheduleReload();
        }
      });
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      window.removeEventListener("focus", scheduleReload);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
      if (channel && isSupabaseConfigured()) {
        void getSupabaseClient().removeChannel(channel);
      }
    };
  }, []);
}
