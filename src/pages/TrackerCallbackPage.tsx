import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { completeTrackerOauthFromCallback } from "@/services/tracker/completeTrackerOauth";
import "./AuthCallbackPage.css";

type CallbackState = {
  status: "loading" | "success" | "error";
  message: string;
};

/**
 * @description Traite le retour OAuth MAL / AniList et lie le token au compte connecté.
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
          status: "success",
          message: `${label} connecté${who}. Redirection…`,
        });
        window.setTimeout(() => navigate("/logs", { replace: true }), 900);
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
