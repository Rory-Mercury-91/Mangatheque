import { HashRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { OwnersProvider } from "@/contexts/OwnersContext";
import { ActivityLogsPage } from "@/pages/ActivityLogsPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { PersonalizationPage } from "@/pages/PersonalizationPage";
import { WorkDetailPage } from "@/pages/WorkDetailPage";
import "./App.css";

/**
 * @description Routage : auth, bibliothèque, tableau de bord, journal, fiche œuvre.
 */
function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <OwnersProvider>
                  <AppLayout />
                </OwnersProvider>
              }
            >
              <Route path="/" element={<LibraryPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/logs" element={<ActivityLogsPage />} />
              <Route path="/personalization" element={<PersonalizationPage />} />
              <Route path="/work/:workId" element={<WorkDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
