import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingOverlay } from "@/components/common/LoadingOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { isPasswordRecoveryPending } from "@/services/auth/passwordRecovery";
import "./ProtectedRoute.css";

/**
 * @description Redirige vers la connexion si aucune session active.
 */
export function ProtectedRoute() {
  const { session, loading, configured } = useAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <div className="auth-guard-message">
        <p>Configuration Supabase manquante. Vérifiez le fichier <code>.env</code>.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingOverlay
        scope="fullscreen"
        message="Vérification de la session…"
      />
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isPasswordRecoveryPending()) {
    return <Navigate to="/auth/reset-password" replace />;
  }

  return <Outlet />;
}
