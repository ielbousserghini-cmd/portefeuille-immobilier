#!/usr/bin/env node
// Migration UNIQUE (à lancer à la main, une fois) : passe les anciens fichiers
// de chantier, envoyés en accès public (type « upload »), en accès privé
// (type « authenticated »), et met la base à jour (public_id / resource_type /
// format au lieu de l'URL publique).
//
// Par défaut : simulation, rien n'est modifié (liste ce qui serait fait).
//   node scripts/migrer-cloudinary-prive.js
// Pour appliquer réellement :
//   node scripts/migrer-cloudinary-prive.js --appliquer
//
// Variables nécessaires : DATABASE_URL, CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (les mêmes que sur Render).
// Conseil : faire un export de la base avant.
require("dotenv").config();
const cloudinary = require("../server/cloudinary");

const APPLY = process.argv.includes("--appliquer");

// https://res.cloudinary.com/<cloud>/<image|raw|video>/upload/[v123/]<public_id>[.<ext>]
function parseLegacyUrl(url, cloudName) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== "res.cloudinary.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [cloud, resourceType, deliveryType, ...rest] = parts;
  if (cloud !== cloudName || deliveryType !== "upload" || !["image", "raw", "video"].includes(resourceType)) return null;
  if (rest[0] && /^v\d+$/.test(rest[0])) rest.shift();
  if (rest.length === 0) return null;
  let publicId = rest.join("/");
  let format = null;
  // Pour image/vidéo, l'extension est le format ; pour « raw » elle fait partie
  // de l'identifiant.
  if (resourceType !== "raw") {
    const m = publicId.match(/^(.*)\.([a-z0-9]{1,10})$/i);
    if (m) { publicId = m[1]; format = m[2].toLowerCase(); }
  }
  return { publicId, resourceType, format };
}

async function toAuthenticated(cfg, { publicId, resourceType }) {
  const params = {
    from_public_id: publicId,
    to_public_id: publicId,
    type: "upload",
    to_type: cloudinary.DELIVERY_TYPE,
    invalidate: "true", // vide le cache CDN de l'ancienne URL publique
    overwrite: "false",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const body = new URLSearchParams({ ...params, api_key: cfg.apiKey, signature: cloudinary.signParams(params, cfg.apiSecret) });
  const res = await fetch(`${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/rename`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const cfg = cloudinary.config();
  if (!cfg) throw new Error("Variables CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET manquantes.");
  const { pool } = require("../server/db"); // même connexion (SSL vérifié) que le serveur

  const { rows } = await pool.query("SELECT id, url FROM documents WHERE public_id IS NULL AND url IS NOT NULL ORDER BY id");
  console.log(`${rows.length} ancien(s) document(s) à migrer. Mode : ${APPLY ? "APPLICATION" : "simulation (ajoute --appliquer)"}`);
  let ok = 0, skipped = 0, failed = 0;
  for (const doc of rows) {
    const parsed = parseLegacyUrl(doc.url, cfg.cloudName);
    if (!parsed) { skipped++; console.log(`  #${doc.id} ignoré (URL non reconnue) : ${doc.url}`); continue; }
    console.log(`  #${doc.id} ${parsed.resourceType} ${parsed.publicId}${parsed.format ? "." + parsed.format : ""}`);
    if (!APPLY) continue;
    try {
      await toAuthenticated(cfg, parsed);
      await pool.query(
        `UPDATE documents SET public_id = $2, resource_type = $3, format = $4, delivery_type = $5, url = NULL WHERE id = $1`,
        [doc.id, parsed.publicId, parsed.resourceType, parsed.format, cloudinary.DELIVERY_TYPE]
      );
      ok++;
    } catch (err) {
      failed++;
      console.error(`  #${doc.id} ÉCHEC : ${err.message}`);
    }
  }
  console.log(`Terminé : ${ok} migré(s), ${skipped} ignoré(s), ${failed} échec(s).`);
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { parseLegacyUrl };
