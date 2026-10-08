// Emails de rapport de l'Assistant :
// - rapport quotidien (8 h) : résumé + PDF + Excel + sauvegarde complète (.zip) ;
// - email de mise à jour après des changements (paiements enregistrés, biens
//   modifiés), regroupés : il part 10 minutes après le dernier changement,
//   et au plus tard 1 heure après le premier.
const { zipSync, strToU8 } = require("fflate");
const { pool } = require("../db");
const { computeInsights, fmt } = require("./insights");
const { buildReportPdf } = require("./report-pdf");
const { buildReportExcel } = require("./report-excel");
const { emailConfigured, sendEmail } = require("../email");

const APP_URL = process.env.PUBLIC_URL || "https://portefeuille-immobilier.onrender.com";
const DEFAULT_SETTINGS = { recipients: [], daily: true, onChange: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function getSettings() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'email_reports'");
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}) };
}

async function saveSettings(input) {
  const recipients = [...new Set((input.recipients || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e) || e.length > 200);
  if (invalid.length) throw Object.assign(new Error(`Adresse invalide : ${invalid.join(", ")}`), { status: 400 });
  if (recipients.length > 10) throw Object.assign(new Error("10 destinataires maximum."), { status: 400 });
  const value = { recipients, daily: input.daily !== false, onChange: input.onChange !== false };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('email_reports', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)]
  );
  return value;
}

async function loadPortfolio() {
  const { rows } = await pool.query("SELECT data FROM portfolio WHERE id = 1");
  return rows[0]?.data || { properties: [], payments: {}, expenses: [] };
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function monthsText(months) {
  const short = (p) => `${MOIS_COURTS[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;
  return months.length === 1 ? short(months[0]) : `${months.length} mois, depuis ${short(months[months.length - 1])}`;
}

// Corps HTML du rapport (styles en ligne : seuls compatibles avec les messageries).
function reportHtml(ins, { title, intro, changes = [] }) {
  const m = ins.month;
  const kpi = (label, value, color = "#17191C") =>
    `<td style="padding:12px 14px;border:1px solid #E5E3DD;border-radius:8px;background:#fff;width:25%">
       <div style="font-size:12px;color:#686D74">${label}</div>
       <div style="font-size:18px;font-weight:700;color:${color};margin-top:4px">${value}</div></td>`;
  const late = ins.collections.slice(0, 15).map((c) => `
      <tr><td style="padding:7px 8px;border-bottom:1px solid #EEE;color:${c.tier.level >= 2 ? "#B8432D" : "#8C6A2B"};font-size:12px">${esc(c.tier.label)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEE;font-weight:600">${esc(c.tenant)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEE;color:#686D74;font-size:12px">${esc(c.propertyName)} · ${esc(monthsText(c.units[0].months))}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEE;text-align:right;white-space:nowrap">${fmt(c.amount)}</td></tr>`).join("");
  const leases = [
    ...ins.leaseEnds.map((l) => `<li>${esc(l.tenant)} (${esc(l.propertyName)}, ${esc(l.unit)}) : ${l.days < 0 ? `bail expiré depuis ${-l.days} j` : `fin de bail dans ${l.days} j`}</li>`),
    ...ins.revisions.map((r) => `<li>${esc(r.tenant)} (${esc(r.propertyName)}, ${esc(r.unit)}) : révision ${r.eligible ? "possible" : `dans ${r.days} j`}, jusqu'à ${fmt(r.newRentMax)}</li>`),
  ].join("");
  const changeList = changes.length
    ? `<h3 style="font-size:15px;margin:22px 0 8px">Changements</h3><ul style="padding-left:18px;margin:0;color:#17191C;font-size:13px;line-height:1.6">${changes.slice(0, 40).map((c) => `<li>${esc(c)}</li>`).join("")}${changes.length > 40 ? `<li>… et ${changes.length - 40} autre(s)</li>` : ""}</ul>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F6F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#17191C">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px">
    <div style="height:4px;background:#8C6A2B;border-radius:4px"></div>
    <div style="font-size:11px;letter-spacing:1px;color:#8C6A2B;font-weight:700;margin-top:18px">EXTRANET — GROUPE IMMOBILIER</div>
    <h1 style="font-size:22px;margin:6px 0 4px">${esc(title)}</h1>
    <p style="color:#686D74;margin:0 0 18px;font-size:14px">${esc(intro)}</p>
    <table role="presentation" cellspacing="6" style="width:100%;border-collapse:separate"><tr>
      ${kpi(`Encaissé · ${esc(ins.periodLabel)}`, fmt(m.collected), "#2C7A4B")}
      ${kpi("Reste à encaisser", fmt(m.remaining))}
      ${kpi("Locataires en retard", String(ins.collections.length), ins.collections.length ? "#B8432D" : "#2C7A4B")}
      ${kpi("Arriérés", fmt(ins.arrearsTotal))}
    </tr></table>
    ${changeList}
    <h3 style="font-size:15px;margin:22px 0 8px">Retards${ins.collections.length > 15 ? ` (15 sur ${ins.collections.length}, liste complète dans l'Excel)` : ""}</h3>
    ${ins.collections.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #E5E3DD">${late}</table>` : `<p style="color:#2C7A4B">Aucun retard.</p>`}
    <h3 style="font-size:15px;margin:22px 0 8px">Baux et révisions</h3>
    ${leases ? `<ul style="padding-left:18px;margin:0;font-size:13px;line-height:1.6">${leases}</ul>` : `<p style="color:#686D74;font-size:13px;margin:0">Rien à signaler${ins.dataQuality.noLeaseStartCount ? ` (${ins.dataQuality.noLeaseStartCount} local(aux) sans dates de bail ne peuvent pas être surveillés)` : ""}.</p>`}
    <p style="margin:26px 0 8px"><a href="${APP_URL}/?section=assistant" style="background:#17191C;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Ouvrir l'extranet</a></p>
    <p style="color:#9A9EA4;font-size:12px;line-height:1.5;margin-top:22px">Pièces jointes : rapport PDF, classeur Excel (locaux, paiements de l'année, retards, échéances) et sauvegarde complète des données (.zip, à décompresser puis à charger avec « Importer » dans Suivi loyers en cas de besoin).</p>
  </div></body></html>`;
}

async function buildAttachments(data, ins, { pdf } = {}) {
  const day = ins.generatedAt.slice(0, 10);
  const backupJson = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
  const zip = Buffer.from(zipSync({ [`portefeuille-sauvegarde-${day}.json`]: strToU8(backupJson) }, { level: 6 }));
  const files = [
    { name: `portefeuille-${day}.xlsx`, content: buildReportExcel(data, ins) },
    { name: `portefeuille-sauvegarde-${day}.zip`, content: zip },
  ];
  if (pdf !== false) files.unshift({ name: `rapport-${day}.pdf`, content: pdf || (await buildReportPdf(ins)) });
  return files;
}

// Rapport complet. `force` ignore le réglage « daily » (bouton d'envoi manuel).
async function sendDailyReport({ pdf, force = false } = {}) {
  if (!emailConfigured()) return { sent: false, reason: "not-configured" };
  const settings = await getSettings();
  if (!settings.recipients.length) return { sent: false, reason: "no-recipients" };
  if (!settings.daily && !force) return { sent: false, reason: "disabled" };
  const data = await loadPortfolio();
  const ins = computeInsights(data);
  const date = new Date(ins.generatedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Casablanca" });
  await sendEmail({
    to: settings.recipients,
    subject: `Rapport du ${date} — ${fmt(ins.month.collected)} encaissés, ${ins.collections.length} en retard`,
    html: reportHtml(ins, { title: "Rapport quotidien", intro: `Le point sur le portefeuille, ${date}.` }),
    text: `Encaissé (${ins.periodLabel}) : ${fmt(ins.month.collected)} sur ${fmt(ins.month.expected)}. Locataires en retard : ${ins.collections.length} (${fmt(ins.arrearsTotal)}). Détails en pièces jointes.`,
    attachments: await buildAttachments(data, ins, { pdf }),
  });
  return { sent: true, recipients: settings.recipients.length };
}

// --- Changements regroupés ---
const QUIET_MS = Number(process.env.EMAIL_QUIET_MS) || 10 * 60 * 1000;
const MAX_WAIT_MS = 60 * 60 * 1000;
let pending = [];
let firstAt = 0;
let timer = null;

function recordChange(text) {
  if (!emailConfigured()) return;
  pending.push(text);
  if (!firstAt) firstAt = Date.now();
  clearTimeout(timer);
  const wait = Math.max(0, Math.min(QUIET_MS, firstAt + MAX_WAIT_MS - Date.now()));
  timer = setTimeout(() => flushChanges().catch((err) => console.error("[emails] Échec de l'email de mise à jour :", err.message)), wait);
  timer.unref?.();
}

async function flushChanges() {
  const changes = pending;
  pending = [];
  firstAt = 0;
  if (!changes.length) return { sent: false };
  const settings = await getSettings();
  if (!settings.onChange || !settings.recipients.length) return { sent: false };
  const data = await loadPortfolio();
  const ins = computeInsights(data);
  await sendEmail({
    to: settings.recipients,
    subject: `Mise à jour du portefeuille — ${changes.length} changement(s)`,
    html: reportHtml(ins, { title: "Mise à jour du portefeuille", intro: "Des changements viennent d'être enregistrés dans l'extranet.", changes }),
    text: changes.join("\n"),
    attachments: await buildAttachments(data, ins, { pdf: false }),
  });
  return { sent: true };
}

module.exports = { getSettings, saveSettings, sendDailyReport, recordChange, flushChanges, emailConfigured };
