const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, canAccessChantier, canSeeBudget, canWriteBudget } = require("../access");

const router = express.Router();

router.use(requireAuth, async (req, res, next) => {
  req.chantierRole = await getChantierRole(req.user);
  if (!req.chantierRole) return res.status(403).json({ error: "Accès au module Chantiers non autorisé." });
  next();
});

router.get("/chantiers/:chantierId/budget", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  if (!(await canSeeBudget(req.user))) return res.status(403).json({ error: "Accès au budget non autorisé pour ce rôle." });
  if (!(await canAccessChantier(req.user, chantierId))) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }
  const { rows } = await pool.query(
    "SELECT * FROM budget_lines WHERE chantier_id = $1 ORDER BY date DESC NULLS LAST, id DESC",
    [chantierId]
  );
  res.json({ lines: rows });
});

router.post("/chantiers/:chantierId/budget", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  if (!(await canWriteBudget(req.user))) return res.status(403).json({ error: "Seul un admin peut modifier le budget." });

  const { category, label, montant_prevu, montant_reel, date } = req.body || {};
  if (!category?.trim() || !label?.trim()) {
    return res.status(400).json({ error: "Catégorie et libellé requis." });
  }
  const { rows } = await pool.query(
    `INSERT INTO budget_lines (chantier_id, category, label, montant_prevu, montant_reel, date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [chantierId, category.trim(), label.trim(), Number(montant_prevu) || 0, Number(montant_reel) || 0, date || null, req.user.id]
  );
  res.status(201).json({ line: rows[0] });
});

router.patch("/budget/:lineId", async (req, res) => {
  if (!(await canWriteBudget(req.user))) return res.status(403).json({ error: "Seul un admin peut modifier le budget." });
  const { category, label, montant_prevu, montant_reel, date } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof category === "string" && category.trim()) { fields.push(`category = $${i++}`); values.push(category.trim()); }
  if (typeof label === "string" && label.trim()) { fields.push(`label = $${i++}`); values.push(label.trim()); }
  if (montant_prevu !== undefined) { fields.push(`montant_prevu = $${i++}`); values.push(Number(montant_prevu) || 0); }
  if (montant_reel !== undefined) { fields.push(`montant_reel = $${i++}`); values.push(Number(montant_reel) || 0); }
  if (date !== undefined) { fields.push(`date = $${i++}`); values.push(date || null); }
  if (!fields.length) return res.status(400).json({ error: "Aucune modification fournie." });
  values.push(Number(req.params.lineId));
  const { rows } = await pool.query(`UPDATE budget_lines SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (!rows[0]) return res.status(404).json({ error: "Ligne budgétaire introuvable." });
  res.json({ line: rows[0] });
});

router.delete("/budget/:lineId", async (req, res) => {
  if (!(await canWriteBudget(req.user))) return res.status(403).json({ error: "Seul un admin peut modifier le budget." });
  await pool.query("DELETE FROM budget_lines WHERE id = $1", [Number(req.params.lineId)]);
  res.json({ ok: true });
});

module.exports = router;
