import { useLayoutEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { isAndroidRuntime, isMobileRuntime } from "@/lib/platform";
import { useTouchTabletLayout } from "@/hooks/useTouchTabletLayout";
import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
import { PasswordRecoveryListener } from "@/features/auth/PasswordRecoveryListener";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { OwnersProvider } from "@/contexts/OwnersContext";
import { ActivityLogsPage } from "@/pages/ActivityLogsPage";
import { AnimeDetailPage } from "@/pages/AnimeDetailPage";
import { AnimeLibraryPage } from "@/pages/AnimeLibraryPage";
import { AnimeStatsPage } from "@/pages/AnimeStatsPage";
import { AnimePlanningPage } from "@/pages/AnimePlanningPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LibraryHubPage } from "@/pages/LibraryHubPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { ReadingHubPage } from "@/pages/ReadingHubPage";
import { ReadingStatsPage } from "@/pages/ReadingStatsPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { TrackerCallbackPage } from "@/pages/TrackerCallbackPage";
import { TrackersPage } from "@/pages/TrackersPage";
import { WorkDetailPage } from "@/pages/WorkDetailPage";
import "./App.css";

/**
 * @description Routage : auth, tableau de bord, bibliothèque, suivi, journal, fiches.
 */
function App() {
  const mobileRuntime = isMobileRuntime();
  const touchTabletLayout = useTouchTabletLayout(mobileRuntime);
  const touchPhoneLayout = mobileRuntime && !touchTabletLayout;

  useLayoutEffect(() => {
    const android = isAndroidRuntime();
    document.documentElement.classList.toggle("runtime-android", android);
    return () => document.documentElement.classList.remove("runtime-android");
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle(
      "runtime-touch-tablet",
      touchTabletLayout,
    );
    document.body.classList.toggle("touch-tablet-layout", touchTabletLayout);
    return () => {
      document.documentElement.classList.remove("runtime-touch-tablet");
      document.body.classList.remove("touch-tablet-layout");
    };
  }, [touchTabletLayout]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle(
      "runtime-touch-phone",
      touchPhoneLayout,
    );
    document.body.classList.toggle("touch-phone-layout", touchPhoneLayout);
    return () => {
      document.documentElement.classList.remove("runtime-touch-phone");
      document.body.classList.remove("touch-phone-layout");
    };
  }, [touchPhoneLayout]);

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <HashRouter>
        <PasswordRecoveryListener />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/tracker/callback" element={<TrackerCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <OwnersProvider>
                  <AppLayout />
                </OwnersProvider>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/library" element={<LibraryHubPage />}>
                <Route index element={<Navigate to="lectures" replace />} />
                <Route path="lectures" element={<LibraryPage />} />
                <Route path="anime" element={<AnimeLibraryPage />} />
              </Route>
              <Route path="/reading" element={<ReadingHubPage />}>
                <Route index element={<Navigate to="lectures" replace />} />
                <Route path="lectures" element={<ReadingStatsPage />} />
                <Route path="anime" element={<AnimeStatsPage />} />
                <Route path="planning" element={<AnimePlanningPage />} />
                <Route path="trackers" element={<TrackersPage />} />
              </Route>
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/logs" element={<ActivityLogsPage />} />
              <Route path="/work/:workId" element={<WorkDetailPage />} />
              <Route path="/anime/:animeId" element={<AnimeDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
