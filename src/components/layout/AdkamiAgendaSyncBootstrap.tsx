import { useAdkamiAgendaSync } from "@/hooks/useAdkamiAgendaSync";

/**
 * @description Sync agenda ADKami une fois au lancement (différée, hors chemin critique UI).
 */
export function AdkamiAgendaSyncBootstrap() {
  useAdkamiAgendaSync();
  return null;
}
