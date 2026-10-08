const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { getChantierRole, canAccessChantier, getAccessibleLotIds } = require("../access");
const cloudinary = require("../cloudinary");

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
  res.json({ documents: visible.map(publicDocument) });
});

// Ce que le navigateur reçoit d'un document : jamais l'adresse Cloudinary
// directe, seulement la route ci-dessous qui contrôle l'accès à chaque lecture.
function publicDocument(d) {
  const { url, public_id, resource_type, format, delivery_type, ...rest } = d;
  return { ...rest, file_url: `/api/documents/${d.id}/fichier` };
}

// Vérifie qu'on peut écrire sur ce chantier (et ce lot). Renvoie un message
// d'erreur (403) ou null. Mêmes règles que l'enregistrement d'un document.
async function writeAccessError(req, chantierId, lotId) {
  if (!(await canAccessChantier(req.user, chantierId))) return "Accès non autorisé à ce chantier.";
  if (req.chantierRole === "direction") return "La direction a un accès en lecture seule.";
  if (lotId) {
    const accessibleLotIds = await getAccessibleLotIds(req.user, chantierId);
    if (accessibleLotIds !== null && !accessibleLotIds.includes(Number(lotId))) return "Accès non autorisé à ce lot.";
  }
  return null;
}

// Signature d'un envoi direct navigateur -> Cloudinary, valable pour un seul
// fichier rangé dans le dossier du chantier, en accès authentifié.
router.post("/chantiers/:chantierId/documents/signature", async (req, res) => {
  const chantierId = Number(req.params.chantierId);
  const lotId = req.body?.lotId ? Number(req.body.lotId) : null;
  if (!Number.isInteger(chantierId) || chantierId <= 0) return res.status(400).json({ error: "Chantier invalide." });
  const denied = await writeAccessError(req, chantierId, lotId);
  if (denied) return res.status(403).json({ error: denied });
  const upload = cloudinary.buildUploadSignature(chantierId);
  if (!upload) return res.status(503).json({ error: "Le stockage des fichiers n'est pas configuré (variables CLOUDINARY_* manquantes)." });
  res.json({ upload });
});

// Lecture d'un fichier : accès vérifié à chaque fois, puis redirection vers une
// URL Cloudinary signée qui expire au bout de quelques minutes.
router.get("/documents/:docId/fichier", async (req, res) => {
  const docId = Number(req.params.docId);
  if (!Number.isInteger(docId) || docId <= 0) return res.status(404).json({ error: "Document introuvable." });
  const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [docId]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: "Document introuvable." });
  if (!(await canAccessChantier(req.user, doc.chantier_id))) {
    return res.status(403).json({ error: "Accès non autorisé à ce chantier." });
  }
  if (doc.lot_id !== null) {
    const accessibleLotIds = await getAccessibleLotIds(req.user, doc.chantier_id);
    if (accessibleLotIds !== null && !accessibleLotIds.includes(doc.lot_id)) {
      return res.status(403).json({ error: "Accès non autorisé à ce lot." });
    }
  }

  let target = null;
  if (doc.public_id) {
    target = cloudinary.privateDownloadUrl({
      publicId: doc.public_id,
      resourceType: doc.resource_type,
      format: doc.format,
      deliveryType: doc.delivery_type,
      attachment: req.query.telecharger === "1",
    });
    if (!target) return res.status(503).json({ error: "Le stockage des fichiers n'est pas configuré." });
  } else {
    // Ancien document (avant le passage en accès privé) : URL publique conservée
    // tant que le script de migration n'a pas été lancé.
    try {
      const parsed = new URL(String(doc.url));
      if (parsed.protocol === "https:") target = parsed.toString();
    } catch { /* adresse invalide */ }
    if (!target) return res.status(404).json({ error: "Fichier introuvable." });
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, target);
});

// Le fichier est déjà envoyé directement depuis le navigateur vers Cloudinary
// (envoi signé, voir la route /signature ci-dessus) ; cette route enregistre
// son identifiant après avoir vérifié la signature renvoyée par Cloudinary.
router.post("/documents", async (req, res) => {
  const { chantierId, lotId, type, caption, cloudinary: file } = req.body || {};
  if (!chantierId || !file) return res.status(400).json({ error: "chantierId et fichier requis." });
  const denied = await writeAccessError(req, Number(chantierId), lotId);
  if (denied) return res.status(403).json({ error: denied });

  // L'ancien envoi par URL libre n'est plus accepté : seul un fichier déposé
  // avec une signature du serveur, dans le dossier de ce chantier, l'est.
  const verified = cloudinary.verifyUploadResult(Number(chantierId), file);
  if (!verified) return res.status(400).json({ error: "Fichier non reconnu (signature Cloudinary invalide)." });

  const { rows } = await pool.query(
    `INSERT INTO documents (chantier_id, lot_id, type, url, public_id, resource_type, format, delivery_type, caption, uploaded_by)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      Number(chantierId),
      lotId ? Number(lotId) : null,
      type === "document" ? "document" : "photo",
      verified.publicId,
      verified.resourceType,
      verified.format,
      cloudinary.DELIVERY_TYPE,
      String(caption || "").slice(0, 300),
      req.user.id,
    ]
  );
  res.status(201).json({ document: publicDocument(rows[0]) });
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
