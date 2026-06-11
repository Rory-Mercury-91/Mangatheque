import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTauriAuthDeepLinks } from "@/services/auth/authRedirectService";

void initTauriAuthDeepLinks();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
