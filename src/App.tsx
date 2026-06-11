import { HashRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ActivityLogsPage } from "@/pages/ActivityLogsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { WorkDetailPage } from "@/pages/WorkDetailPage";
import "./App.css";

/**
 * @description Routage : bibliothèque, tableau de bord, journal, fiche œuvre.
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/logs" element={<ActivityLogsPage />} />
          <Route path="/work/:workId" element={<WorkDetailPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
