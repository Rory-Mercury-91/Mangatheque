import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FinancialSummary } from "@/components/common/FinancialSummary";
import { PurchaseRecapChart } from "@/features/dashboard/PurchaseRecapChart";
import { RecentAdditionsCarousel } from "@/features/dashboard/RecentAdditionsCarousel";
import { TopExpensiveWorks } from "@/features/dashboard/TopExpensiveWorks";
import { useOwners } from "@/hooks/useOwners";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import {
  fetchGlobalFinancials,
  fetchPurchaseRecap,
  fetchRecentAdditions,
  fetchTopExpensiveWorks,
  type GlobalFinancials,
  type PurchaseRecapPeriod,
  type RecentAddition,
  type TopExpensiveWork,
} from "@/services/financialService";
import { fetchWorks } from "@/services/workService";
import type { Work } from "@/types/database";
import type { SyncReloadOptions } from "@/types/sync";
import { isSameData, setIfChanged } from "@/utils/stateSync";
import "./DashboardPage.css";

/**
 * @description Tableau de bord : coûts globaux, derniers ajouts et top dépenses.
 */
export function DashboardPage() {
  const { owners } = useOwners();

  const [financials, setFinancials] = useState<GlobalFinancials | null>(null);
  const [recent, setRecent] = useState<RecentAddition[]>([]);
  const [topExpensive, setTopExpensive] = useState<TopExpensiveWork[]>([]);
  const [purchaseRecap, setPurchaseRecap] = useState<PurchaseRecapPeriod[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: SyncReloadOptions) => {
    if (owners.length === 0) {
      return;
    }

    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [fin, rec, top, recap, allWorks] = await Promise.all([
        fetchGlobalFinancials(owners),
        fetchRecentAdditions(10),
        fetchTopExpensiveWorks(3),
        fetchPurchaseRecap(),
        fetchWorks(),
      ]);
      setFinancials((previous) =>
        isSameData(previous, fin) ? previous : fin,
      );
      setIfChanged(setRecent, rec);
      setIfChanged(setTopExpensive, top);
      setIfChanged(setPurchaseRecap, recap);
      setIfChanged(setWorks, allWorks);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
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

  const workById = new Map(works.map((work) => [work.id, work]));

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Tableau de bord</h1>
      </header>

      <section className="dashboard-section">
        <h2>Récapitulatif financier</h2>
        <FinancialSummary financials={financials} workCount={works.length} />
      </section>

      <section className="dashboard-section">
        <h2>Récap d&apos;achat</h2>
        <p className="dashboard-section-hint">
          Dépenses par mois selon la date d&apos;achat renseignée sur chaque
          tome.
        </p>
        <PurchaseRecapChart periods={purchaseRecap} />
      </section>

      <section className="dashboard-section">
        <h2>Derniers ajouts</h2>
        <RecentAdditionsCarousel items={recent} worksById={workById} />
      </section>

      <section className="dashboard-section">
        <h2>Top dépense</h2>
        <p className="dashboard-section-hint">
          Les 3 séries au coût catalogue le plus élevé.
        </p>
        <TopExpensiveWorks items={topExpensive} worksById={workById} />
      </section>
    </main>
  );
}
