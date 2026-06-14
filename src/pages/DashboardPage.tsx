import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FinancialSummary } from "@/components/common/FinancialSummary";
import { PurchaseRecapChart } from "@/features/dashboard/PurchaseRecapChart";
import { TopExpensiveWorks } from "@/features/dashboard/TopExpensiveWorks";
import { useOwners } from "@/hooks/useOwners";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import {
  fetchGlobalFinancials,
  fetchPurchaseRecap,
  fetchTopExpensiveWorks,
  type GlobalFinancials,
  type PurchaseRecapPeriod,
  type TopExpensiveWork,
} from "@/services/financialService";
import { fetchWorks } from "@/services/workService";
import type { Work } from "@/types/database";
import type { SyncReloadOptions } from "@/types/sync";
import { isSameData, setIfChanged } from "@/utils/stateSync";
import "./DashboardPage.css";

/**
 * @description Tableau de bord : coûts globaux, récap d'achat et top dépenses.
 */
export function DashboardPage() {
  const { owners } = useOwners();

  const [financials, setFinancials] = useState<GlobalFinancials | null>(null);
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
      const [fin, top, recap, allWorks] = await Promise.all([
        fetchGlobalFinancials(owners),
        fetchTopExpensiveWorks(3),
        fetchPurchaseRecap(),
        fetchWorks(),
      ]);
      setFinancials((previous) =>
        isSameData(previous, fin) ? previous : fin,
      );
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
      <div className="dashboard-page">
        <header className="dashboard-header">
          <h1>Tableau de bord</h1>
        </header>
        <p className="dashboard-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement du tableau de bord…
        </p>
      </div>
    );
  }

  if (error || !financials) {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <h1>Tableau de bord</h1>
        </header>
        <p className="dashboard-error">{error ?? "Données indisponibles."}</p>
      </div>
    );
  }

  const workById = new Map(works.map((work) => [work.id, work]));

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>Tableau de bord</h1>
      </header>

      <section className="dashboard-section">
        <h2>Récapitulatif financier</h2>
        <FinancialSummary financials={financials} workCount={works.length} />
      </section>

      <section className="dashboard-section">
        <h2>Récap d&apos;achat</h2>
        <PurchaseRecapChart periods={purchaseRecap} />
      </section>

      <section className="dashboard-section">
        <h2>Top dépense</h2>
        <TopExpensiveWorks items={topExpensive} worksById={workById} />
      </section>
    </div>
  );
}
