// Fichier conservé pour compatibilité (déprécié) : toute la logique du module
// "Suivi loyers" qui vivait ici a été déplacée dans LoyersModule.jsx, qui est
// maintenant rendu par ExtranetShell.jsx (lui-même monté par AppRoot.jsx).
// Ce fichier ne fait plus que ré-exporter LoyersModule pour éviter d'avoir
// deux copies divergentes de la même logique financière/fiscale.
export { default } from "./LoyersModule.jsx";
