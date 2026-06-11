import { HashRouter, Route, Routes } from "react-router-dom";
import { LibraryPage } from "@/pages/LibraryPage";
import { WorkDetailPage } from "@/pages/WorkDetailPage";
import "./App.css";

/**
 * @description Routage : bibliothèque → fiche œuvre.
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/work/:workId" element={<WorkDetailPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
