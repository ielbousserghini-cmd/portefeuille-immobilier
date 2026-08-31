const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, canAccessChantier, getAccessibleLotIds, canWritePlanning } = require("../access");

const router = express.Router();

router.use(requireAuth, async (req, res, next) => {
  req.chantierRole = await getChantierRole(req.user);
  if (!req.chantierRole) return res.status(403).json({ error: "Accès au module Chantiers non autorisé." });
  next();
});

router.get("/chantiers/:chantierId/planning", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  if (!(await canAccessChantier(req.user, chantierId))) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }
  const accessibleLotIds = await getAccessibleLotIds(req.user, chantierId);
  const { rows } = await pool.query(
    "SELECT * FROM planning_tasks WHERE chantier_id = $1 ORDER BY order_index ASC, start_date ASC NULLS LAST",
    [chantierId]
  );
  const visible = accessibleLotIds === null
    ? rows
    : rows.filter((t) => t.lot_id === null || accessibleLotIds.includes(t.lot_id));
  res.json({ tasks: visible });
});

router.post("/chantiers/:chantierId/planning", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  if (!(await canWritePlanning(req.user))) return res.status(403).json({ error: "Modification du planning non autorisée pour ce rôle." });
  const { title, lot_id, start_date, end_date, status, order_index } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: "Le titre de la tâche est requis." });
  const { rows } = await pool.query(
    `INSERT INTO planning_tasks (chantier_id, lot_id, title, start_date, end_date, status, order_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [chantierId, lot_id || null, title.trim(), start_date || null, end_date || null, status || "a_venir", Number(order_index) || 0]
  );
  res.status(201).json({ task: rows[0] });
});

router.patch("/planning/:taskId", async (req, res) => {
  if (!(await canWritePlanning(req.user))) return res.status(403).json({ error: "Modification du planning non autorisée pour ce rôle." });
  const { title, start_date, end_date, status, order_index } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof title === "string" && title.trim()) { fields.push(`title = $${i++}`); values.push(title.trim()); }
  if (start_date !== undefined) { fields.push(`start_date = $${i++}`); values.push(start_date || null); }
  if (end_date !== undefined) { fields.push(`end_date = $${i++}`); values.push(end_date || null); }
  if (status && ["a_venir", "en_cours", "termine", "retard"].includes(status)) { fields.push(`status = $${i++}`); values.push(status); }
  if (order_index !== undefined) { fields.push(`order_index = $${i++}`); values.push(Number(order_index) || 0); }
  if (!fields.length) return res.status(400).json({ error: "Aucune modification fournie." });
  values.push(Number(req.params.taskId));
  const { rows } = await pool.query(`UPDATE planning_tasks SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (!rows[0]) return res.status(404).json({ error: "Tâche introuvable." });
  res.json({ task: rows[0] });
});

router.delete("/planning/:taskId", async (req, res) => {
  if (!(await canWritePlanning(req.user))) return res.status(403).json({ error: "Modification du planning non autorisée pour ce rôle." });
  await pool.query("DELETE FROM planning_tasks WHERE id = $1", [Number(req.params.taskId)]);
  res.json({ ok: true });
});

module.exports = router;
