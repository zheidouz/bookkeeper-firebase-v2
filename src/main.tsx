import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AuthProvider } from "@/features/auth/AuthProvider";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);