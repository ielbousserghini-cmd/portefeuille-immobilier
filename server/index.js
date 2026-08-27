require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { migrate, seedAdmin } = require("./db");

const authRoutes = require("./routes/auth");
const portfolioRoutes = require("./routes/portfolio");
const usersRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/users", usersRoutes);

// Sert le frontend React construit (dossier dist/, généré par `vite build`).
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distDir, "index.html"));
});

// Filet de sécurité : toute erreur non gérée dans une route devient une
// réponse JSON propre plutôt qu'un plantage silencieux du serveur.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

async function start() {
  await migrate();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Échec du démarrage du serveur :", err);
  process.exit(1);
});
