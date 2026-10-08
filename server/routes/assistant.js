const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { computeInsights, briefingNotification } = require("../agents/insights");
const { buildReportPdf } = require("../agents/report-pdf");
const { getVapidKeys, saveSubscription, notify } = require("../push");

const router = express.Router();
const TZ = "Africa/Casablanca";
const BRIEFING_HOUR = 8; // heure locale à partir de laquelle le briefing part

function localDate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ }); // AAAA-MM-JJ
}
function localHour(now = new Date()) {
  return Number(now.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
}

async function loadPortfolio() {
  const { rows } = await pool.query("SELECT data FROM portfolio WHERE id = 1");
  return rows[0]?.data || { properties: [], payments: {}, expenses: [] };
}

// Passage quotidien des agents : analyse, archive du résumé, notification du
// briefing. Une seule fois par jour (clé = date locale), sauf `force`.
async function runDaily({ force = false } = {}) {
  const day = localDate();
  const portfolio = await loadPortfolio();
  const insights = computeInsights(portfolio);
  const summary = {
    month: insights.month,
    arrearsTotal: insights.arrearsTotal,
    lateTenants: insights.collections.length,
    tiers: insights.collections.reduce((acc, t) => { acc[t.tier.level] = (acc[t.tier.level] || 0) + 1; return acc; }, {}),
    leaseEnds: insights.leaseEnds.length,
    revisions: insights.revisions.length,
  };
  const pdf = await buildReportPdf(insights);
  const { rowCount } = await pool.query(
    force
      ? `INSERT INTO agent_runs (run_date, summary, pdf, snapshot) VALUES ($1, $2, $3, $4)
         ON CONFLICT (run_date) DO UPDATE SET summary = EXCLUDED.summary, pdf = EXCLUDED.pdf, snapshot = EXCLUDED.snapshot, created_at = now()`
      : "INSERT INTO agent_runs (run_date, summary, pdf, snapshot) VALUES ($1, $2, $3, $4) ON CONFLICT (run_date) DO NOTHING",
    [day, JSON.stringify(summary), pdf, JSON.stringify({ ...portfolio, exportedAt: new Date().toISOString() })]
  );
  if (!rowCount) return { ran: false, reason: "Déjà passé aujourd'hui.", day };
  // Rotation : on garde 90 jours de sauvegardes et de rapports.
  await pool.query("DELETE FROM agent_runs WHERE run_date < CURRENT_DATE - INTERVAL '90 days'");
  const n = briefingNotification(insights);
  const push = await notify({ pref: "briefing", payload: { ...n, body: `${n.body} · Rapport PDF prêt.`, url: "/?section=assistant", tag: "briefing" } });
  return { ran: true, day, summary, push };
}

// Planificateur interne : tant que le serveur est éveillé, vérifie toutes les
// heures si le briefing du jour est parti (Render met le service en veille ;
// le workflow GitHub .github/workflows/assistant-daily.yml le réveille chaque
// matin et appelle /api/assistant/run-daily).
function startScheduler() {
  const tick = () => {
    if (localHour() >= BRIEFING_HOUR) runDaily().catch((err) => console.error("[assistant] Échec du passage quotidien :", err));
  };
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000);
}

// --- Briefing en direct (page Assistant) ---
router.get("/assistant/insights", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const insights = computeInsights(await loadPortfolio());
    const { rows } = await pool.query("SELECT run_date, created_at FROM agent_runs ORDER BY run_date DESC LIMIT 1");
    res.json({ insights, lastRun: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// --- Rapports PDF ---
// Sans date : rapport généré à l'instant. Avec ?date=AAAA-MM-JJ : le rapport
// archivé ce jour-là par le passage automatique des agents.
router.get("/assistant/report.pdf", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    let pdf;
    let day = localDate();
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) return res.status(400).json({ error: "Date invalide." });
      const { rows } = await pool.query("SELECT pdf FROM agent_runs WHERE run_date = $1 AND pdf IS NOT NULL", [req.query.date]);
      if (!rows[0]) return res.status(404).json({ error: "Aucun rapport archivé pour cette date." });
      pdf = rows[0].pdf;
      day = req.query.date;
    } else {
      pdf = await buildReportPdf(computeInsights(await loadPortfolio()));
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="rapport-${day}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// Sauvegarde complète d'un jour, au format du bouton « Importer ».
router.get("/assistant/backup.json", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ""))) return res.status(400).json({ error: "Date invalide." });
    const { rows } = await pool.query("SELECT snapshot FROM agent_runs WHERE run_date = $1 AND snapshot IS NOT NULL", [req.query.date]);
    if (!rows[0]) return res.status(404).json({ error: "Aucune sauvegarde pour cette date." });
    res.setHeader("Content-Disposition", `attachment; filename="portefeuille-sauvegarde-${req.query.date}.json"`);
    res.json(rows[0].snapshot);
  } catch (err) {
    next(err);
  }
});

router.get("/assistant/reports", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT to_char(run_date, 'YYYY-MM-DD') AS date, summary, snapshot IS NOT NULL AS has_backup FROM agent_runs WHERE pdf IS NOT NULL ORDER BY run_date DESC LIMIT 90"
    );
    res.json({ reports: rows });
  } catch (err) {
    next(err);
  }
});

// --- Déclencheur quotidien ---
// Appelé par le workflow GitHub chaque matin. Si CRON_SECRET est défini sur
// le serveur, l'en-tête x-cron-secret doit correspondre ; sinon la route reste
// ouverte, sans risque : elle ne renvoie aucune donnée et ne fait rien de plus
// qu'une fois par jour. Un admin connecté peut forcer un nouveau passage.
router.post("/assistant/run-daily", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    const force = req.query.force === "1";
    if (force) {
      return requireAuth(req, res, () => requireAdmin(req, res, async () => {
        try { res.json(await runDaily({ force: true })); } catch (err) { next(err); }
      }));
    }
    if (secret && req.get("x-cron-secret") !== secret) {
      return res.status(403).json({ error: "Accès refusé." });
    }
    // Sans secret configuré, un appel anonyme ne peut pas avancer le briefing
    // au milieu de la nuit.
    if (!secret && localHour() < BRIEFING_HOUR - 1) {
      return res.json({ ran: false, reason: "Trop tôt." });
    }
    const result = await runDaily();
    res.json({ ran: result.ran, day: result.day });
  } catch (err) {
    next(err);
  }
});

// --- Notifications push ---
router.get("/push/public-key", requireAuth, async (req, res, next) => {
  try {
    const { publicKey } = await getVapidKeys();
    res.json({ publicKey });
  } catch (err) {
    next(err);
  }
});

router.post("/push/subscribe", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const saved = await saveSubscription(req.user.id, req.body?.subscription, req.get("user-agent"));
    res.json({ ok: true, prefs: saved.prefs });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post("/push/status", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT prefs FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
      [String(req.body?.endpoint || ""), req.user.id]
    );
    res.json({ subscribed: Boolean(rows[0]), prefs: rows[0]?.prefs || null });
  } catch (err) {
    next(err);
  }
});

router.put("/push/prefs", requireAuth, async (req, res, next) => {
  try {
    const p = req.body?.prefs || {};
    const prefs = { briefing: p.briefing !== false, payments: p.payments !== false, alerts: p.alerts !== false };
    const { rowCount } = await pool.query(
      "UPDATE push_subscriptions SET prefs = $1 WHERE endpoint = $2 AND user_id = $3",
      [JSON.stringify(prefs), String(req.body?.endpoint || ""), req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: "Cet appareil n'est pas abonné." });
    res.json({ ok: true, prefs });
  } catch (err) {
    next(err);
  }
});

router.post("/push/unsubscribe", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [String(req.body?.endpoint || ""), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/push/test", requireAuth, async (req, res, next) => {
  try {
    const result = await notify({
      userIds: [req.user.id],
      adminsOnly: false,
      payload: { title: "Extranet", body: `Bonjour ${req.user.name.split(" ")[0]}, les notifications fonctionnent sur cet appareil.`, url: "/?section=assistant", tag: "test" },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, runDaily, startScheduler };
