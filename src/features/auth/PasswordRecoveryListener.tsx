import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isRecoveryAuthUrl } from "@/services/auth/authUrlParams";
import { markPasswordRecoveryPending } from "@/services/auth/passwordRecovery";

/**
 * @description Redirige vers la page de nouveau mot de passe lors d'un lien de récupération.
 */
export function PasswordRecoveryListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isRecoveryAuthUrl(window.location.href)) {
      markPasswordRecoveryPending();
      if (location.pathname !== "/auth/reset-password") {
        navigate("/auth/reset-password", { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }

      markPasswordRecoveryPending();
      const hashPath = window.location.hash.split("?")[0].replace(/^#/, "");
      if (location.pathname !== "/auth/reset-password" && hashPath !== "/auth/reset-password") {
        navigate("/auth/reset-password", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}
