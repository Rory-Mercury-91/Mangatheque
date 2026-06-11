import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
      <div className="auth-guard-loading" role="status">
        <Loader2 size={28} className="spin" aria-hidden />
        <span>Vérification de la session…</span>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
