const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error(
    "ERREUR: la variable d'environnement DATABASE_URL n'est pas définie. " +
      "Crée une base PostgreSQL (par ex. sur neon.tech) et mets sa chaîne de connexion dans DATABASE_URL."
  );
  process.exit(1);
}

// Connexion chiffrée ET certificat vérifié (Neon utilise des certificats
// reconnus) : empêche qu'un intermédiaire se fasse passer pour la base.
// Les réglages SSL de l'adresse sont retirés pour que celui-ci s'applique.
const dbUrl = new URL(process.env.DATABASE_URL);
for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) dbUrl.searchParams.delete(k);
const localDb = ["localhost", "127.0.0.1"].includes(dbUrl.hostname);
const pool = new Pool({
  connectionString: dbUrl.toString(),
  ssl: localDb ? false : { rejectUnauthorized: true },
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'employe')),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Permet à un admin de retirer complètement l'accès au module Loyers à un
  // compte "employe" (par ex. un chef de chantier qui ne doit voir que le
  // module Chantiers). DEFAULT true : les comptes employé existants gardent
  // exactement le même accès qu'avant cet ajout, rien ne change pour eux tant
  // qu'un admin ne décoche pas explicitement la case dans Utilisateurs. Un
  // admin global a de toute façon toujours accès aux deux modules, quel que
  // soit ce champ.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS loyers_access BOOLEAN NOT NULL DEFAULT true;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM portfolio");
  if (rows[0].count === 0) {
    await pool.query(
      "INSERT INTO portfolio (id, data) VALUES (1, $1)",
      [JSON.stringify({ properties: [], payments: {}, expenses: [] })]
    );
  }

  // --- Module "Suivi chantiers" (ajouté par-dessus le module Loyers existant) ---
  // Toutes les tables ci-dessous sont créées avec IF NOT EXISTS : ré-exécuter
  // cette migration sur la base de production existante ne touche ni aux
  // tables users/portfolio ni aux données déjà présentes, elle ne fait
  // qu'ajouter ce qui manque.

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chantiers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      description TEXT DEFAULT '',
      start_date DATE,
      planned_end_date DATE,
      status TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'termine', 'suspendu')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lots (
      id SERIAL PRIMARY KEY,
      chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Rattache un utilisateur à un chantier (chef_chantier -> lot_id NULL = tout le
  // chantier) ou à un lot précis (sous_traitant -> lot_id renseigné).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
      lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE
    );
  `);

  // Index unique "manuel" : en SQL, NULL != NULL, donc une contrainte UNIQUE
  // classique laisserait passer des doublons quand lot_id est vide (cas d'un
  // chef de chantier affecté à tout le chantier). On force lot_id à 0 dans
  // l'index pour que ces doublons soient bien rejetés.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS assignments_unique_idx
    ON assignments (user_id, chantier_id, COALESCE(lot_id, 0));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS avancement_entries (
      id SERIAL PRIMARY KEY,
      lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
      percentage INTEGER NOT NULL CHECK (percentage BETWEEN 0 AND 100),
      comment TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_lines (
      id SERIAL PRIMARY KEY,
      chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      montant_prevu NUMERIC NOT NULL DEFAULT 0,
      montant_reel NUMERIC NOT NULL DEFAULT 0,
      date DATE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_tasks (
      id SERIAL PRIMARY KEY,
      chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
      lot_id INTEGER REFERENCES lots(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      status TEXT NOT NULL DEFAULT 'a_venir' CHECK (status IN ('a_venir', 'en_cours', 'termine', 'retard')),
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
      lot_id INTEGER REFERENCES lots(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'photo' CHECK (type IN ('photo', 'document')),
      url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Donne à un utilisateur "employe" (rôle global côté Loyers) un accès et un
  // rôle au sein du module Chantiers. Un admin global (users.role = 'admin')
  // a toujours un accès admin complet aux deux modules et n'a jamais besoin
  // d'une ligne ici (mais rien ne casse si une ligne existe quand même).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS module_access (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module TEXT NOT NULL CHECK (module IN ('chantiers')),
      role TEXT NOT NULL CHECK (role IN ('admin','direction','chef_chantier','sous_traitant')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, module)
    );
  `);

  // --- Alertes bail / révision de loyer (module Loyers) ---
  // Mémorise quelles alertes ont déjà été envoyées par email, pour ne pas
  // renvoyer le même email à chaque vérification périodique. unit_key =
  // "<propertyId>:<unitId>" (identifiants internes au JSON du portefeuille,
  // pas de clé étrangère SQL possible ici).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_log (
      id SERIAL PRIMARY KEY,
      unit_key TEXT NOT NULL,
      alert_type TEXT NOT NULL CHECK (alert_type IN ('lease_end', 'revision')),
      dedupe_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(unit_key, alert_type, dedupe_key)
    );
  `);

  // --- Assistant (agents + notifications push sur téléphone) ---
  // app_settings : petites valeurs de configuration persistantes (ex. clés
  // VAPID des notifications, générées une fois puis conservées).
  // push_subscriptions : un abonnement par appareil (iPhone, ordinateur…),
  // avec les préférences de notification de cet appareil.
  // agent_runs : un passage quotidien des agents par jour (évite les doublons
  // si le déclencheur externe appelle plusieurs fois).
  // Version de session : incrémentée quand le mot de passe, le rôle ou
  // l'état actif d'un compte change, ce qui invalide ses sessions ouvertes.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      keys JSONB NOT NULL,
      prefs JSONB NOT NULL DEFAULT '{"briefing": true, "payments": true, "alerts": true}',
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_ok_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      run_date DATE PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      summary JSONB NOT NULL
    );
    -- Rapport PDF du jour, archivé (une quinzaine de Ko par jour).
    ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pdf BYTEA;
    -- Copie complète des données du jour (même format que « Exporter »),
    -- conservée 90 jours : permet de revenir en arrière après une erreur.
    ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS snapshot JSONB;
  `);
}

async function seedAdmin() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  if (rows[0].count > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!username || !password) {
    console.warn(
      "Aucun utilisateur en base et ADMIN_USERNAME/ADMIN_PASSWORD ne sont pas définis : " +
        "impossible de créer le premier compte admin. Définis ces deux variables d'environnement puis redémarre."
    );
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (name, username, password_hash, role, active) VALUES ($1, $2, $3, 'admin', true)",
    [name, username, hash]
  );
  console.log(`Compte admin initial créé : ${username}`);
}

module.exports = { pool, migrate, seedAdmin };
