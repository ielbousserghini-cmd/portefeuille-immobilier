const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { checkAndSendAlerts } = require("../alerts");

const router = express.Router();

// Déclenche une vérification immédiate (en plus de la vérification
// périodique automatique) — utilisé notamment quand un admin ouvre le
// Tableau de bord, pour limiter l'effet de la mise en veille de Render.
router.post("/alerts/check-now", requireAuth, requireAdmin, async (req, res) => {
  const result = await checkAndSendAlerts(pool);
  res.json(result);
});

module.exports = router;
