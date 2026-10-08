#!/usr/bin/env node
// Migration UNIQUE (à lancer à la main) : passe les anciens fichiers de
// chantier, envoyés en accès public (type « upload »), en accès privé
// (type « authenticated »), et met la base à jour (public_id / resource_type /
// format / version au lieu de l'URL publique).
//
// AVANT TOUT : sauvegarder la base. Le bouton « Exporter une sauvegarde » de
// l'app ne couvre que le module Loyers, pas la table documents : dans Neon,
// créer une branche de sauvegarde (Branches → Create branch), ou
// `pg_dump "$DATABASE_URL" -t documents > documents-avant-migration.sql`.
//
// Par défaut : simulation, rien n'est modifié (liste ce qui serait fait).
//   node scripts/migrer-cloudinary-prive.js
// Pour appliquer réellement :
//   node scripts/migrer-cloudinary-prive.js --appliquer
//
// Idempotent : relançable sans risque après une interruption. Si un fichier a
// déjà été passé en privé (renommage « not found »), le script vérifie qu'il
// existe bien en « authenticated » puis met seulement la base à jour.
//
// Variables nécessaires : DATABASE_URL, CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (les mêmes que sur Render).
require("dotenv").config();
const cloudinary = require("../server/cloudinary");

const APPLY = process.argv.includes("--appliquer");

// https://res.cloudinary.com/<cloud>/<image|raw|video>/upload/[v123/]<public_id>[.<ext>]
function parseLegacyUrl(url, cloudName) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [cloud, resourceType, deliveryType, ...rest] = parts;
  if (cloud !== cloudName || deliveryType !== "upload" || !["image", "raw", "video"].includes(resourceType)) return null;
  let version = null;
  if (rest[0] && /^v\d+$/.test(rest[0])) version = rest.shift().slice(1);
  if (rest.length === 0) return null;
  let publicId = rest.join("/");
  let format = null;
  // Pour image/vidéo, l'extension est le format ; pour « raw » elle fait partie
  // de l'identifiant.
  if (resourceType !== "raw") {
    const m = publicId.match(/^(.*)\.([a-z0-9]{1,10})$/i);
    if (m) { publicId = m[1]; format = m[2].toLowerCase(); }
  }
  return { publicId, resourceType, format, version };
}

function adminUrl(cfg, path) {
  return `${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${path}`;
}

// Renommage signé upload -> authenticated (même identifiant).
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
  const res = await fetch(adminUrl(cfg, `${resourceType}/rename`), { method: "POST", body, signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.notFound = res.status === 404 || /not found/i.test(err.message);
    throw err;
  }
  return data;
}

// Détails d'un fichier déjà en « authenticated » (API d'administration), ou null.
async function findAuthenticated(cfg, { publicId, resourceType }) {
  const path = `resources/${resourceType}/${cloudinary.DELIVERY_TYPE}/${publicId.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(adminUrl(cfg, path), {
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}` },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const cfg = cloudinary.config();
  if (!cfg) throw new Error("Variables CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET manquantes.");
  const { pool } = require("../server/db"); // même connexion (SSL vérifié) que le serveur

  console.log("Rappel : la base doit avoir été sauvegardée avant (voir l'en-tête du script).");
  const { rows } = await pool.query("SELECT id, url FROM documents WHERE public_id IS NULL AND url IS NOT NULL ORDER BY id");
  console.log(`${rows.length} ancien(s) document(s) à migrer. Mode : ${APPLY ? "APPLICATION" : "simulation (ajoute --appliquer)"}`);
  let ok = 0, already = 0, skipped = 0, failed = 0;
  for (const doc of rows) {
    const parsed = parseLegacyUrl(doc.url, cfg.cloudName);
    if (!parsed) { skipped++; console.log(`  #${doc.id} ignoré (URL non reconnue) : ${doc.url}`); continue; }
    console.log(`  #${doc.id} ${parsed.resourceType} ${parsed.publicId}${parsed.format ? "." + parsed.format : ""}`);
    if (!APPLY) continue;
    try {
      let version = parsed.version;
      let wasAlready = false;
      try {
        const renamed = await toAuthenticated(cfg, parsed);
        if (renamed.version) version = String(renamed.version);
      } catch (err) {
        if (!err.notFound) throw err;
        // Déjà passé en privé lors d'un passage précédent ?
        const existing = await findAuthenticated(cfg, parsed);
        if (!existing) throw new Error(`introuvable sur Cloudinary (ni public ni privé) : ${err.message}`);
        if (existing.version) version = String(existing.version);
        wasAlready = true;
        console.log(`  #${doc.id} déjà en accès privé : mise à jour de la base seulement`);
      }
      await pool.query(
        `UPDATE documents SET public_id = $2, resource_type = $3, format = $4, version = $5, delivery_type = $6, url = NULL
         WHERE id = $1 AND public_id IS NULL`,
        [doc.id, parsed.publicId, parsed.resourceType, parsed.format, version, cloudinary.DELIVERY_TYPE]
      );
      if (wasAlready) already++; else ok++;
    } catch (err) {
      failed++;
      console.error(`  #${doc.id} ÉCHEC : ${err.message}`);
    }
  }
  console.log(`Terminé : ${ok} migré(s), ${already} déjà privé(s), ${skipped} ignoré(s), ${failed} échec(s).`);
  await pool.end();
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { parseLegacyUrl };
