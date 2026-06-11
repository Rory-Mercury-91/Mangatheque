import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { consumePendingAuthDeepLink } from "@/services/auth/authRedirectService";
import "./AuthCallbackPage.css";

function extractParams(rawUrl: string): URLSearchParams {
  const hashIndex = rawUrl.indexOf("#");
  if (hashIndex >= 0) {
    const fragment = rawUrl.slice(hashIndex + 1);
    const queryStart = fragment.indexOf("?");
    if (queryStart >= 0) {
      return new URLSearchParams(fragment.slice(queryStart + 1));
    }
    if (fragment.includes("=")) {
      return new URLSearchParams(fragment);
    }
  }
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex >= 0) {
    return new URLSearchParams(rawUrl.slice(queryIndex + 1));
  }
  return new URLSearchParams();
}

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
        const supabase = getSupabaseClient();
        const raw = consumePendingAuthDeepLink() ?? window.location.href;
        const params = extractParams(raw);
        const code = params.get("code");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw new Error(error.message);
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            throw new Error(error.message);
          }
        } else {
          throw new Error("Lien invalide ou expiré.");
        }

        if (cancelled) {
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
      <div className="auth-callback-card">
        {state.status === "loading" ? (
          <Loader2 size={32} className="spin" aria-hidden />
        ) : null}
        <h1>Authentification</h1>
        <p
          className={
            state.status === "error"
              ? "auth-callback-error"
              : state.status === "success"
                ? "auth-callback-success"
                : "auth-callback-message"
          }
        >
          {state.message}
        </p>
        {state.status === "error" ? (
          <Link to="/login" className="auth-callback-link">
            Retour à la connexion
          </Link>
        ) : null}
      </div>
    </div>
  );
}
