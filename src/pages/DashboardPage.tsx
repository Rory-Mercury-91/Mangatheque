import { useCallback, useEffect, useMemo, useState } from "react";

import { FinancialSummary } from "@/components/common/FinancialSummary";

import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";

import { TopExpensiveWorks } from "@/features/dashboard/TopExpensiveWorks";

import { useOwners } from "@/hooks/useOwners";

import { useSupabaseSync } from "@/hooks/useSupabaseSync";

import { useWorks } from "@/hooks/useWorks";

import {

  buildOwnersCacheKey,

  readDashboardCacheBundle,

  writeDashboardCacheBundle,

} from "@/services/dashboardCacheService";

import {

  fetchDashboardSnapshot,

  type GlobalFinancials,

  type TopExpensiveWork,

} from "@/services/financialService";

import type { SyncReloadOptions } from "@/types/sync";

import { isSameData, setIfChanged } from "@/utils/stateSync";

import "./DashboardPage.css";



/**

 * @description Tableau de bord : coûts globaux, récap d'achat et top dépenses.

 */

export function DashboardPage() {

  const { owners } = useOwners();

  const { works, loading: worksLoading } = useWorks();



  const [financials, setFinancials] = useState<GlobalFinancials | null>(null);

  const [topExpensive, setTopExpensive] = useState<TopExpensiveWork[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);



  const ownersKey = useMemo(

    () => buildOwnersCacheKey(owners.map((owner) => owner.id)),

    [owners],

  );



  const worksSyncKey = useMemo(

    () => works.map((work) => `${work.id}:${work.updated_at}`).join("|"),

    [works],

  );



  const load = useCallback(

    async (options?: SyncReloadOptions) => {

      if (owners.length === 0) {

        return;

      }



      const silent = options?.silent ?? false;

      let hydrated = false;



      if (!silent) {

        const cached = await readDashboardCacheBundle(ownersKey, worksSyncKey);

        if (cached) {

          setFinancials(cached.financials);

          setTopExpensive(cached.topExpensive);

          setLoading(false);

          hydrated = true;

        } else {

          setLoading(true);

          setError(null);

        }

      }



      try {

        const snapshot = await fetchDashboardSnapshot(owners, 3);

        setFinancials((previous) =>

          isSameData(previous, snapshot.financials)

            ? previous

            : snapshot.financials,

        );

        setIfChanged(setTopExpensive, snapshot.topExpensive);

        await writeDashboardCacheBundle(ownersKey, worksSyncKey, snapshot);

      } catch (err) {

        if (!silent && !hydrated) {

          setError(err instanceof Error ? err.message : "Erreur de chargement.");

        }

      } finally {

        if (!silent && !hydrated) {

          setLoading(false);

        }

      }

    },

    [owners, ownersKey, worksSyncKey],

  );



  useEffect(() => {
    if (owners.length === 0 || worksLoading) {
      return;
    }
    void load();
  }, [load, owners.length, worksLoading]);



  useSupabaseSync(load);



  if (loading) {

    return (

      <LoadingOverlayHost className="dashboard-page">

        <header className="dashboard-header">

          <h1>Tableau de bord</h1>

        </header>

        <LoadingOverlay message="Chargement du tableau de bord…" />

      </LoadingOverlayHost>

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

        <h2>Top dépense</h2>

        <TopExpensiveWorks items={topExpensive} worksById={workById} />

      </section>

    </div>

  );

}


