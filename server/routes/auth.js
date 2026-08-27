const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { setSessionCookie, clearSessionCookie, requireAuth } = require("../auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  }

  const { rows } = await pool.query(
    "SELECT id, name, username, password_hash, role, active FROM users WHERE username = $1",
    [String(username).trim()]
  );
  const user = rows[0];

  // Message volontairement identique dans les deux cas (compte inconnu / mauvais
  // mot de passe / compte désactivé) pour ne pas révéler quels identifiants existent.
  const genericError = () => res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });

  if (!user || !user.active) return genericError();

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return genericError();

  setSessionCookie(res, user);
  res.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  // On revérifie en base à chaque fois (et pas seulement le contenu du cookie)
  // pour qu'un compte désactivé par l'admin perde l'accès immédiatement.
  const { rows } = await pool.query(
    "SELECT id, name, username, role, active FROM users WHERE id = $1",
    [req.user.id]
  );
  const user = rows[0];
  if (!user || !user.active) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Compte désactivé ou introuvable." });
  }
  res.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

module.exports = router;
