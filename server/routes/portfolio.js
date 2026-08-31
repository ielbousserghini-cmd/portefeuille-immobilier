const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { hasLoyersAccess } = require("../access");

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

// Lecture-écriture globale du portefeuille, réservée aux admins : les comptes
// employé n'ont, par construction, jamais accès à cette route en écriture.
router.put("/", requireAuth, requireAdmin, async (req, res) => {
  const { properties, payments, expenses } = req.body || {};
  if (!Array.isArray(properties) || typeof payments !== "object" || !Array.isArray(expenses)) {
    return res.status(400).json({ error: "Format de données invalide." });
  }
  const data = { properties, payments, expenses };
  await pool.query(
    "UPDATE portfolio SET data = $1, updated_at = now() WHERE id = 1",
    [JSON.stringify(data)]
  );
  res.json({ ok: true });
});

module.exports = router;
