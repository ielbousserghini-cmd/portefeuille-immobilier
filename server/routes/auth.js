const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { setSessionCookie, clearSessionCookie, requireAuth } = require("../auth");
const { getChantierRole, hasLoyersAccess } = require("../access");

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
  // chantierRole (module Suivi chantiers) et loyersAccess (module Suivi
  // loyers) sont résolus et renvoyés ici en plus du rôle global (role), pour
  // que le frontend sache dès la connexion à quels modules l'utilisateur a
  // accès, sans aller-retour supplémentaire. Les deux sont indépendants l'un
  // de l'autre : un compte peut avoir l'un, l'autre, les deux, ou aucun.
  const chantierRole = await getChantierRole(user);
  const loyersAccess = await hasLoyersAccess(user);
  res.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role, chantierRole, loyersAccess } });
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
  const chantierRole = await getChantierRole(user);
  const loyersAccess = await hasLoyersAccess(user);
  res.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role, chantierRole, loyersAccess } });
});

module.exports = router;
