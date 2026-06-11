import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthPanel } from "@/features/auth/AuthPanel";
import { useAuth } from "@/contexts/AuthContext";
import "./LoginPage.css";

/**
 * @description Page de connexion plein écran.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();

  const from =
    (location.state as { from?: string } | null)?.from?.replace(/^#/, "") || "/";

  if (!loading && session) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="login-page">
      <div className="login-page-glow" aria-hidden />
      <div className="login-card">
        <AuthPanel onSuccess={() => navigate(from, { replace: true })} />
      </div>
    </div>
  );
}
