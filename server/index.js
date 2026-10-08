require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { patchAsyncErrors, securityHeaders } = require("./security");
patchAsyncErrors();
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
const assistant = require("./routes/assistant");

const app = express();
const PORT = process.env.PORT || 3000;
const distDir = path.join(__dirname, "..", "dist");

// Render place le serveur derrière plusieurs proxys : on lit l'adresse du
// visiteur dans X-Forwarded-For. Elle peut être falsifiée, c'est pourquoi la
// limite stricte de tentatives porte sur l'identifiant (voir security.js) et
// la limite par adresse IP reste large (elle ne doit jamais bloquer tous les
// employés à la fois si plusieurs passent par la même adresse).
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(securityHeaders({ distDir }));

// Le portefeuille entier (biens, locaux, paiements) transite en un seul JSON
// lors des sauvegardes et imports : la limite par défaut (100 Ko) est trop basse.
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/users", usersRoutes);
// Les routes /api/ai et /api/alerts sont montées avant les routeurs Chantiers
// montés sur "/api" : ceux-ci filtrent toute requête /api/* qui leur parvient
// (accès Chantiers requis) et masqueraient sinon les routes déclarées après.
app.use("/api/ai", aiImportRoutes);
app.use("/api", alertsRoutes);
app.use("/api", assistant.router);
app.use("/api/chantiers", chantiersRoutes);
app.use("/api", avancementRoutes);
app.use("/api", budgetRoutes);
app.use("/api", planningRoutes);
app.use("/api", documentsRoutes);

// Sert le frontend React construit (dossier dist/, généré par `vite build`).
// Le service worker et le manifeste de la web app ne doivent jamais être mis
// en cache par le navigateur, sinon les mises à jour de l'app tardent à
// arriver sur les téléphones.
app.use(express.static(distDir, {
  setHeaders(res, filePath) {
    if (/(sw\.js|manifest\.webmanifest)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
  },
}));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distDir, "index.html"));
});

// Filet de sécurité : toute erreur non gérée dans une route devient une
// réponse JSON propre plutôt qu'un plantage silencieux du serveur.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Requête invalide." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Données trop volumineuses." });
  console.error(err);
  if (res.headersSent) return next(err);
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
  assistant.startScheduler();
}

start().catch((err) => {
  console.error("Échec du démarrage du serveur :", err);
  process.exit(1);
});
