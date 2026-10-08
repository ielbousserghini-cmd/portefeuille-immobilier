// Petit client pour l'API Anthropic (Claude), utilisé par les fonctionnalités
// IA de l'extranet (import de fichiers assisté, analyse de contrat). Pas de
// SDK supplémentaire : un simple fetch, Node 18+ l'a en natif.
//
// Variables d'environnement :
// - ANTHROPIC_API_KEY (obligatoire pour que ces fonctionnalités marchent)
// - ANTHROPIC_MODEL (optionnel — voir README.md, section "Fonctionnalités IA")

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=50";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Modèle effectivement utilisé. Si le modèle par défaut est un jour retiré par
// Anthropic, on bascule automatiquement sur le Sonnet le plus récent proposé
// par l'API (voir resolveFallbackModel), sans avoir à redéployer.
let activeModel = null;

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

function headers() {
  return {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
}

// Liste des modèles disponibles pour cette clé (les plus récents d'abord) et
// choix du Sonnet le plus récent, sinon du premier modèle de la liste.
async function resolveFallbackModel() {
  const res = await fetch(ANTHROPIC_MODELS_URL, { headers: headers() });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const ids = (json?.data || []).map((m) => m.id).filter(Boolean);
  return ids.find((id) => id.includes("sonnet")) || ids[0] || null;
}

async function postMessages(model, { system, content, maxTokens }) {
  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (err) {
    throw new Error("Impossible de contacter le service IA (réseau) : " + err.message);
  }
}

async function readError(res) {
  try {
    const body = await res.json();
    return { type: body?.error?.type || "", message: body?.error?.message || JSON.stringify(body) };
  } catch {
    return { type: "", message: await res.text().catch(() => "") };
  }
}

// Appelle l'API Messages d'Anthropic avec un unique message utilisateur.
// `content` peut être une simple chaîne (prompt texte) ou un tableau de blocs
// (ex. un PDF ou une image suivis d'une consigne). Retourne le texte brut de
// la réponse (concaténation des blocs de type "text").
async function callClaude({ system, prompt, content, maxTokens = 4096 }) {
  if (!aiConfigured()) throw new AiNotConfiguredError();

  const body = { system, content: content || prompt, maxTokens };
  let model = activeModel || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  let res = await postMessages(model, body);

  // Modèle introuvable (retiré, ou nom mal saisi dans ANTHROPIC_MODEL) :
  // on demande à l'API quels modèles existent et on réessaie une fois.
  if (res.status === 404) {
    const err = await readError(res);
    const fallback = err.type === "not_found_error" ? await resolveFallbackModel() : null;
    if (!fallback || fallback === model) {
      throw new Error(`Le service IA a répondu une erreur (404) : ${err.message}`);
    }
    console.warn(`[ai] Modèle « ${model} » indisponible, bascule sur « ${fallback} ».`);
    model = fallback;
    activeModel = fallback;
    res = await postMessages(model, body);
  }

  if (!res.ok) {
    const err = await readError(res);
    if (res.status === 401) {
      throw new Error("Clé API Anthropic refusée : vérifie la valeur de ANTHROPIC_API_KEY sur Render.");
    }
    if (res.status === 429 || res.status === 529) {
      throw new Error("Le service IA est momentanément surchargé. Réessaie dans une minute.");
    }
    throw new Error(`Le service IA a répondu une erreur (${res.status}) : ${err.message}`);
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
  // Pour une réponse coupée au milieu d'une liste, on referme la liste (et
  // l'objet qui la contient) afin de garder au moins les éléments complets.
  const closers = ["", "]", "]}", "}"];
  for (let end = trimmed.length; end > 0; ) {
    const slice = trimmed.slice(0, end);
    for (const c of closers) {
      try {
        return JSON.parse(slice + c);
      } catch {
        // essaie la fermeture suivante
      }
    }
    const lastBrace = Math.max(slice.slice(0, -1).lastIndexOf("}"), slice.slice(0, -1).lastIndexOf("]"));
    if (lastBrace <= 0) break;
    end = lastBrace + 1;
  }
  throw new Error("Réponse IA illisible (JSON invalide ou tronqué).");
}

module.exports = { callClaude, extractJson, aiConfigured, AiNotConfiguredError };
