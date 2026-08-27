const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error(
    "ERREUR: la variable d'environnement DATABASE_URL n'est pas définie. " +
      "Crée une base PostgreSQL (par ex. sur neon.tech) et mets sa chaîne de connexion dans DATABASE_URL."
  );
  process.exit(1);
}

// Neon / Render Postgres exigent une connexion SSL, mais avec un certificat
// que Node ne reconnaît pas toujours comme "de confiance" par défaut.
// rejectUnauthorized: false désactive uniquement la vérification stricte du
// certificat (toujours chiffré en transit), ce qui est l'approche standard
// pour ces fournisseurs gérés.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
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
