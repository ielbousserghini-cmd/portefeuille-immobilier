// Stockage privé des photos/documents de chantier sur Cloudinary.
//
// - Envoi : le navigateur envoie toujours le fichier directement à Cloudinary,
//   mais avec une signature fabriquée ici (CLOUDINARY_API_SECRET ne quitte
//   jamais le serveur). Le fichier est rangé en accès « authenticated » : il
//   n'est pas lisible par une simple URL res.cloudinary.com.
// - Lecture : le serveur vérifie l'accès au chantier puis redirige vers une
//   URL de téléchargement signée qui expire au bout de quelques minutes.
//
// Signature Cloudinary : SHA-1 de « clé=valeur&clé=valeur… » (paramètres triés,
// sans file / cloud_name / resource_type / api_key) suivi du secret API.
const crypto = require("crypto");

const DELIVERY_TYPE = "authenticated";
const ROOT_FOLDER = "extranet/chantiers";
const DOWNLOAD_TTL_SECONDS = 5 * 60;
const RESOURCE_TYPES = ["image", "raw", "video"];

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return {
    cloudName,
    apiKey,
    apiSecret,
    // CLOUDINARY_API_BASE : uniquement pour les tests locaux (Cloudinary simulé).
    apiBase: (process.env.CLOUDINARY_API_BASE || "https://api.cloudinary.com").replace(/\/$/, ""),
  };
}

const EXCLUDED_FROM_SIGNATURE = new Set(["file", "cloud_name", "resource_type", "api_key", "signature"]);

function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => !EXCLUDED_FROM_SIGNATURE.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function chantierFolder(chantierId) {
  return `${ROOT_FOLDER}/${Number(chantierId)}`;
}

// Paramètres d'un envoi signé pour un chantier. Le serveur choisit lui-même
// l'identifiant (dossier du chantier + nom aléatoire) : impossible d'écraser
// un autre fichier ou de déposer ailleurs que dans le dossier du chantier.
function buildUploadSignature(chantierId, now = Date.now()) {
  const cfg = config();
  if (!cfg) return null;
  const params = {
    public_id: `${chantierFolder(chantierId)}/${crypto.randomBytes(12).toString("hex")}`,
    timestamp: Math.floor(now / 1000),
    type: DELIVERY_TYPE,
  };
  return {
    uploadUrl: `${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/auto/upload`,
    apiKey: cfg.apiKey,
    ...params,
    signature: signParams(params, cfg.apiSecret),
  };
}

// Vérifie la réponse de Cloudinary renvoyée par le navigateur après l'envoi :
// elle contient une signature de (public_id, version) calculée avec notre
// secret, ce qui prouve que le fichier a bien été déposé par Cloudinary.
function verifyUploadResult(chantierId, file) {
  const cfg = config();
  if (!cfg || !file || typeof file !== "object") return null;
  const publicId = String(file.public_id || "");
  const version = String(file.version || "");
  const resourceType = String(file.resource_type || "");
  const format = file.format == null ? "" : String(file.format);
  const prefix = `${chantierFolder(chantierId)}/`;
  if (!publicId.startsWith(prefix) || !/^[a-z0-9/_-]{1,200}(\.[a-z0-9]{1,10})?$/i.test(publicId)) return null;
  if (!/^\d{1,20}$/.test(version)) return null;
  if (!RESOURCE_TYPES.includes(resourceType)) return null;
  if (format && !/^[a-z0-9]{1,10}$/i.test(format)) return null;
  if (file.type !== undefined && file.type !== DELIVERY_TYPE) return null;
  const expected = signParams({ public_id: publicId, version }, cfg.apiSecret);
  if (!safeEqualHex(expected, file.signature)) return null;
  return { publicId, resourceType, format: format || null };
}

// URL de téléchargement privée (équivalent de cloudinary.utils.private_download_url),
// valable DOWNLOAD_TTL_SECONDS secondes.
function privateDownloadUrl({ publicId, resourceType, format, deliveryType, attachment }, now = Date.now()) {
  const cfg = config();
  if (!cfg) return null;
  const nowS = Math.floor(now / 1000);
  const params = {
    public_id: publicId,
    format: format || undefined,
    type: deliveryType || DELIVERY_TYPE,
    attachment: attachment ? "true" : undefined,
    expires_at: nowS + DOWNLOAD_TTL_SECONDS,
    timestamp: nowS,
  };
  params.signature = signParams(params, cfg.apiSecret);
  params.api_key = cfg.apiKey;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const rt = RESOURCE_TYPES.includes(resourceType) ? resourceType : "image";
  return `${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${rt}/download?${qs}`;
}

module.exports = {
  DELIVERY_TYPE,
  ROOT_FOLDER,
  DOWNLOAD_TTL_SECONDS,
  config,
  signParams,
  chantierFolder,
  buildUploadSignature,
  verifyUploadResult,
  privateDownloadUrl,
};
