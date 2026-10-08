require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { migrate, seedAdmin } = require("./db");

const authRoutes = require("./routes/auth");
const portfolioRoutes = require("./routes/portfolio");
const usersRoutes = require("./routes/users");
const chantiersRoutes = require("./routes/chantiers");
const avancementRoutes = require("./routes/avancement");
const budgetRoutes = require("./routes/budget");
const planningRoutes = require("./routes/planning");
const documentsRoutes = require("./routes/documents");

const app = express();
const PORT = process.env.PORT || 3000;

// Le portefeuille entier (biens, locaux, paiements) transite en un seul JSON
// lors des sauvegardes et imports : la limite par défaut (100 Ko) est trop basse.
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/chantiers", chantiersRoutes);
app.use("/api", avancementRoutes);
app.use("/api", budgetRoutes);
app.use("/api", planningRoutes);
app.use("/api", documentsRoutes);

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
