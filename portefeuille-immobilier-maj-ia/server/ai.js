// Petit client pour l'API Anthropic (Claude), utilisé par les fonctionnalités
// IA de l'extranet (import Excel assisté, analyse de contrat). Pas de SDK
// supplémentaire : un simple fetch, Node 18+ l'a en natif.
//
// Variables d'environnement :
// - ANTHROPIC_API_KEY (obligatoire pour que ces fonctionnalités marchent)
// - ANTHROPIC_MODEL (optionnel — voir README.md, section "Fonctionnalités IA")

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Erreur dédiée : les routes peuvent la détecter pour répondre 501 plutôt que
// 500 quand la clé API n'est simplement pas configurée.
class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "Fonctionnalité IA non configurée : ajoute la variable d'environnement " +
        "ANTHROPIC_API_KEY dans les paramètres Render (onglet Environment) " +
        "puis redéploie. Voir README.md, section « Fonctionnalités IA »."
    );
    this.name = "AiNotConfiguredError";
  }
}

// Appelle l'API Messages d'Anthropic avec un unique message utilisateur et,
// optionnellement, une instruction système. Retourne le texte brut de la
// réponse (concaténation des blocs de type "text").
async function callClaude({ system, prompt, maxTokens = 4096 }) {
  if (!aiConfigured()) throw new AiNotConfiguredError();

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new Error("Impossible de contacter le service IA (réseau) : " + err.message);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Le service IA a répondu une erreur (${res.status}) : ${detail}`);
  }

  const json = await res.json();
  const text = (json.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!text.trim()) throw new Error("Le service IA a renvoyé une réponse vide.");
  return text;
}

// Les modèles renvoient parfois le JSON entouré de texte ou de blocs
// ```json ... ``` malgré la consigne — on isole le premier objet/tableau
// JSON valide plutôt que de planter sur res.json() direct.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[\[{]/);
  if (start === -1) throw new Error("Réponse IA illisible (pas de JSON trouvé).");
  const trimmed = candidate.slice(start).trim();

  // Essaie le texte tel quel, puis en coupant progressivement depuis la fin
  // au cas où la réponse a été tronquée par la limite de tokens.
  for (let end = trimmed.length; end > 0; ) {
    const slice = trimmed.slice(0, end);
    try {
      return JSON.parse(slice);
    } catch {
      const lastBrace = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
      if (lastBrace <= 0) break;
      end = lastBrace + 1;
    }
  }
  throw new Error("Réponse IA illisible (JSON invalide ou tronqué).");
}

module.exports = { callClaude, extractJson, aiConfigured, AiNotConfiguredError };
