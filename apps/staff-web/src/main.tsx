import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/staff-pro.css";
import App from "./App.tsx";

if (import.meta.env.DEV) {
  document.body.classList.add("dev-demo");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
