const jwt = require("jsonwebtoken");

const COOKIE_NAME = "session";
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error(
    "ERREUR: la variable d'environnement JWT_SECRET n'est pas définie. " +
      "Choisis une longue chaîne aléatoire secrète et mets-la dans JWT_SECRET."
  );
  process.exit(1);
}

function signSession(user) {
  return jwt.sign(
    { id: user.id, name: user.name, username: user.username, role: user.role, sv: user.session_version || 0 },
    SECRET,
    { expiresIn: "30d" }
  );
}

function setSessionCookie(res, user) {
  const token = signSession(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Middleware : exige d'être connecté. Attache req.user = { id, name, username, role }.
//
// Le cookie seul ne suffit pas : le compte est relu en base à chaque requête.
// Ainsi un compte désactivé, rétrogradé (admin -> employé) ou dont le mot de
// passe a été changé (session_version incrémentée) perd ses droits
// immédiatement, au lieu de les garder jusqu'à l'expiration du cookie (30 j).
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Non connecté." });
  let claims;
  try {
    claims = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
  try {
    const { pool } = require("./db");
    const { rows } = await pool.query(
      "SELECT id, name, username, role, active, session_version FROM users WHERE id = $1",
      [claims.id]
    );
    const user = rows[0];
    if (!user || !user.active || (claims.sv || 0) !== user.session_version) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expirée, reconnecte-toi." });
    }
    req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Middleware : exige le rôle admin (à utiliser après requireAuth).
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Réservé aux administrateurs." });
  }
  next();
}

module.exports = { COOKIE_NAME, setSessionCookie, clearSessionCookie, requireAuth, requireAdmin };
