const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, canAccessChantier, getAccessibleLotIds } = require("../access");

const router = express.Router();

router.use(requireAuth, async (req, res, next) => {
  req.chantierRole = await getChantierRole(req.user);
  if (!req.chantierRole) return res.status(403).json({ error: "Accès au module Chantiers non autorisé." });
  next();
});

router.get("/chantiers/:chantierId/documents", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  if (!(await canAccessChantier(req.user, chantierId))) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }
  const accessibleLotIds = await getAccessibleLotIds(req.user, chantierId);
  const { rows } = await pool.query(
    `SELECT d.*, u.name AS uploaded_by_name FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE chantier_id = $1 ORDER BY uploaded_at DESC`,
    [chantierId]
  );
  const visible = accessibleLotIds === null
    ? rows
    : rows.filter((d) => d.lot_id === null || accessibleLotIds.includes(d.lot_id));
  res.json({ documents: visible });
});

// Le fichier est déjà envoyé directement depuis le navigateur vers Cloudinary ;
// cette route ne fait qu'enregistrer l'URL obtenue en retour (voir src/api.js).
router.post("/documents", async (req, res) => {
  const { chantierId, lotId, type, url, caption } = req.body || {};
  if (!chantierId || !url) return res.status(400).json({ error: "chantierId et url requis." });
  // Seules des adresses https sont acceptées : une URL « javascript:… »
  // enregistrée ici s'exécuterait chez la personne qui clique sur le document.
  let parsed;
  try { parsed = new URL(String(url)); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || String(url).length > 2000) {
    return res.status(400).json({ error: "Adresse de fichier invalide." });
  }
  if (!(await canAccessChantier(req.user, Number(chantierId)))) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }
  if (req.chantierRole === "direction") {
    return res.status(403).json({ error: "La direction a un accès en lecture seule." });
  }
  if (lotId) {
    const accessibleLotIds = await getAccessibleLotIds(req.user, Number(chantierId));
    if (accessibleLotIds !== null && !accessibleLotIds.includes(Number(lotId))) {
      return res.status(403).json({ error: "Accès non autorisé à ce lot." });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO documents (chantier_id, lot_id, type, url, caption, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [Number(chantierId), lotId ? Number(lotId) : null, type === "document" ? "document" : "photo", url, caption || "", req.user.id]
  );
  res.status(201).json({ document: rows[0] });
});

router.delete("/documents/:docId", async (req, res) => {
  const docId = Number(req.params.docId);
  const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [docId]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: "Document introuvable." });
  if (req.chantierRole !== "admin" && doc.uploaded_by !== req.user.id) {
    return res.status(403).json({ error: "Tu ne peux supprimer que tes propres fichiers." });
  }
  await pool.query("DELETE FROM documents WHERE id = $1", [docId]);
  res.json({ ok: true });
});

module.exports = router;
