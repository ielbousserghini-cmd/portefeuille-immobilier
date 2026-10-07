require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { pool, migrate, seedAdmin } = require("./db");
const { checkAndSendAlerts } = require("./alerts");

const authRoutes = require("./routes/auth");
const portfolioRoutes = require("./routes/portfolio");
const usersRoutes = require("./routes/users");
const chantiersRoutes = require("./routes/chantiers");
const avancementRoutes = require("./routes/avancement");
const budgetRoutes = require("./routes/budget");
const planningRoutes = require("./routes/planning");
const documentsRoutes = require("./routes/documents");
const aiImportRoutes = require("./routes/ai-import");
const alertsRoutes = require("./routes/alerts");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/chantiers", chantiersRoutes);
app.use("/api", avancementRoutes);
app.use("/api", budgetRoutes);
app.use("/api", planningRoutes);
app.use("/api", documentsRoutes);
app.use("/api/ai", aiImportRoutes);
app.use("/api", alertsRoutes);

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

// Vérification périodique des alertes bail/révision (voir server/alerts.js).
// Render (plan gratuit) met le service en veille après 15 min d'inactivité :
// cette boucle ne tourne donc que pendant que le service est éveillé, en plus
// de la vérification déclenchée à chaque chargement du Tableau de bord par
// un admin (route /api/alerts/check-now). Ce n'est pas un vrai cron fiable à
// heure fixe, mais ça couvre l'usage normal (l'app est régulièrement visitée).
const ALERTS_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h

async function start() {
  await migrate();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
  });
  setTimeout(() => checkAndSendAlerts(pool), 10000);
  setInterval(() => checkAndSendAlerts(pool), ALERTS_INTERVAL_MS);
}

start().catch((err) => {
  console.error("Échec du démarrage du serveur :", err);
  process.exit(1);
});
