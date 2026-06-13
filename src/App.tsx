import { useLayoutEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { isAndroidRuntime } from "@/lib/platform";
import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
import { PasswordRecoveryListener } from "@/features/auth/PasswordRecoveryListener";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { OwnersProvider } from "@/contexts/OwnersContext";
import { ActivityLogsPage } from "@/pages/ActivityLogsPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { WorkDetailPage } from "@/pages/WorkDetailPage";
import "./App.css";

/**
 * @description Routage : auth, tableau de bord, bibliothèque, journal, fiche œuvre.
 */
function App() {
  useLayoutEffect(() => {
    const android = isAndroidRuntime();
    document.documentElement.classList.toggle("runtime-android", android);
    return () => document.documentElement.classList.remove("runtime-android");
  }, []);

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <HashRouter>
        <PasswordRecoveryListener />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <OwnersProvider>
                  <AppLayout />
                </OwnersProvider>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/logs" element={<ActivityLogsPage />} />
              <Route path="/work/:workId" element={<WorkDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
