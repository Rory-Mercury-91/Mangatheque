import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { FinancialSummary } from "@/components/common/FinancialSummary";
import { useOwners } from "@/hooks/useOwners";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import {
  fetchGlobalFinancials,
  fetchRecentAdditions,
  type GlobalFinancials,
  type RecentAddition,
} from "@/services/financialService";
import { fetchWorks } from "@/services/workService";
import type { Work } from "@/types/database";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./DashboardPage.css";

/**
 * @description Tableau de bord : coûts globaux et dernières ajouts.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { owners } = useOwners();

  const [financials, setFinancials] = useState<GlobalFinancials | null>(null);
  const [recent, setRecent] = useState<RecentAddition[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (owners.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [fin, rec, allWorks] = await Promise.all([
        fetchGlobalFinancials(owners),
        fetchRecentAdditions(),
        fetchWorks(),
      ]);
      setFinancials(fin);
      setRecent(rec);
      setWorks(allWorks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [owners]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupabaseSync(load);

  if (loading) {
    return (
      <main className="dashboard-page">
        <p className="dashboard-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement du tableau de bord…
        </p>
      </main>
    );
  }

  if (error || !financials) {
    return (
      <main className="dashboard-page">
        <p className="dashboard-error">{error ?? "Données indisponibles."}</p>
      </main>
    );
  }

  const workById = new Map(works.map((w) => [w.id, w]));

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Tableau de bord</h1>
        <p className="dashboard-subtitle">
          {works.length} œuvre{works.length > 1 ? "s" : ""} dans la collection
        </p>
      </header>

      <section className="dashboard-section">
        <h2>Récapitulatif financier</h2>
        <FinancialSummary financials={financials} />
      </section>

      <section className="dashboard-section">
        <h2>Derniers ajouts</h2>
        {recent.length === 0 ? (
          <p className="dashboard-empty">Aucun ajout récent.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((item) => {
              const work = workById.get(item.workId);
              return (
                <li key={`${item.kind}-${item.createdAt}`}>
                  <button
                    type="button"
                    className="recent-item"
                    onClick={() => navigate(`/work/${item.workId}`)}
                  >
                    {work?.cover_url && (
                      <div className="recent-cover">
                        <CoverImage url={work.cover_url} alt={item.title} />
                      </div>
                    )}
                    <div className="recent-text">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <time dateTime={item.createdAt}>
                        {formatDateTimeFr(item.createdAt)}
                      </time>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
