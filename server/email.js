// Envoi d'emails via l'API HTTP de Brevo (offre gratuite : 300 emails/jour).
// L'API HTTP est utilisée plutôt que SMTP parce que le plan gratuit de Render
// bloque les ports SMTP sortants.
//
// Variables d'environnement (Render → Environment) :
// - BREVO_API_KEY : clé API Brevo (Paramètres → SMTP & API → Clés API)
// - EMAIL_FROM : adresse d'expéditeur validée dans Brevo (Expéditeurs)
// - EMAIL_FROM_NAME : nom affiché (optionnel, « Extranet » par défaut)

function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

// attachments : [{ name, content: Buffer }]
async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!emailConfigured()) {
    throw Object.assign(new Error("Envoi d'emails non configuré : ajoute BREVO_API_KEY et EMAIL_FROM sur Render."), { status: 501 });
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).map((email) => ({ email }));
  if (!recipients.length) throw Object.assign(new Error("Aucun destinataire."), { status: 400 });
  const res = await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME || "Extranet" },
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
      attachment: attachments.length ? attachments.map((a) => ({ name: a.name, content: a.content.toString("base64") })) : undefined,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch { /* corps vide */ }
    throw Object.assign(new Error(`Brevo a refusé l'envoi (${res.status})${detail ? ` : ${detail}` : ""}.`), { status: 502 });
  }
  return res.json().catch(() => ({}));
}

module.exports = { emailConfigured, sendEmail };
