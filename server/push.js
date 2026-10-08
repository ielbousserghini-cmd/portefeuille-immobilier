// Notifications push (iPhone via la web app installée, Android, ordinateur).
// Protocole Web Push standard : aucun service tiers ni compte à créer. Les clés
// VAPID qui signent les notifications sont lues dans VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY si elles existent, sinon générées une seule fois et
// conservées dans la table app_settings (elles doivent rester stables : en
// changer invaliderait tous les abonnements existants).
const webpush = require("web-push");
const { pool } = require("./db");

const SUBJECT = process.env.PUBLIC_URL || "https://portefeuille-immobilier.onrender.com";
let vapid = null;

async function getVapidKeys() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid'");
    if (rows[0]) {
      vapid = rows[0].value;
    } else {
      const generated = webpush.generateVAPIDKeys();
      // ON CONFLICT : si deux démarrages simultanés génèrent chacun une paire,
      // on garde celle déjà enregistrée.
      const { rows: saved } = await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('vapid', $1)
         ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
         RETURNING value`,
        [JSON.stringify(generated)]
      );
      vapid = saved[0].value;
    }
  }
  webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);
  return vapid;
}

async function saveSubscription(userId, subscription, userAgent) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw Object.assign(new Error("Abonnement invalide."), { status: 400 });
  }
  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys, user_agent = EXCLUDED.user_agent
     RETURNING id, prefs`,
    [userId, subscription.endpoint, JSON.stringify(subscription.keys), (userAgent || "").slice(0, 300)]
  );
  return rows[0];
}

// Envoie `payload` ({ title, body, url, tag }) à tous les appareils
// correspondants. `pref` filtre selon les préférences de l'appareil
// ("briefing" | "payments" | "alerts" ; null = toujours). Les abonnements
// expirés (404/410) sont supprimés. Ne lève jamais d'exception.
async function notify({ userIds = null, adminsOnly = true, excludeUserId = null, pref = null, payload }) {
  try {
    await getVapidKeys();
    const params = [];
    const where = [];
    if (userIds) { params.push(userIds); where.push(`s.user_id = ANY($${params.length})`); }
    if (adminsOnly) where.push(`u.role = 'admin'`);
    if (excludeUserId) { params.push(excludeUserId); where.push(`s.user_id <> $${params.length}`); }
    if (pref) { params.push(pref); where.push(`COALESCE((s.prefs->>$${params.length})::boolean, true)`); }
    where.push("u.active = true");
    const { rows } = await pool.query(
      `SELECT s.id, s.endpoint, s.keys FROM push_subscriptions s JOIN users u ON u.id = s.user_id
        WHERE ${where.join(" AND ")}`,
      params
    );
    let sent = 0;
    await Promise.all(rows.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: "normal" });
        sent += 1;
        await pool.query("UPDATE push_subscriptions SET last_ok_at = now() WHERE id = $1", [sub.id]);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
        } else {
          console.error("[push] Échec d'envoi :", err.statusCode || "", err.body || err.message);
        }
      }
    }));
    return { devices: rows.length, sent };
  } catch (err) {
    console.error("[push] Erreur :", err);
    return { devices: 0, sent: 0, error: err.message };
  }
}

module.exports = { getVapidKeys, saveSubscription, notify };
