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
    { id: user.id, name: user.name, username: user.username, role: user.role },
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
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Non connecté." });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée." });
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
