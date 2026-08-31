const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, getAccessibleLotIds } = require("../access");

const router = express.Router();

router.use(requireAuth, async (req, res, next) => {
  req.chantierRole = await getChantierRole(req.user);
  if (!req.chantierRole) return res.status(403).json({ error: "Accès au module Chantiers non autorisé." });
  next();
});

async function checkLotAccess(user, lotId) {
  const { rows } = await pool.query("SELECT chantier_id FROM lots WHERE id = $1", [lotId]);
  const lot = rows[0];
  if (!lot) return { ok: false, status: 404, error: "Lot introuvable." };
  const accessibleLotIds = await getAccessibleLotIds(user, lot.chantier_id);
  if (accessibleLotIds !== null && !accessibleLotIds.includes(lotId)) {
    return { ok: false, status: 403, error: "Accès non autorisé à ce lot." };
  }
  return { ok: true, chantierId: lot.chantier_id };
}

router.get("/lots/:lotId/avancement", async (req, res) => {
  const lotId = Number(req.params.lotId);
  const access = await checkLotAccess(req.user, lotId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { rows } = await pool.query(
    `SELECT a.*, u.name AS created_by_name FROM avancement_entries a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE lot_id = $1 ORDER BY created_at DESC`,
    [lotId]
  );
  res.json({ entries: rows });
});

router.post("/lots/:lotId/avancement", async (req, res) => {
  const lotId = Number(req.params.lotId);
  if (req.chantierRole === "direction") {
    return res.status(403).json({ error: "La direction a un accès en lecture seule." });
  }
  const access = await checkLotAccess(req.user, lotId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { percentage, comment } = req.body || {};
  const pct = Number(percentage);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: "Le pourcentage doit être entre 0 et 100." });
  }

  const { rows } = await pool.query(
    `INSERT INTO avancement_entries (lot_id, percentage, comment, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [lotId, pct, comment || "", req.user.id]
  );
  res.status(201).json({ entry: rows[0] });
});

module.exports = router;
