const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, getAccessibleChantierIds, getAccessibleLotIds, canSeeBudget } = require("../access");

const router = express.Router();

// Accès au module Chantiers : il faut soit être admin global, soit avoir une
// ligne module_access('chantiers', ...). req.chantierRole est ensuite utilisé
// par toutes les routes ci-dessous pour les vérifications fines.
router.use(requireAuth, async (req, res, next) => {
  req.chantierRole = await getChantierRole(req.user);
  if (!req.chantierRole) return res.status(403).json({ error: "Accès au module Chantiers non autorisé." });
  next();
});

// Liste des chantiers accessibles, avec un avancement global (moyenne des lots).
router.get("/", async (req, res) => {
  const ids = await getAccessibleChantierIds(req.user);
  if (ids.length === 0) return res.json({ chantiers: [] });

  const { rows } = await pool.query(
    `SELECT c.*,
       COALESCE(ROUND(AVG(latest.percentage)), 0) AS avancement_global
     FROM chantiers c
     LEFT JOIN lots l ON l.chantier_id = c.id
     LEFT JOIN LATERAL (
       SELECT percentage FROM avancement_entries
       WHERE lot_id = l.id ORDER BY created_at DESC LIMIT 1
     ) latest ON true
     WHERE c.id = ANY($1::int[])
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [ids]
  );
  res.json({ chantiers: rows });
});

router.post("/", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  const { name, address, description, start_date, planned_end_date } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Le nom du chantier est requis." });
  const { rows } = await pool.query(
    `INSERT INTO chantiers (name, address, description, start_date, planned_end_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name.trim(), address || "", description || "", start_date || null, planned_end_date || null]
  );
  res.status(201).json({ chantier: rows[0] });
});

router.get("/:id", async (req, res) => {
  const chantierId = Number(req.params.id);
  const accessibleIds = await getAccessibleChantierIds(req.user);
  if (!accessibleIds.includes(chantierId)) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }

  const { rows: chantierRows } = await pool.query("SELECT * FROM chantiers WHERE id = $1", [chantierId]);
  const chantier = chantierRows[0];
  if (!chantier) return res.status(404).json({ error: "Chantier introuvable." });

  const accessibleLotIds = await getAccessibleLotIds(req.user, chantierId);

  const { rows: lots } = await pool.query(
    `SELECT l.*,
       COALESCE(latest.percentage, 0) AS avancement,
       latest.created_at AS avancement_updated_at
     FROM lots l
     LEFT JOIN LATERAL (
       SELECT percentage, created_at FROM avancement_entries
       WHERE lot_id = l.id ORDER BY created_at DESC LIMIT 1
     ) latest ON true
     WHERE l.chantier_id = $1
     ORDER BY l.order_index ASC, l.id ASC`,
    [chantierId]
  );
  const visibleLots = accessibleLotIds === null ? lots : lots.filter((l) => accessibleLotIds.includes(l.id));

  res.json({
    chantier,
    lots: visibleLots,
    canSeeBudget: await canSeeBudget(req.user),
    scopedToLots: accessibleLotIds, // null = tous les lots (admin/direction/chef de chantier)
  });
});

router.patch("/:id", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  const id = Number(req.params.id);
  const { name, address, description, start_date, planned_end_date, status } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof name === "string" && name.trim()) { fields.push(`name = $${i++}`); values.push(name.trim()); }
  if (typeof address === "string") { fields.push(`address = $${i++}`); values.push(address); }
  if (typeof description === "string") { fields.push(`description = $${i++}`); values.push(description); }
  if (start_date !== undefined) { fields.push(`start_date = $${i++}`); values.push(start_date || null); }
  if (planned_end_date !== undefined) { fields.push(`planned_end_date = $${i++}`); values.push(planned_end_date || null); }
  if (status && ["en_cours", "termine", "suspendu"].includes(status)) { fields.push(`status = $${i++}`); values.push(status); }
  if (!fields.length) return res.status(400).json({ error: "Aucune modification fournie." });
  values.push(id);
  const { rows } = await pool.query(`UPDATE chantiers SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (!rows[0]) return res.status(404).json({ error: "Chantier introuvable." });
  res.json({ chantier: rows[0] });
});

router.delete("/:id", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  await pool.query("DELETE FROM chantiers WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

// --- Lots ---

router.post("/:id/lots", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  const chantierId = Number(req.params.id);
  const { name, description, order_index } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Le nom du lot est requis." });
  const { rows } = await pool.query(
    `INSERT INTO lots (chantier_id, name, description, order_index) VALUES ($1, $2, $3, $4) RETURNING *`,
    [chantierId, name.trim(), description || "", Number(order_index) || 0]
  );
  res.status(201).json({ lot: rows[0] });
});

router.patch("/lots/:lotId", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  const { name, description, order_index } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof name === "string" && name.trim()) { fields.push(`name = $${i++}`); values.push(name.trim()); }
  if (typeof description === "string") { fields.push(`description = $${i++}`); values.push(description); }
  if (order_index !== undefined) { fields.push(`order_index = $${i++}`); values.push(Number(order_index) || 0); }
  if (!fields.length) return res.status(400).json({ error: "Aucune modification fournie." });
  values.push(Number(req.params.lotId));
  const { rows } = await pool.query(`UPDATE lots SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (!rows[0]) return res.status(404).json({ error: "Lot introuvable." });
  res.json({ lot: rows[0] });
});

router.delete("/lots/:lotId", async (req, res) => {
  if (req.chantierRole !== "admin") return res.status(403).json({ error: "Réservé aux administrateurs du module Chantiers." });
  await pool.query("DELETE FROM lots WHERE id = $1", [Number(req.params.lotId)]);
  res.json({ ok: true });
});

module.exports = router;
