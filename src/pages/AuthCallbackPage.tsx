import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { consumePendingAuthDeepLink } from "@/services/auth/authRedirectService";
import { establishAuthSessionFromUrl } from "@/services/auth/establishAuthSessionFromUrl";
import {
  extractAuthParams,
  isRecoveryAuthUrl,
} from "@/services/auth/authUrlParams";
import { markPasswordRecoveryPending } from "@/services/auth/passwordRecovery";
import "./AuthCallbackPage.css";

type CallbackState = {
  status: "loading" | "success" | "error";
  message: string;
};

/**
 * @description Traite le retour OAuth / confirmation e-mail Supabase.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>({
    status: "loading",
    message: "Validation de la connexion…",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = consumePendingAuthDeepLink() ?? window.location.href;
        const isRecovery = isRecoveryAuthUrl(raw);

        await establishAuthSessionFromUrl(raw);

        if (cancelled) {
          return;
        }

        if (isRecovery) {
          markPasswordRecoveryPending();
          setState({
            status: "success",
            message: "Lien validé. Choisissez votre nouveau mot de passe…",
          });
          window.setTimeout(
            () => navigate("/auth/reset-password", { replace: true }),
            400,
          );
          return;
        }

        const params = extractAuthParams(raw);
        if (params.get("type") === "recovery") {
          markPasswordRecoveryPending();
          navigate("/auth/reset-password", { replace: true });
          return;
        }

        setState({
          status: "success",
          message: "Connexion réussie. Redirection…",
        });
        window.setTimeout(() => navigate("/", { replace: true }), 800);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Erreur de validation du lien.";
        setState({ status: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="auth-callback-page">
      <LoadingOverlayHost compact className="auth-callback-card">
        {state.status === "loading" ? (
          <LoadingOverlay message={state.message} />
        ) : (
          <>
            <h1>Authentification</h1>
            <p
              className={
                state.status === "error"
                  ? "auth-callback-error"
                  : "auth-callback-success"
              }
            >
              {state.message}
            </p>
            {state.status === "error" ? (
              <Link to="/login" className="auth-callback-link">
                Retour à la connexion
              </Link>
            ) : null}
          </>
        )}
      </LoadingOverlayHost>
    </div>
  );
}
