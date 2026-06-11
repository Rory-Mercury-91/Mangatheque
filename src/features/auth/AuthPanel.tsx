import { type FormEvent, useState } from "react";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/services/auth/authActions";
import "./AuthPanel.css";

type AuthTab = "login" | "register";

type AuthPanelProps = {
  onSuccess?: () => void;
};

/**
 * @description Panneau connexion / inscription par e-mail.
 */
export function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await signInWithEmailPassword(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== passwordConfirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const result = await signUpWithEmailPassword(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if ("needsConfirmation" in result && result.needsConfirmation) {
        setInfo(
          "Compte créé. Si la confirmation e-mail est activée, ouvrez le lien reçu puis connectez-vous.",
        );
        return;
      }
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-brand">
        <span className="auth-panel-logo" aria-hidden>
          📚
        </span>
        <h1 className="auth-panel-title">Mangathèque</h1>
        <p className="auth-panel-subtitle">Bibliothèque manga du foyer</p>
      </div>

      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "login"}
          className={tab === "login" ? "auth-tab auth-tab-active" : "auth-tab"}
          onClick={() => {
            setTab("login");
            setError(null);
            setInfo(null);
          }}
        >
          Connexion
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "register"}
          className={tab === "register" ? "auth-tab auth-tab-active" : "auth-tab"}
          onClick={() => {
            setTab("register");
            setError(null);
            setInfo(null);
          }}
        >
          Créer un compte
        </button>
      </div>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
      {info ? <div className="auth-alert auth-alert-info">{info}</div> : null}

      {tab === "login" ? (
        <form className="auth-form" onSubmit={handleLogin}>
          <label className="auth-field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleRegister}>
          <label className="auth-field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Mot de passe (min. 6 caractères)</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
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
              onChange={(ev) => setPasswordConfirm(ev.target.value)}
            />
          </label>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Création…" : "Créer le compte"}
          </button>
        </form>
      )}
    </div>
  );
}
