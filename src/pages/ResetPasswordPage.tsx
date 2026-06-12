import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { updatePassword } from "@/services/auth/authActions";
import { establishAuthSessionFromUrl } from "@/services/auth/establishAuthSessionFromUrl";
import { isRecoveryAuthUrl } from "@/services/auth/authUrlParams";
import {
  clearPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from "@/services/auth/passwordRecovery";
import { consumePendingAuthDeepLink } from "@/services/auth/authRedirectService";
import "@/features/auth/AuthPanel.css";
import "./LoginPage.css";

/**
 * @description Page de définition d'un nouveau mot de passe après lien e-mail.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading, refreshSession } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = consumePendingAuthDeepLink() ?? window.location.href;
        if (isRecoveryAuthUrl(raw)) {
          markPasswordRecoveryPending();
        }

        const established = await establishAuthSessionFromUrl(raw);
        if (established) {
          await refreshSession();
          markPasswordRecoveryPending();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Lien invalide ou expiré.",
          );
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);
    try {
      const result = await updatePassword(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clearPasswordRecoveryPending();
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || bootstrapping;
  const canSetPassword = Boolean(session);

  return (
    <div className="login-page">
      <div className="login-page-glow" aria-hidden />
      <div className="login-card">
        <div className="auth-panel">
          <div className="auth-panel-brand">
            <h1 className="auth-panel-title">Nouveau mot de passe</h1>
            <p className="auth-panel-subtitle">
              Choisissez un mot de passe pour votre compte Mangathèque.
            </p>
          </div>

          {busy ? (
            <p className="auth-alert auth-alert-info">
              <Loader2 size={16} className="spin" aria-hidden /> Validation du
              lien…
            </p>
          ) : !canSetPassword ? (
            <>
              <div className="auth-alert auth-alert-error">
                {error ??
                  "Lien invalide ou expiré. Demandez un nouveau lien depuis la connexion."}
              </div>
              <Link
                to="/login"
                className="auth-forgot-link auth-forgot-link-block"
              >
                Retour à la connexion
              </Link>
            </>
          ) : (
            <>
              {error ? (
                <div className="auth-alert auth-alert-error">{error}</div>
              ) : null}
              <form className="auth-form" onSubmit={handleSubmit}>
                <label className="auth-field">
                  <span>Nouveau mot de passe (min. 6 caractères)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="auth-field">
                  <span>Confirmation</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                </label>
                <button type="submit" className="auth-submit" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer le mot de passe"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
