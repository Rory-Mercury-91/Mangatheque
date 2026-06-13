import { useCallback, useEffect, useState } from "react";
import { registerSupabaseSyncListener } from "@/services/supabaseSyncHub";
import {
  fetchPlanningNotifications,
  fetchUnreadPlanningCount,
  markPlanningNotificationsSeen,
  type PlanningNotification,
} from "@/services/planningNotificationService";

/**
 * @description Notifications planning Nautiljon (cloche + badge).
 */
export function usePlanningNotifications() {
  const [notifications, setNotifications] = useState<PlanningNotification[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([
        fetchPlanningNotifications(),
        fetchUnreadPlanningCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count);
    } catch (error) {
      console.error(
        "Notifications planning :",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return registerSupabaseSyncListener(() => {
      void reload();
    });
  }, [reload]);

  const markAllSeen = useCallback(async () => {
    try {
      await markPlanningNotificationsSeen();
      setUnreadCount(0);
    } catch (error) {
      console.error(
        "Notifications planning :",
        error instanceof Error ? error.message : error,
      );
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    reload,
    markAllSeen,
  };
}
