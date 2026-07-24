import { usePlanningSync } from "@/hooks/usePlanningSync";

/**
 * @description Déclenche la sync planning auto (desktop, 1×/24 h) sans UI.
 */
export function PlanningSyncBootstrap() {
  usePlanningSync();
  return null;
}
