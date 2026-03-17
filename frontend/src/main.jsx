import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

window.__coparentalInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__coparentalInstallPrompt = event;
  window.dispatchEvent(new Event("coparental-install-available"));
});

window.addEventListener("appinstalled", () => {
  window.__coparentalInstallPrompt = null;
  window.dispatchEvent(new Event("coparental-installed"));
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration issues.
    });
  });
}
