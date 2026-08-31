const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

// Toutes les routes de ce fichier sont réservées à l'admin.
router.use(requireAuth, requireAdmin);

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, username, role, active, created_at FROM users ORDER BY created_at ASC"
  );
  res.json({ users: rows });
});

router.post("/", async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name?.trim() || !username?.trim() || !password || !["admin", "employe"].includes(role)) {
    return res.status(400).json({ error: "Nom, identifiant, mot de passe et rôle (admin/employe) requis." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, username, role, active, created_at`,
      [name.trim(), username.trim(), hash, role]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Cet identifiant est déjà utilisé." });
    }
    throw err;
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, active, password } = req.body || {};

  if (id === req.user.id && (active === false || (role && role !== "admin"))) {
    return res.status(400).json({ error: "Tu ne peux pas retirer tes propres droits admin ou désactiver ton propre compte." });
  }

  const fields = [];
  const values = [];
  let i = 1;

  if (typeof name === "string" && name.trim()) { fields.push(`name = $${i++}`); values.push(name.trim()); }
  if (role && ["admin", "employe"].includes(role)) { fields.push(`role = $${i++}`); values.push(role); }
  if (typeof active === "boolean") { fields.push(`active = $${i++}`); values.push(active); }
  if (typeof password === "string" && password) {
    if (password.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
    const hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash = $${i++}`);
    values.push(hash);
  }

  if (!fields.length) return res.status(400).json({ error: "Aucune modification fournie." });

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, name, username, role, active, created_at`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte." });
  }
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  res.json({ ok: true });
});

// --- Accès au module Chantiers (indépendant du rôle Loyers ci-dessus) ---

const CHANTIER_ROLES = ["admin", "direction", "chef_chantier", "sous_traitant"];

router.get("/:id/module-access", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT role FROM module_access WHERE user_id = $1 AND module = 'chantiers'",
    [Number(req.params.id)]
  );
  res.json({ role: rows[0]?.role || null });
});

router.put("/:id/module-access", async (req, res) => {
  const id = Number(req.params.id);
  const { module, role } = req.body || {};
  if (module !== "chantiers") {
    return res.status(400).json({ error: "Module inconnu." });
  }
  if (role === null) {
    await pool.query("DELETE FROM module_access WHERE user_id = $1 AND module = $2", [id, module]);
    return res.json({ role: null });
  }
  if (!CHANTIER_ROLES.includes(role)) {
    return res.status(400).json({ error: `Rôle invalide (${CHANTIER_ROLES.join("/")} ou null).` });
  }
  await pool.query(
    `INSERT INTO module_access (user_id, module, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, module) DO UPDATE SET role = EXCLUDED.role`,
    [id, module, role]
  );
  res.json({ role });
});

// --- Affectations (quel utilisateur voit/modifie quel chantier ou lot) ---

router.get("/:id/assignments", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.chantier_id, a.lot_id, c.name AS chantier_name, l.name AS lot_name
     FROM assignments a
     JOIN chantiers c ON c.id = a.chantier_id
     LEFT JOIN lots l ON l.id = a.lot_id
     WHERE a.user_id = $1
     ORDER BY a.id ASC`,
    [Number(req.params.id)]
  );
  res.json({ assignments: rows });
});

router.post("/:id/assignments", async (req, res) => {
  const userId = Number(req.params.id);
  const { chantierId, lotId } = req.body || {};
  if (!chantierId) return res.status(400).json({ error: "chantierId requis." });
  try {
    const { rows } = await pool.query(
      `INSERT INTO assignments (user_id, chantier_id, lot_id) VALUES ($1, $2, $3)
       RETURNING id, chantier_id, lot_id`,
      [userId, Number(chantierId), lotId ? Number(lotId) : null]
    );
    res.status(201).json({ assignment: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Cette affectation existe déjà." });
    }
    throw err;
  }
});

router.delete("/:id/assignments/:assignmentId", async (req, res) => {
  await pool.query("DELETE FROM assignments WHERE id = $1 AND user_id = $2", [
    Number(req.params.assignmentId),
    Number(req.params.id),
  ]);
  res.json({ ok: true });
});

module.exports = router;
