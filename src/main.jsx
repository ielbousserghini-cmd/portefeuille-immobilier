import React from "react";
import ReactDOM from "react-dom/client";
import AppRoot from "./AppRoot.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);

// Web app : le service worker (public/sw.js) permet l'installation sur
// l'écran d'accueil, le démarrage rapide et les notifications push.
// Uniquement en production, pour ne pas gêner le rechargement à chaud en dev.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
