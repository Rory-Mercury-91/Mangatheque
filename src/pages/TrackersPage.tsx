import { TrackersPanel } from "@/features/tracker/TrackersPanel";
import { NautiljonUpdatesSection } from "@/features/tracker/NautiljonUpdatesSection";
import "@/pages/ReadingStatsPage.css";

/**
 * @description Page Trackers (sous-onglet Suivi) + mises à jour Nautiljon.
 */
export function TrackersPage() {
  return (
    <div className="reading-stats-page">
      <header className="reading-stats-header">
        <h1>Trackers</h1>
      </header>
      <TrackersPanel />
      <NautiljonUpdatesSection />
    </div>
  );
}
