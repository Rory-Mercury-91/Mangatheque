import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { completeTrackerOauthFromCallback } from "@/services/tracker/completeTrackerOauth";
import { syncTrackerAfterOauth } from "@/services/tracker/trackerAutoSync";
import "./AuthCallbackPage.css";

type CallbackState = {
  status: "loading" | "success" | "error";
  message: string;
};

/**
 * @description Traite le retour OAuth MAL / AniList, lie le token, puis sync la bibliothèque.
 */
export function TrackerCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>({
    status: "loading",
    message: "Validation du tracker…",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await completeTrackerOauthFromCallback();
        if (cancelled) {
          return;
        }
        const label = result.provider === "mal" ? "MyAnimeList" : "AniList";
        const who = result.username ? ` (${result.username})` : "";
        setState({
          status: "loading",
          message: `${label} connecté${who}. Import de la progression…`,
        });

        let synced = 0;
        try {
          const syncResults = await syncTrackerAfterOauth(result.provider);
          synced = syncResults.filter(
            (row) =>
              row.chaptersApplied != null || row.volumesApplied != null,
          ).length;
        } catch (syncError) {
          console.warn("Sync tracker après OAuth :", syncError);
        }

        if (cancelled) {
          return;
        }
        setState({
          status: "success",
          message:
            synced > 0
              ? `${label} connecté${who}. ${synced} série${synced > 1 ? "s" : ""} synchronisée${synced > 1 ? "s" : ""}.`
              : `${label} connecté${who}. Redirection…`,
        });
        window.setTimeout(() => navigate("/logs", { replace: true }), 1100);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible de lier le tracker.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <LoadingOverlayHost className="auth-callback-page">
      {state.status === "loading" ? (
        <LoadingOverlay message={state.message} />
      ) : (
        <div className="auth-callback-card">
          <h1>
            {state.status === "success" ? "Tracker lié" : "Échec du tracker"}
          </h1>
          <p>{state.message}</p>
          {state.status === "error" ? (
            <Link className="btn-primary" to="/logs">
              Retour au journal
            </Link>
          ) : null}
        </div>
      )}
    </LoadingOverlayHost>
  );
}
