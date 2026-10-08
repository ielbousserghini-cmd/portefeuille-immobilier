// Protections transversales du serveur (audit de sécurité du 8 octobre 2026).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// --- 1. Erreurs des routes asynchrones ---
// Express 4 ne rattrape pas les erreurs levées dans une route `async` : la
// promesse rejetée faisait planter tout le processus (une seule requête de
// connexion mal formée suffisait à mettre le site hors service). On fait
// suivre ces erreurs au gestionnaire d'erreurs d'Express, comme en Express 5.
// À charger AVANT la déclaration des routes.
function patchAsyncErrors() {
  const Layer = require("express/lib/router/layer");
  if (Layer.prototype.__asyncPatched) return;
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return original.call(this, req, res, next); // gestionnaire d'erreurs
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === "function") out.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;

  // Dernier filet : une promesse oubliée ailleurs (tâche planifiée…) est
  // journalisée au lieu d'arrêter le serveur.
  process.on("unhandledRejection", (err) => console.error("[serveur] Promesse rejetée non gérée :", err));
}

// --- 2. En-têtes de sécurité ---
// Empreinte du petit script en ligne d'index.html (thème clair/sombre), pour
// l'autoriser précisément dans la politique de contenu sans autoriser tout
// script en ligne.
function inlineScriptHashes(indexPath) {
  try {
    const html = fs.readFileSync(indexPath, "utf8");
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`
    );
  } catch {
    return [];
  }
}

function securityHeaders({ distDir }) {
  const hashes = inlineScriptHashes(path.join(distDir, "index.html"));
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    // React applique les styles via l'attribut style, et la page injecte des
    // balises <style> : 'unsafe-inline' est nécessaire pour les styles
    // (pas pour les scripts).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "connect-src 'self' https://api.cloudinary.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const production = process.env.NODE_ENV === "production";

  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!req.path.startsWith("/api/") || req.path.endsWith(".pdf")) res.setHeader("Content-Security-Policy", csp);
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  };
}

// --- 3. Limitation des tentatives de connexion ---
// Par adresse IP et par identifiant : au-delà de MAX_FAILS échecs sur la
// fenêtre, les tentatives sont refusées jusqu'à la fin de la fenêtre. En
// mémoire (un seul serveur) : suffisant ici, remis à zéro au redémarrage.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 20;
const MAX_FAILS_PER_USER = 8;
const fails = new Map(); // clé -> { count, until }

function hit(key, max) {
  const now = Date.now();
  const cur = fails.get(key);
  if (!cur || cur.until < now) {
    fails.set(key, { count: 1, until: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > max;
}
function blocked(key, max) {
  const cur = fails.get(key);
  return Boolean(cur && cur.until > Date.now() && cur.count >= max);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of fails) if (v.until < now) fails.delete(k);
}, WINDOW_MS).unref();

const loginLimiter = {
  isBlocked(ip, username) {
    return blocked(`ip:${ip}`, MAX_FAILS_PER_IP) || blocked(`u:${username}`, MAX_FAILS_PER_USER);
  },
  recordFailure(ip, username) {
    hit(`ip:${ip}`, MAX_FAILS_PER_IP);
    hit(`u:${username}`, MAX_FAILS_PER_USER);
  },
  recordSuccess(username) {
    fails.delete(`u:${username}`);
  },
};

module.exports = { patchAsyncErrors, securityHeaders, loginLimiter };
