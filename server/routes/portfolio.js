const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { hasLoyersAccess } = require("../access");
const { notify } = require("../push");
const { recordChange } = require("../agents/report-mail");

const router = express.Router();

// Champs financiers sensibles : jamais envoyés à un compte "employé", même en
// lecture seule. On filtre côté serveur (pas seulement dans l'interface) pour
// qu'ils ne soient pas visibles même en inspectant les requêtes réseau.
const SENSITIVE_PROPERTY_FIELDS = [
  "estimatedValue",
  "valeurLocative",
  "amortissementDuration",
  "meuble",
  "furnitureValue",
  "financingMode",
  "loanAmount",
  "loanRate",
  "loanDuration",
  "loanStartDate",
  "ccaBalance",
  "ccaRate",
];

function stripSensitiveFields(data) {
  const properties = (data.properties || []).map((p) => {
    const clean = { ...p };
    for (const field of SENSITIVE_PROPERTY_FIELDS) delete clean[field];
    return clean;
  });
  return { ...data, properties };
}

router.get("/", requireAuth, async (req, res) => {
  // Un compte "employe" sans accès Loyers (par ex. un chef de chantier
  // Chantiers-only) n'a droit à rien ici, même en lecture — vérifié en base à
  // chaque requête, pas seulement caché côté interface.
  if (!(await hasLoyersAccess(req.user))) {
    return res.status(403).json({ error: "Accès au module Loyers non autorisé." });
  }
  const { rows } = await pool.query("SELECT data FROM portfolio WHERE id = 1");
  const data = rows[0]?.data || { properties: [], payments: {}, expenses: [] };
  const payload = req.user.role === "admin" ? data : stripSensitiveFields(data);
  res.json(payload);
});

// Écriture des biens/locaux/charges, réservée aux admins : les comptes
// employé n'ont, par construction, jamais accès à cette route en écriture.
//
// Les paiements ne sont PAS remplacés par cette route (sauf import d'une
// sauvegarde, replacePayments: true) : ils passent par POST /payments, entrée
// par entrée. Sinon un admin dont la page a été chargée avant qu'un employé
// n'enregistre un paiement effacerait ce paiement à sa prochaine sauvegarde.
router.put("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { properties, payments, expenses, replacePayments } = req.body || {};
    if (!Array.isArray(properties) || !Array.isArray(expenses) || (replacePayments && (typeof payments !== "object" || payments === null))) {
      return res.status(400).json({ error: "Format de données invalide." });
    }
    if (replacePayments) {
      await pool.query(
        "UPDATE portfolio SET data = $1, updated_at = now() WHERE id = 1",
        [JSON.stringify({ properties, payments, expenses })]
      );
      recordChange(`${req.user.name} a importé une sauvegarde complète.`);
    } else {
      recordChange(`${req.user.name} a modifié les biens, locaux ou charges.`);
      await pool.query(
        `UPDATE portfolio
            SET data = jsonb_build_object(
                  'properties', $1::jsonb,
                  'expenses', $2::jsonb,
                  'payments', COALESCE(data->'payments', '{}'::jsonb)
                ),
                updated_at = now()
          WHERE id = 1`,
        [JSON.stringify(properties), JSON.stringify(expenses)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Enregistrement des paiements de loyer, ouvert à tout compte ayant accès au
// module Loyers (admins et employés) — c'est ce qu'utilisent les employés pour
// déclarer qu'un locataire a payé. Corps : { entries: [{ unitId, period, paid, amount }] }.
// Chaque entrée est écrite individuellement dans le JSON (jsonb_set), sans
// toucher au reste du portefeuille. Un employé peut annuler un paiement qu'il
// a lui-même enregistré, pas celui d'un autre ; un admin peut tout modifier.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.post("/payments", requireAuth, async (req, res, next) => {
  try {
    if (!(await hasLoyersAccess(req.user))) {
      return res.status(403).json({ error: "Accès au module Loyers non autorisé." });
    }
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0 || entries.length > 500) {
      return res.status(400).json({ error: "Aucun paiement à enregistrer." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT data FROM portfolio WHERE id = 1 FOR UPDATE");
      const data = rows[0]?.data || {};
      const unitIds = new Set((data.properties || []).flatMap((p) => (p.units || []).map((u) => u.id)));
      const current = data.payments || {};
      const isAdmin = req.user.role === "admin";
      const today = new Date().toISOString().slice(0, 10);
      const result = {};

      for (const e of entries) {
        if (!e || !unitIds.has(e.unitId) || !PERIOD_RE.test(e.period || "")) {
          throw Object.assign(new Error("Local ou mois invalide."), { status: 400 });
        }
        const key = `${e.unitId}|${e.period}`;
        if (e.paid) {
          const entry = {
            paid: true,
            amount: Number(e.amount) || 0,
            datePaid: today,
            markedBy: req.user.name,
            markedById: req.user.id,
          };
          await client.query(
            `UPDATE portfolio
                SET data = jsonb_set(
                      CASE WHEN data ? 'payments' THEN data ELSE data || '{"payments": {}}'::jsonb END,
                      ARRAY['payments', $1::text], $2::jsonb, true),
                    updated_at = now()
              WHERE id = 1`,
            [key, JSON.stringify(entry)]
          );
          result[key] = entry;
        } else {
          const existing = current[key];
          if (existing && !isAdmin && existing.markedById !== req.user.id) {
            throw Object.assign(new Error("Seul un administrateur peut annuler un paiement enregistré par quelqu'un d'autre."), { status: 403 });
          }
          await client.query(
            "UPDATE portfolio SET data = data #- ARRAY['payments', $1::text], updated_at = now() WHERE id = 1",
            [key]
          );
          result[key] = null;
        }
      }
      await client.query("COMMIT");
      res.json({ payments: result });
      notifyPayments(req.user, data, entries.filter((e) => e.paid));
      for (const e of entries.filter((x) => !x.paid)) recordChange(`${req.user.name} a annulé un paiement (${e.period}).`);
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Prévient les admins (sauf l'auteur) sur leur téléphone quand un paiement
// est enregistré — typiquement par un employé. Ne bloque jamais la réponse.
function notifyPayments(user, data, paidEntries) {
  if (!paidEntries.length) return;
  const units = new Map();
  for (const p of data.properties || []) for (const u of p.units || []) units.set(u.id, { ...u, propertyName: p.name });
  const total = paidEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const fmt = (n) => new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(n) + " DH";
  const first = units.get(paidEntries[0].unitId);
  const who = user.name.split(" ")[0];
  const body = paidEntries.length === 1 && first
    ? `${who} a encaissé ${fmt(total)} — ${first.tenant}, ${first.name} (${first.propertyName})`
    : `${who} a encaissé ${paidEntries.length} loyers · ${fmt(total)}${first ? ` (${first.tenant}…)` : ""}`;
  for (const e of paidEntries) {
    const u = units.get(e.unitId);
    recordChange(`${user.name} a encaissé ${fmt(Number(e.amount) || 0)} — ${u ? `${u.tenant}, ${u.name} (${u.propertyName})` : "local inconnu"}, ${e.period}.`);
  }
  notify({ pref: "payments", excludeUserId: user.id, payload: { title: "Loyer encaissé", body, url: "/?section=loyers&tab=encaisser", tag: `pay-${Date.now()}` } })
    .catch(() => {});
}

module.exports = router;
