import React, { useEffect, useState } from "react";

export function IconBtn({ onClick, children, danger, title, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={danger ? "icon-btn icon-btn-danger" : "icon-btn"}
      style={{ ...styles.iconBtn, ...(danger ? { color: "var(--bad)" } : {}), ...(disabled ? { opacity: 0.4, cursor: "default" } : {}) }}
    >
      {children}
    </button>
  );
}

// --- Thème clair / sombre ---
// Le choix est mémorisé dans localStorage ; à défaut on suit la préférence du
// système. index.html applique déjà data-theme avant le premier rendu pour
// éviter un flash de la mauvaise palette.
const THEME_KEY = "pf-theme";

function readInitialTheme() {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Stockage indisponible (navigation privée…) : on retombe sur le système.
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignoré */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

export const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
:root, :root[data-theme="light"] {
  color-scheme: light;
  --bg: #F6F5F2;
  --surface: #FFFFFF;
  --surface-2: #F2F1ED;
  --surface-3: #EAE8E3;
  --border: #E5E3DD;
  --border-strong: #D2CFC7;
  --text: #17191C;
  --text-dim: #686D74;
  --text-faint: #9A9EA4;
  --accent: #8C6A2B;
  --accent-dim: #D8C59D;
  --accent-soft: rgba(166, 128, 56, 0.11);
  --primary: #17191C;
  --on-primary: #FFFFFF;
  --on-accent: #FFFFFF;
  --good: #2C7A4B;
  --good-soft: rgba(44, 122, 75, 0.10);
  --bad: #B8432D;
  --bad-dim: #FBE6E1;
  --bad-text: #8E2F1F;
  --hover: rgba(23, 25, 28, 0.045);
  --sidebar: #FBFAF8;
  --overlay: rgba(23, 25, 28, 0.38);
  --shadow-sm: 0 1px 2px rgba(23, 25, 28, 0.05);
  --shadow-md: 0 1px 2px rgba(23, 25, 28, 0.04), 0 6px 18px -6px rgba(23, 25, 28, 0.12);
  --shadow-lg: 0 24px 60px -16px rgba(23, 25, 28, 0.28), 0 2px 6px rgba(23, 25, 28, 0.06);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0E1012;
  --surface: #15181B;
  --surface-2: #1C2024;
  --surface-3: #242930;
  --border: #252A30;
  --border-strong: #353B43;
  --text: #ECEAE5;
  --text-dim: #8F959C;
  --text-faint: #646A71;
  --accent: #D4AF6A;
  --accent-dim: #6B5832;
  --accent-soft: rgba(212, 175, 106, 0.12);
  --primary: #D4AF6A;
  --on-primary: #17140D;
  --on-accent: #17140D;
  --good: #6DB585;
  --good-soft: rgba(109, 181, 133, 0.12);
  --bad: #E57A61;
  --bad-dim: #3A201B;
  --bad-text: #F6D9D1;
  --hover: rgba(255, 255, 255, 0.045);
  --sidebar: #121417;
  --overlay: rgba(0, 0, 0, 0.6);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -8px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 24px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04);
}
:root {
  --font-display: 'Geist', 'Inter', system-ui, sans-serif;
  --font-body: 'Geist', 'Inter', system-ui, sans-serif;
  --font-mono: 'Geist', 'Inter', system-ui, sans-serif;
  --font-code: 'Geist Mono', ui-monospace, monospace;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
* { box-sizing: border-box; }
html, body { background: var(--bg); color: var(--text); }
body { margin: 0; font-family: var(--font-body); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
::selection { background: var(--accent-soft); color: var(--text); }
* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; border: 3px solid var(--bg); }
::-webkit-scrollbar-track { background: transparent; }
table, [style*="--font-mono"] { font-variant-numeric: tabular-nums; }

/* Interactions — les styles inline ne savent pas gérer :hover, d'où ces règles. */
button, a, label { transition: background-color .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease), box-shadow .15s var(--ease), transform .12s var(--ease), opacity .15s; }
button:not(:disabled):hover, label[role="button"]:hover { box-shadow: inset 0 0 0 100vmax var(--hover); }
button:not(:disabled):active { transform: translateY(0.5px); }
button:disabled { cursor: default; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
input, select, textarea { transition: border-color .15s var(--ease), box-shadow .15s var(--ease), background-color .15s; }
input:hover:not(:focus), select:hover:not(:focus), textarea:hover:not(:focus) { border-color: var(--border-strong) !important; }
input:focus, select:focus, textarea:focus { outline: none !important; border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-soft); background-color: var(--surface) !important; }
input::placeholder, textarea::placeholder { color: var(--text-faint); }
input[type="search"]::-webkit-search-cancel-button, input[type="search"]::-webkit-search-decoration { -webkit-appearance: none; appearance: none; display: none; }
.icon-btn:not(:disabled):hover { color: var(--text) !important; border-color: var(--border-strong) !important; }
.icon-btn-danger:not(:disabled):hover { color: var(--bad) !important; border-color: var(--bad) !important; }
.nav-item:not(.is-active):hover { color: var(--text) !important; }
.nav-item.is-active, .nav-item.is-active:hover { box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); }
button[style*="background: var(--primary)"]:not(:disabled):hover { box-shadow: none; opacity: 0.88; }
.tab-btn:not(.is-active):hover { color: var(--text) !important; box-shadow: none !important; }
.tab-btn:hover { box-shadow: none !important; }
.pay-row:last-child { border-bottom: none !important; }
.pay-row:hover { background: var(--hover); }
.card-interactive { transition: border-color .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease); }
.card-interactive:hover { border-color: var(--border-strong) !important; box-shadow: var(--shadow-md) !important; transform: translateY(-2px); }
tbody tr > td { transition: background-color .12s; }
tbody tr:hover > td { background-color: var(--hover); }
tbody tr.ledger-group:hover > td { background-color: color-mix(in srgb, var(--surface-2) 70%, var(--surface)); }
tbody tr.ledger-group button:hover { box-shadow: none; }
a { color: var(--accent); }

@keyframes pf-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pf-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pf-pop { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes pf-spin { to { transform: rotate(360deg); } }
@keyframes pf-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.page { animation: pf-rise .28s var(--ease); }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: pf-spin .7s linear infinite; display: inline-block; flex-shrink: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; color: var(--accent); }
@media (max-width: 760px) {
  .app-shell { flex-direction: column !important; min-height: auto !important; }
  .sidebar-nav { position: sticky !important; top: 0; z-index: 30; width: 100% !important; height: auto !important; flex-direction: row !important; align-items: center !important;
    padding: 10px 12px !important; border-right: none !important; border-bottom: 1px solid var(--border) !important;
    gap: 10px !important; overflow-x: auto; }
  .brand-block { flex-shrink: 0; padding: 0 !important; }
  .brand-block .brand-text, .nav-section-label, .account-info { display: none !important; }
  .nav-list { flex-direction: row !important; gap: 4px !important; }
  .nav-group { flex-direction: row !important; gap: 4px !important; }
  .nav-list button span { display: none; }
  .nav-list button { padding: 9px !important; }
  .account-block { flex-direction: row !important; margin-top: 0 !important; margin-left: auto; border-top: none !important; padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
  .account-avatar { display: none !important; }
  .topbar { display: none !important; }
  .backup-block { flex-direction: row !important; margin-top: 0 !important; border-top: none !important; padding-top: 0 !important; margin-left: auto; }
  .backup-block span { display: none; }
  .backup-block button, .backup-block label { padding: 9px !important; }
  .main-content { width: 100%; }
  .page { padding: 20px 16px 48px !important; }
  .page-header-row { flex-direction: column !important; align-items: flex-start !important; }
  .subnav { padding: 12px 16px 0 !important; flex-direction: column-reverse !important; align-items: stretch !important; gap: 4px !important; }
  .subnav [role="tablist"], [role="tablist"] { flex-wrap: nowrap !important; overflow-x: auto; scrollbar-width: none; }
  [role="tablist"]::-webkit-scrollbar { display: none; }
  .subnav > *, [role="tablist"] { min-width: 0; max-width: 100%; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
  .kpi-grid > div { padding: 14px !important; }
  .kpi-value { font-size: 19px !important; white-space: normal !important; }
  .two-col { grid-template-columns: 1fr !important; }
  .pay-row { flex-wrap: wrap; gap: 8px 12px !important; }
  .pay-action { min-width: 0 !important; width: 100%; justify-content: stretch !important; }
  .pay-action > button { flex: 1; }
  .building-grid { grid-template-columns: 1fr !important; }
}
`;

const PAGE_MAX = 1160;

export const styles = {
  app: { display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: 14 },
  loadingScreen: { minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-dim)" },
  loadingText: { color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 10 },

  // --- Shell (sidebar + barre supérieure) ---
  sidebar: { width: 252, height: "100vh", position: "sticky", top: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)", padding: "18px 12px 12px", display: "flex", flexDirection: "column", gap: 22, flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: 11, padding: "2px 8px" },
  brandMark: { width: 34, height: 34, borderRadius: 9, background: "linear-gradient(140deg, #E2C17F 0%, #B8904A 55%, #8C6A2B 100%)", color: "#1A150B", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.18)", flexShrink: 0 },
  brandText: { display: "flex", flexDirection: "column", minWidth: 0 },
  brandTitle: { fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em" },
  brandSub: { fontSize: 11.5, color: "var(--text-dim)" },
  navList: { display: "flex", flexDirection: "column", gap: 18 },
  navGroup: { display: "flex", flexDirection: "column", gap: 2 },
  navSectionLabel: { fontSize: 11, fontWeight: 500, color: "var(--text-faint)", padding: "0 10px 6px", letterSpacing: "0.02em" },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 13.5, fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer", textAlign: "left", width: "100%" },
  navItemActive: { background: "var(--surface)", color: "var(--text)" },
  accountBlock: { marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0, letterSpacing: "0.02em" },
  accountInfo: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 },
  accountName: { fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  accountRole: { fontSize: 11.5, color: "var(--text-dim)" },
  topbar: { position: "sticky", top: 0, zIndex: 20, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 28px", background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "saturate(1.4) blur(12px)", WebkitBackdropFilter: "saturate(1.4) blur(12px)", borderBottom: "1px solid var(--border)" },
  crumbs: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", minWidth: 0 },
  crumbCurrent: { color: "var(--text)", fontWeight: 500 },
  topbarRight: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-dim)" },
  backupBlock: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "1px solid var(--border)" },
  backupBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer", textAlign: "left" },

  // --- Pages ---
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  page: { padding: "32px 36px 72px", maxWidth: PAGE_MAX, margin: "0 auto", width: "100%" },
  pageHeader: { marginBottom: 28 },
  pageHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 16, flexWrap: "wrap" },
  eyebrow: { fontSize: 12, fontWeight: 500, color: "var(--accent)", marginBottom: 6, letterSpacing: "0.01em" },
  h1: { fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: "-0.025em", lineHeight: 1.15 },
  errorBanner: { position: "fixed", right: 20, bottom: 20, zIndex: 70, maxWidth: 420, display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderLeft: "3px solid var(--bad)", padding: "12px 16px", fontSize: 13, borderRadius: 10, boxShadow: "var(--shadow-lg)", animation: "pf-pop .22s var(--ease)" },

  // Sous-navigation à onglets (Loyers, détail chantier)
  subnav: { maxWidth: PAGE_MAX, margin: "0 auto", width: "100%", padding: "20px 36px 0", display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" },
  tabBar: { display: "flex", gap: 2, flexWrap: "wrap", flex: 1, borderBottom: "1px solid var(--border)" },
  tab: { display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 12px", marginBottom: -1, background: "transparent", borderWidth: "0 0 2px 0", borderStyle: "solid", borderColor: "transparent", color: "var(--text-dim)", fontSize: 13.5, fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer", whiteSpace: "nowrap" },
  tabActive: { color: "var(--text)", borderColor: "transparent transparent var(--accent) transparent" },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 },
  kpiCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px 18px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", minWidth: 0 },
  kpiHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  kpiLabel: { fontSize: 12.5, color: "var(--text-dim)", fontWeight: 500, marginBottom: 8 },
  kpiValue: { fontFamily: "var(--font-display)", fontSize: 25, fontWeight: 600, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  kpiSuffix: { fontSize: 12, color: "var(--text-dim)", marginTop: 4 },
  globalYieldBlock: { background: "linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "var(--shadow-sm)" },
  cardTitle: { fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 600, marginBottom: 16, letterSpacing: "-0.01em" },
  typeRows: { display: "flex", flexDirection: "column", gap: 12 },
  typeRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "2px 0" },
  typeRowLabel: { flex: 1, color: "var(--text-dim)" },
  typeRowValue: { fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" },
  divider: { height: 1, background: "var(--border)", margin: "14px 0" },
  emptyNote: { fontSize: 13, color: "var(--text-dim)", padding: "6px 0", lineHeight: 1.55 },
  unpaidList: { display: "flex", flexDirection: "column", gap: 4, listStyle: "none", padding: 0, margin: 0 },
  unpaidItem: { display: "flex", gap: 12, alignItems: "center", padding: "8px 10px", margin: "0 -10px", borderRadius: 8 },
  unpaidName: { fontSize: 13.5, fontWeight: 500 },
  unpaidMeta: { fontSize: 12, color: "var(--text-dim)", marginTop: 2 },

  // --- Boutons ---
  primaryBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "var(--primary)", color: "var(--on-primary)", border: "1px solid var(--primary)", borderRadius: 8, padding: "8px 14px", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap" },
  secondaryBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid transparent", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)", flexShrink: 0, whiteSpace: "nowrap" },

  emptyState: { border: "1px dashed var(--border-strong)", background: "var(--surface)", borderRadius: 14, padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" },
  emptyStateTitle: { fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 600, marginTop: 8 },
  emptyStateSub: { fontSize: 13, color: "var(--text-dim)", maxWidth: 380, lineHeight: 1.55 },

  buildingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  buildingCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, boxShadow: "var(--shadow-sm)" },
  buildingCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  buildingIconWrap: { width: 40, height: 40, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  buildingCardActions: { display: "flex", gap: 6 },
  buildingName: { fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" },
  buildingMeta: { fontSize: 12.5, color: "var(--text-dim)" },
  buildingStock: { fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 6, marginTop: 10, paddingTop: 12, borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" },
  buildingDot: { color: "var(--text-faint)" },
  searchWrap: { position: "relative", display: "flex", alignItems: "center" },
  searchInput: { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 44px 14px 46px", fontSize: 15, color: "var(--text)", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-sm)" },
  searchClear: { position: "absolute", right: 10, width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  payList: { display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-sm)", overflow: "hidden" },
  payRow: { display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderBottom: "1px solid var(--border)" },
  payTenant: { fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  payMeta: { fontSize: 12, color: "var(--text-dim)", marginTop: 2 },
  payAmount: { fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  payAction: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 170 },
  buildingMoney: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, padding: "12px 0", borderTop: "1px solid var(--border)" },
  buildingMoneyLabel: { fontSize: 11.5, color: "var(--text-dim)", marginBottom: 3 },
  buildingMoneyValue: { fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  buildingOccRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, color: "var(--text-dim)", marginBottom: 7, fontVariantNumeric: "tabular-nums" },
  buildingDetailHead: { display: "flex", gap: 14, alignItems: "flex-start" },
  buildingAddress: { fontSize: 13, color: "var(--text-dim)", marginTop: 4 },
  yieldBadge: { display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 500, color: "var(--good)", background: "var(--good-soft)", padding: "3px 9px", borderRadius: 999 },
  expensesSection: { marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--border)" },
  expensesTotal: { fontSize: 13, fontWeight: 600, color: "var(--text)", marginTop: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  receiptPreview: { display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 4 },
  receiptRow: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  letterTextarea: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, color: "var(--text)", fontSize: 12.5, lineHeight: 1.55, fontFamily: "var(--font-body)", width: "100%", resize: "vertical", marginTop: 8, marginBottom: 4 },
  downloadNote: { fontSize: 12.5, color: "var(--good)", background: "var(--good-soft)", padding: "8px 11px", borderRadius: 8, marginTop: 4 },
  tierSelector: { display: "flex", gap: 4, margin: "8px 0", padding: 3, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9 },
  tierBtn: { flex: 1, padding: "7px 6px", borderRadius: 6, border: "1px solid transparent", background: "transparent", color: "var(--text-dim)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" },
  tierBtnActive: { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" },
  sendRow: { display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" },
  sendLink: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", textDecoration: "none" },
  sendLinkDisabled: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-faint)", border: "1px dashed var(--border)", borderRadius: 8, padding: "7px 12px" },
  backLink: { display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: "4px 8px 4px 4px", margin: "0 0 16px -4px", borderRadius: 6, fontFamily: "var(--font-body)" },
  groupHeading: { fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "baseline", gap: 8 },
  groupCount: { fontSize: 11.5, color: "var(--text-dim)", fontWeight: 500, background: "var(--surface-2)", padding: "1px 7px", borderRadius: 999 },
  propList: { display: "flex", flexDirection: "column", gap: 10 },
  propCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" },
  propHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer" },
  propHeadLeft: { display: "flex", alignItems: "center", gap: 10 },
  propHeadActions: { display: "flex", gap: 6 },
  propName: { fontSize: 14, fontWeight: 600 },
  propMeta: { fontSize: 12, color: "var(--text-dim)", marginTop: 2 },
  unitsWrap: { padding: "0 16px 16px", borderTop: "1px solid var(--border)" },

  // --- Tableaux ---
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, marginTop: 12, fontSize: 13 },
  th: { textAlign: "left", padding: "9px 12px", fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" },
  tagGood: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--good)", fontSize: 12, fontWeight: 500 },
  tagBad: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--bad)", fontSize: 12, fontWeight: 500 },
  statusBtn: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px", cursor: "pointer" },
  statusBtnGood: { borderColor: "transparent", background: "var(--good-soft)" },
  statusBtnBad: { borderColor: "transparent", background: "var(--bad-dim)" },
  dupBanner: { display: "flex", gap: 10, alignItems: "flex-start", background: "var(--bad-dim)", color: "var(--bad-text)", fontSize: 12.5, padding: "11px 14px", borderRadius: 10, marginBottom: 18, border: "1px solid color-mix(in srgb, var(--bad) 25%, transparent)" },
  linkBtn: { background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit", fontWeight: 600 },
  dupRow: { background: "color-mix(in srgb, var(--bad) 8%, transparent)" },
  dupMarker: { color: "var(--bad)" },
  iconBtn: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", cursor: "pointer", flexShrink: 0, padding: 0 },
  yearSwitcher: { display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "var(--shadow-sm)" },
  yearBtn: { background: "transparent", border: "none", borderRadius: 6, width: 30, height: 28, color: "var(--text-dim)", cursor: "pointer", fontSize: 14 },
  yearLabel: { fontSize: 14, fontWeight: 600, minWidth: 48, textAlign: "center", fontVariantNumeric: "tabular-nums" },
  ledgerScroll: { overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", boxShadow: "var(--shadow-sm)" },
  ledgerTable: { borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 760 },
  ledgerHeadCell: { textAlign: "left", padding: "11px 16px", fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)", position: "sticky", left: 0, zIndex: 1, background: "var(--surface-2)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", minWidth: 200 },
  ledgerMonthHead: { fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)", padding: "11px 4px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" },
  ledgerRowLabel: { padding: "11px 16px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", position: "sticky", left: 0, zIndex: 1, background: "var(--surface)" },
  ledgerTenant: { fontSize: 13, fontWeight: 600 },
  ledgerUnit: { fontSize: 11.5, color: "var(--text-dim)", marginTop: 1 },
  ledgerCell: { textAlign: "center", padding: "8px 4px", borderBottom: "1px solid var(--border)" },
  ledgerDot: { width: 20, height: 20, borderRadius: 6, border: "none", padding: 0, verticalAlign: "middle" },
  legend: { display: "flex", gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 7 },
  legendDot: { width: 12, height: 12, borderRadius: 4, display: "inline-block" },

  // --- Modales & formulaires ---
  overlay: { position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16, animation: "pf-fade .16s ease" },
  modal: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, width: 460, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-lg)", animation: "pf-pop .22s var(--ease)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 14px", flexShrink: 0, borderBottom: "1px solid var(--border)" },
  modalBody: { padding: "18px 22px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4, minHeight: 0 },
  modalTitle: { fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" },
  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, flex: 1 },
  fieldLabel: { fontSize: 12.5, fontWeight: 500, color: "var(--text)" },
  fieldRow: { display: "flex", gap: 12 },
  input: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px", color: "var(--text)", fontSize: 13.5, fontFamily: "var(--font-body)", width: "100%", boxShadow: "var(--shadow-sm)" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--surface-2)" },
  formError: { background: "var(--bad-dim)", color: "var(--bad-text)", fontSize: 12.5, padding: "9px 12px", borderRadius: 8, marginTop: 6, marginBottom: 10 },
  confirmRow: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--text)", marginTop: 10, cursor: "pointer" },
  bulkPreview: { fontSize: 12.5, color: "var(--accent)", background: "var(--accent-soft)", padding: "8px 11px", borderRadius: 8, marginTop: 2, marginBottom: 8, fontFamily: "var(--font-code)" },

  // --- Module "Suivi chantiers" ---
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },

  progressTrack: { height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", flex: 1 },
  progressFill: (pct, color) => ({
    height: "100%",
    width: `${Math.max(0, Math.min(100, pct))}%`,
    background: color || "linear-gradient(90deg, var(--accent-dim), var(--accent))",
    borderRadius: 999,
    transition: "width .4s var(--ease)",
  }),

  badge: (tone) => {
    const tones = {
      good: { bg: "var(--good-soft)", fg: "var(--good)" },
      bad: { bg: "var(--bad-dim)", fg: "var(--bad)" },
      warn: { bg: "var(--accent-soft)", fg: "var(--accent)" },
      neutral: { bg: "var(--surface-2)", fg: "var(--text-dim)" },
    };
    const t = tones[tone] || tones.neutral;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11.5,
      fontWeight: 500,
      padding: "2px 9px",
      borderRadius: 999,
      background: t.bg,
      color: t.fg,
      whiteSpace: "nowrap",
    };
  },

  photoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 },
  photoCard: { position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" },
  photoImg: { width: "100%", height: 120, objectFit: "cover", display: "block" },
  photoCaption: { fontSize: 11.5, color: "var(--text-dim)", padding: "7px 9px" },
};
