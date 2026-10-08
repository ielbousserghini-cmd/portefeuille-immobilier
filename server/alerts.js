// Vérifie les baux qui arrivent à échéance et les révisions de loyer dues,
// et envoie un email récapitulatif si de nouvelles alertes apparaissent
// depuis la dernière vérification. Les mêmes informations restent de toute
// façon visibles dans le Tableau de bord (ceci ajoute juste l'email).
//
// Variables d'environnement nécessaires pour l'envoi d'email (optionnelles —
// sans elles, les alertes sont seulement journalisées côté serveur) :
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL_TO
// Voir README.md, section "Alertes par email".

const LEASE_END_WINDOW_DAYS = 30;
const REVISION_WINDOW_DAYS = 30;
const REVISION_INTERVAL_YEARS = 3;
const MS_PER_DAY = 86400000;

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Construit la liste des alertes actuellement dues, sans toucher à la base.
function computeDueAlerts(portfolioData) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const alerts = [];

  for (const property of portfolioData.properties || []) {
    for (const unit of property.units || []) {
      if (!unit.tenant || !unit.tenant.trim()) continue; // vacant : rien à surveiller
      const unitKey = `${property.id}:${unit.id}`;
      const label = `${unit.name} — ${property.name} (${unit.tenant})`;

      const leaseEnd = parseDate(unit.leaseEnd);
      if (leaseEnd) {
        const daysLeft = daysBetween(today, leaseEnd);
        if (daysLeft <= LEASE_END_WINDOW_DAYS) {
          alerts.push({
            unitKey,
            type: "lease_end",
            dedupeKey: unit.leaseEnd,
            message:
              daysLeft < 0
                ? `Bail expiré depuis ${-daysLeft} j — ${label} (échéance ${unit.leaseEnd})`
                : `Fin de bail dans ${daysLeft} j — ${label} (échéance ${unit.leaseEnd})`,
          });
        }
      }

      const refDateStr = unit.lastRevisionDate || unit.leaseStart;
      const refDate = parseDate(refDateStr);
      if (refDate) {
        const dueDate = addYears(refDate, REVISION_INTERVAL_YEARS);
        const daysLeft = daysBetween(today, dueDate);
        if (daysLeft <= REVISION_WINDOW_DAYS) {
          const dueDateStr = dueDate.toISOString().slice(0, 10);
          alerts.push({
            unitKey,
            type: "revision",
            dedupeKey: dueDateStr,
            message:
              daysLeft < 0
                ? `Révision de loyer possible depuis ${-daysLeft} j — ${label} (loyer actuel ${unit.rent} DH)`
                : `Révision de loyer possible dans ${daysLeft} j — ${label} (loyer actuel ${unit.rent} DH)`,
          });
        }
      }
    }
  }
  return alerts;
}

async function filterUnseen(pool, alerts) {
  const unseen = [];
  for (const a of alerts) {
    const { rows } = await pool.query(
      "SELECT 1 FROM alert_log WHERE unit_key = $1 AND alert_type = $2 AND dedupe_key = $3",
      [a.unitKey, a.type, a.dedupeKey]
    );
    if (rows.length === 0) unseen.push(a);
  }
  return unseen;
}

async function markSeen(pool, alerts) {
  for (const a of alerts) {
    await pool.query(
      `INSERT INTO alert_log (unit_key, alert_type, dedupe_key) VALUES ($1, $2, $3)
       ON CONFLICT (unit_key, alert_type, dedupe_key) DO NOTHING`,
      [a.unitKey, a.type, a.dedupeKey]
    );
  }
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ALERT_EMAIL_TO);
}

async function sendAlertEmail(alerts) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const lines = alerts.map((a) => `- ${a.message}`).join("\n");
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ALERT_EMAIL_TO,
    subject: `Portefeuille immobilier — ${alerts.length} alerte(s) bail/loyer`,
    text: `Nouvelles alertes sur l'extranet :\n\n${lines}\n\nDétails et actions depuis le Tableau de bord de l'application.`,
  });
}

// Fonction principale, appelée au démarrage, périodiquement, et depuis la
// route manuelle /api/alerts/check-now. Ne lève jamais d'exception (toute
// erreur est journalisée) pour ne jamais faire planter le planificateur.
async function checkAndSendAlerts(pool) {
  try {
    const { rows } = await pool.query("SELECT data FROM portfolio WHERE id = 1");
    const data = rows[0]?.data || { properties: [] };
    const due = computeDueAlerts(data);
    const unseen = await filterUnseen(pool, due);

    if (unseen.length === 0) {
      return { checked: due.length, newAlerts: 0, emailSent: false };
    }

    // Notification sur les téléphones abonnés (Assistant → « Sur ton
    // téléphone »), en plus de l'email si SMTP est configuré. Note : le plan
    // gratuit de Render bloque l'envoi SMTP ; le push, lui, fonctionne.
    const { notify } = require("./push");
    const push = await notify({
      pref: "alerts",
      payload: {
        title: `${unseen.length} alerte(s) bail / loyer`,
        body: unseen.slice(0, 3).map((a) => a.message).join(" · ") + (unseen.length > 3 ? " …" : ""),
        url: "/?section=assistant",
        tag: "alerts",
      },
    });

    let emailSent = false;
    if (smtpConfigured()) {
      await sendAlertEmail(unseen);
      emailSent = true;
    }

    if (!emailSent && !push.sent) {
      console.log(
        `[alerts] ${unseen.length} nouvelle(s) alerte(s) bail/loyer (ni email ni téléphone configuré) :\n` +
          unseen.map((a) => `  - ${a.message}`).join("\n")
      );
      // Pas de marquage "vu" : l'alerte partira dès qu'un canal sera configuré.
      return { checked: due.length, newAlerts: unseen.length, emailSent: false, pushSent: 0 };
    }

    await markSeen(pool, unseen);
    console.log(`[alerts] ${unseen.length} nouvelle(s) alerte(s) envoyée(s) (email : ${emailSent ? "oui" : "non"}, téléphones : ${push.sent}).`);
    return { checked: due.length, newAlerts: unseen.length, emailSent, pushSent: push.sent };
  } catch (err) {
    console.error("[alerts] Échec de la vérification des alertes :", err);
    return { checked: 0, newAlerts: 0, emailSent: false, error: err.message };
  }
}

module.exports = { checkAndSendAlerts, computeDueAlerts, smtpConfigured };
