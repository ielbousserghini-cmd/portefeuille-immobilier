import React from "react";

export function IconBtn({ onClick, children, danger, title, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{ ...styles.iconBtn, ...(danger ? { color: "var(--bad)" } : {}), ...(disabled ? { opacity: 0.4, cursor: "default" } : {}) }}
    >
      {children}
    </button>
  );
}

export const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root {
  --bg: #14171B;
  --surface: #1B1F24;
  --surface-2: #232830;
  --border: #2C3239;
  --text: #EDEAE2;
  --text-dim: #8B9096;
  --accent: #C6A15B;
  --accent-dim: #8A733D;
  --good: #6E9B76;
  --bad: #C15B44;
  --bad-dim: #7A3E30;
  --font-display: 'Fraunces', serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
* { box-sizing: border-box; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; color: var(--accent); }
@media (max-width: 760px) {
  .app-shell { flex-direction: column !important; min-height: auto !important; }
  .sidebar-nav { width: 100% !important; flex-direction: row !important; align-items: center !important;
    padding: 10px 12px !important; border-right: none !important; border-bottom: 1px solid var(--border) !important;
    gap: 14px !important; overflow-x: auto; }
  .brand-block { flex-shrink: 0; }
  .nav-list { flex-direction: row !important; gap: 4px !important; }
  .nav-list button span { display: none; }
  .nav-list button { padding: 9px !important; }
  .backup-block { flex-direction: row !important; margin-top: 0 !important; border-top: none !important; padding-top: 0 !important; margin-left: auto; }
  .backup-block span { display: none; }
  .backup-block button, .backup-block label { padding: 9px !important; }
  .main-content { width: 100%; }
  .page { padding: 20px 16px 48px !important; }
  .page-header-row { flex-direction: column !important; align-items: flex-start !important; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .two-col { grid-template-columns: 1fr !important; }
  .building-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; }
}
`;

export const styles = {
  app: { display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" },
  loadingScreen: { minHeight: "100vh", background: "#14171B", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#8B9096", fontFamily: "Inter, sans-serif", fontSize: 14 },
  sidebar: { width: 220, background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "24px 14px", display: "flex", flexDirection: "column", gap: 24, flexShrink: 0 },
  backupBlock: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "1px solid var(--border)" },
  backupBtn: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "transparent", border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer", textAlign: "left" },
  accountBlock: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--border)" },
  accountInfo: { display: "flex", flexDirection: "column", gap: 2 },
  accountName: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  accountRole: { fontSize: 11.5, color: "var(--text-dim)" },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "0 6px" },
  brandMark: { width: 34, height: 34, borderRadius: 8, background: "var(--accent)", color: "#14171B", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 },
  brandText: { display: "flex", flexDirection: "column" },
  brandTitle: { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, lineHeight: 1.2 },
  brandSub: { fontSize: 11, color: "var(--text-dim)" },
  navList: { display: "flex", flexDirection: "column", gap: 2 },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 13.5, fontFamily: "var(--font-body)", cursor: "pointer", textAlign: "left" },
  navItemActive: { background: "var(--surface-2)", color: "var(--text)" },
  main: { flex: 1, overflowY: "auto", minWidth: 0 },
  page: { padding: "32px 36px 60px", maxWidth: 1080, margin: "0 auto" },
  pageHeader: { marginBottom: 28 },
  pageHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 16, flexWrap: "wrap" },
  eyebrow: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6, fontFamily: "var(--font-mono)" },
  h1: { fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" },
  errorBanner: { background: "var(--bad-dim)", color: "#F3E4DE", padding: "10px 20px", fontSize: 13 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 },
  kpiCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 18px" },
  kpiLabel: { fontSize: 12, color: "var(--text-dim)", marginBottom: 8 },
  kpiValue: { fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 },
  kpiSuffix: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  globalYieldBlock: { background: "var(--surface-2)", borderRadius: 10, padding: "16px 18px", marginBottom: 16 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 },
  cardTitle: { fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 14 },
  typeRows: { display: "flex", flexDirection: "column", gap: 10 },
  typeRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 },
  typeRowLabel: { flex: 1, color: "var(--text-dim)" },
  typeRowValue: { fontFamily: "var(--font-mono)", fontSize: 14 },
  divider: { height: 1, background: "var(--border)", margin: "12px 0" },
  emptyNote: { fontSize: 13, color: "var(--text-dim)", padding: "8px 0" },
  unpaidList: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 },
  unpaidItem: { display: "flex", gap: 10, alignItems: "flex-start" },
  unpaidName: { fontSize: 13.5 },
  unpaidMeta: { fontSize: 11.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" },
  primaryBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "#14171B", border: "none", borderRadius: 7, padding: "9px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" },
  secondaryBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", marginTop: 12 },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", color: "var(--accent)", border: "1px solid var(--accent-dim)", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", flexShrink: 0 },
  emptyState: { border: "1px dashed var(--border)", borderRadius: 12, padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" },
  emptyStateTitle: { fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginTop: 6 },
  emptyStateSub: { fontSize: 13, color: "var(--text-dim)", maxWidth: 360 },
  buildingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  buildingCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, transition: "border-color 0.15s" },
  buildingCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  buildingIconWrap: { width: 40, height: 40, borderRadius: 9, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  buildingCardActions: { display: "flex", gap: 6 },
  buildingName: { fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginTop: 4 },
  buildingMeta: { fontSize: 12, color: "var(--text-dim)" },
  buildingStock: { fontSize: 12.5, color: "var(--accent)", fontFamily: "var(--font-mono)", display: "flex", gap: 6, marginTop: 4 },
  buildingDot: { color: "var(--text-dim)" },
  buildingDetailHead: { display: "flex", gap: 14, alignItems: "flex-start" },
  buildingAddress: { fontSize: 13, color: "var(--text-dim)", marginTop: 4 },
  yieldBadge: { display: "inline-block", marginTop: 8, fontSize: 12, color: "var(--good)", fontFamily: "var(--font-mono)", background: "var(--surface-2)", padding: "3px 9px", borderRadius: 6 },
  expensesSection: { marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--border)" },
  expensesTotal: { fontSize: 13, color: "var(--accent)", fontFamily: "var(--font-mono)", marginTop: 10, textAlign: "right" },
  receiptPreview: { display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-2)", borderRadius: 8, padding: 14, marginBottom: 4 },
  receiptRow: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  letterTextarea: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: 10, color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font-body)", width: "100%", resize: "vertical", marginTop: 8, marginBottom: 4 },
  downloadNote: { fontSize: 12, color: "var(--good)", background: "var(--surface-2)", padding: "8px 10px", borderRadius: 6, marginTop: 4 },
  tierSelector: { display: "flex", gap: 6, margin: "8px 0" },
  tierBtn: { flex: 1, padding: "8px 6px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)" },
  tierBtnActive: { borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(198,161,91,0.12)" },
  sendRow: { display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" },
  sendLink: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--accent)", border: "1px solid var(--accent-dim)", borderRadius: 7, padding: "7px 12px", textDecoration: "none" },
  sendLinkDisabled: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 12px" },
  backLink: { display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 18, fontFamily: "var(--font-body)" },
  groupHeading: { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "baseline", gap: 6 },
  groupCount: { fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontWeight: 400 },
  propList: { display: "flex", flexDirection: "column", gap: 10 },
  propCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" },
  propHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer" },
  propHeadLeft: { display: "flex", alignItems: "center", gap: 10 },
  propHeadActions: { display: "flex", gap: 6 },
  propName: { fontSize: 14.5, fontWeight: 600 },
  propMeta: { fontSize: 12, color: "var(--text-dim)", marginTop: 2 },
  unitsWrap: { padding: "0 16px 16px", borderTop: "1px solid var(--border)" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 },
  th: { textAlign: "left", padding: "6px 10px", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" },
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" },
  tagGood: { display: "inline-flex", alignItems: "center", gap: 4, color: "var(--good)", fontSize: 12 },
  tagBad: { display: "inline-flex", alignItems: "center", gap: 4, color: "var(--bad)", fontSize: 12 },
  statusBtn: { background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" },
  statusBtnGood: { borderColor: "var(--good)" },
  statusBtnBad: { borderColor: "var(--bad-dim)" },
  dupBanner: { display: "flex", gap: 10, alignItems: "flex-start", background: "var(--bad-dim)", color: "#F3E4DE", fontSize: 12.5, padding: "10px 14px", borderRadius: 8, marginBottom: 18 },
  linkBtn: { background: "none", border: "none", padding: 0, color: "#F3E4DE", textDecoration: "underline", cursor: "pointer", font: "inherit" },
  dupRow: { background: "rgba(193,91,68,0.10)" },
  dupMarker: { color: "var(--bad)" },
  iconBtn: { background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", cursor: "pointer" },
  yearSwitcher: { display: "flex", alignItems: "center", gap: 10 },
  yearBtn: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, width: 30, height: 30, color: "var(--text)", cursor: "pointer" },
  yearLabel: { fontFamily: "var(--font-mono)", fontSize: 15, minWidth: 42, textAlign: "center" },
  ledgerScroll: { overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" },
  ledgerTable: { borderCollapse: "collapse", width: "100%", minWidth: 760 },
  ledgerHeadCell: { textAlign: "left", padding: "10px 14px", fontSize: 11, color: "var(--text-dim)", position: "sticky", left: 0, background: "var(--surface)", borderBottom: "1px solid var(--border)", minWidth: 180 },
  ledgerMonthHead: { fontSize: 11, color: "var(--text-dim)", padding: "10px 4px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)" },
  ledgerRowLabel: { padding: "10px 14px", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, background: "var(--surface)" },
  ledgerTenant: { fontSize: 13, fontWeight: 500 },
  ledgerUnit: { fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" },
  ledgerCell: { textAlign: "center", padding: "8px 4px", borderBottom: "1px solid var(--border)" },
  ledgerDot: { width: 16, height: 16, borderRadius: 4, border: "none" },
  legend: { display: "flex", gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-dim)" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 },
  modal: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, width: 420, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 12px", flexShrink: 0, borderBottom: "1px solid var(--border)" },
  modalBody: { padding: "14px 22px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4, minHeight: 0 },
  modalTitle: { fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 },
  field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 12, flex: 1 },
  fieldLabel: { fontSize: 12, color: "var(--text-dim)" },
  fieldRow: { display: "flex", gap: 12 },
  input: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 11px", color: "var(--text)", fontSize: 13.5, fontFamily: "var(--font-body)", width: "100%" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 22px 18px", flexShrink: 0, borderTop: "1px solid var(--border)" },
  formError: { background: "var(--bad-dim)", color: "#F3E4DE", fontSize: 12.5, padding: "8px 10px", borderRadius: 6, marginTop: 6 },
  confirmRow: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--text)", marginTop: 10, cursor: "pointer" },
  bulkPreview: { fontSize: 12.5, color: "var(--accent)", background: "var(--surface-2)", padding: "8px 10px", borderRadius: 6, marginTop: 2, marginBottom: 8, fontFamily: "var(--font-mono)" },

  // --- Ajouts pour le module "Suivi chantiers" ---
  // Additifs uniquement : aucune des clés ci-dessus n'est modifiée. Réutilise
  // les tokens de couleur déjà définis dans le bloc :root (fontImport) —
  // aucune nouvelle variable CSS n'a été nécessaire, y compris pour le ton
  // "warn" (mappé sur --accent, déjà un doré/ambre qui porte bien un sens
  // d'avertissement dans cette palette).
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 },

  progressTrack: { height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", flex: 1 },
  progressFill: (pct, color) => ({
    height: "100%",
    width: `${Math.max(0, Math.min(100, pct))}%`,
    background: color || "var(--accent)",
    borderRadius: 999,
  }),

  badge: (tone) => {
    const tones = {
      good: { bg: "var(--surface-2)", fg: "var(--good)" },
      bad: { bg: "var(--bad-dim)", fg: "var(--bad)" },
      warn: { bg: "var(--surface-2)", fg: "var(--accent)" },
      neutral: { bg: "var(--surface-2)", fg: "var(--text-dim)" },
    };
    const t = tones[tone] || tones.neutral;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11.5,
      fontWeight: 600,
      padding: "3px 9px",
      borderRadius: 999,
      background: t.bg,
      color: t.fg,
    };
  },

  photoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 },
  photoCard: { position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-2)" },
  photoImg: { width: "100%", height: 110, objectFit: "cover", display: "block" },
  photoCaption: { fontSize: 11, color: "var(--text-dim)", padding: "6px 8px" },
};
