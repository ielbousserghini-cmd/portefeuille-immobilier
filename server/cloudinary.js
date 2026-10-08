// Stockage privé des photos/documents de chantier sur Cloudinary.
//
// - Envoi : le navigateur envoie toujours le fichier directement à Cloudinary,
//   mais avec une signature fabriquée ici (CLOUDINARY_API_SECRET ne quitte
//   jamais le serveur). Le fichier est rangé en accès « authenticated » : il
//   n'est pas lisible par une simple URL res.cloudinary.com non signée.
// - Lecture : le serveur vérifie l'accès au chantier puis redirige vers
//   * pour les photos : une URL de livraison signée (CDN, mise en cache),
//     en miniature pour la grille ou en original ;
//   * pour les autres fichiers (PDF, Word, Excel…) : une URL de
//     téléchargement API signée qui expire en quelques minutes.
//
// Signature API Cloudinary : SHA-1 de « clé=valeur&clé=valeur… » (paramètres
// triés, sans file / cloud_name / resource_type / api_key) suivi du secret.
const crypto = require("crypto");

const DELIVERY_TYPE = "authenticated";
const ROOT_FOLDER = "extranet/chantiers";
const RESOURCE_TYPES = ["image", "raw", "video"];

// Extensions acceptées à l'envoi. Les photos sont envoyées comme « image »
// (miniatures possibles) ; tout le reste comme « raw », extension comprise
// dans l'identifiant (sinon Cloudinary perd l'extension des fichiers raw).
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "webp"];
const RAW_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip"];
const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...RAW_EXTENSIONS];

// Téléchargement API : l'heure est arrondie à des créneaux de 5 min pour que
// l'URL reste la même pendant le créneau (cache navigateur), et chaque URL
// reste valable 5 à 10 min.
const DOWNLOAD_SLOT_SECONDS = 5 * 60;
const DOWNLOAD_VALIDITY_SECONDS = 2 * DOWNLOAD_SLOT_SECONDS;
// Miniature de la grille de photos (transformation signée avec l'URL).
const THUMBNAIL_TRANSFORMATION = "c_fill,h_400,w_400";
const THUMBNAIL_FORMAT = "jpg";
// Formats d'image affichables via le CDN (le reste passe par le téléchargement).
const DELIVERABLE_IMAGE_FORMATS = ["jpg", "jpeg", "png", "heic", "webp", "gif"];

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return {
    cloudName,
    apiKey,
    apiSecret,
    // CLOUDINARY_API_BASE / CLOUDINARY_DELIVERY_BASE : uniquement pour les
    // tests locaux (Cloudinary simulé).
    apiBase: (process.env.CLOUDINARY_API_BASE || "https://api.cloudinary.com").replace(/\/$/, ""),
    deliveryBase: (process.env.CLOUDINARY_DELIVERY_BASE || "https://res.cloudinary.com").replace(/\/$/, ""),
  };
}

const EXCLUDED_FROM_SIGNATURE = new Set(["file", "cloud_name", "resource_type", "api_key", "signature"]);

function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => !EXCLUDED_FROM_SIGNATURE.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`.replace(/&/g, "%26"))
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function chantierFolder(chantierId) {
  return `${ROOT_FOLDER}/${Number(chantierId)}`;
}

function normalizeExtension(ext) {
  const e = String(ext || "").trim().toLowerCase().replace(/^\./, "");
  return ALLOWED_EXTENSIONS.includes(e) ? e : null;
}

// Paramètres d'un envoi signé pour un chantier. Le serveur choisit lui-même
// l'identifiant (dossier du chantier + nom aléatoire) et le type de ressource
// selon l'extension : impossible d'écraser un autre fichier ou de déposer
// ailleurs que dans le dossier du chantier. null si l'extension est refusée.
function buildUploadSignature(chantierId, extension, now = Date.now()) {
  const cfg = config();
  if (!cfg) return null;
  const ext = normalizeExtension(extension);
  if (!ext) return { error: "extension" };
  const resourceType = RAW_EXTENSIONS.includes(ext) ? "raw" : "image";
  const name = crypto.randomBytes(12).toString("hex");
  const params = {
    public_id: `${chantierFolder(chantierId)}/${name}${resourceType === "raw" ? `.${ext}` : ""}`,
    timestamp: Math.floor(now / 1000),
    type: DELIVERY_TYPE,
  };
  return {
    uploadUrl: `${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/upload`,
    apiKey: cfg.apiKey,
    resourceType,
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
  const format = file.format == null ? "" : String(file.format).toLowerCase();
  const prefix = `${chantierFolder(chantierId)}/`;
  const m = publicId.match(/^[a-z0-9/_-]{1,200}?(?:\.([a-z0-9]{1,10}))?$/i);
  if (!publicId.startsWith(prefix) || !m) return null;
  // raw : l'extension (de la liste blanche) fait partie de l'identifiant ;
  // image : pas d'extension dans l'identifiant.
  if (resourceType === "raw" ? !RAW_EXTENSIONS.includes((m[1] || "").toLowerCase()) : resourceType !== "image" || m[1]) return null;
  if (!/^\d{1,20}$/.test(version)) return null;
  if (format && !/^[a-z0-9]{1,10}$/.test(format)) return null;
  if (file.type !== undefined && file.type !== DELIVERY_TYPE) return null;
  const expected = signParams({ public_id: publicId, version }, cfg.apiSecret);
  if (!safeEqual(expected, file.signature)) return null;
  return { publicId, resourceType, format: format || null, version };
}

// URL de livraison signée (CDN) d'une image « authenticated », équivalent de
// cloudinary.url(publicId, { sign_url: true, type: "authenticated", … }).
// La signature couvre la transformation : impossible d'en demander une autre.
function signedDeliveryUrl({ publicId, format, version, transformation }) {
  const cfg = config();
  if (!cfg) return null;
  const source = `${publicId}${format ? `.${format}` : ""}`;
  const toSign = [transformation, source].filter(Boolean).join("/");
  const sig = crypto.createHash("sha1").update(toSign + cfg.apiSecret).digest("base64")
    .slice(0, 8).replace(/\//g, "_").replace(/\+/g, "-");
  const encoded = encodeURIComponent(source).replace(/%2F/g, "/").replace(/%3A/g, ":");
  return [
    `${cfg.deliveryBase}/${encodeURIComponent(cfg.cloudName)}/image/${DELIVERY_TYPE}/s--${sig}--`,
    transformation,
    `v${version || 1}`,
    encoded,
  ].filter(Boolean).join("/");
}

// URL de téléchargement privée (équivalent de cloudinary.utils.private_download_url).
// Renvoie { url, maxAge } : maxAge = secondes pendant lesquelles cette même
// URL reste servie (fin du créneau), utilisable en Cache-Control.
function privateDownloadUrl({ publicId, resourceType, format, deliveryType, attachment }, now = Date.now()) {
  const cfg = config();
  if (!cfg) return null;
  const nowS = Math.floor(now / 1000);
  const slot = nowS - (nowS % DOWNLOAD_SLOT_SECONDS);
  const params = {
    public_id: publicId,
    format: resourceType === "raw" ? undefined : format || undefined,
    type: deliveryType || DELIVERY_TYPE,
    attachment: attachment ? "true" : undefined,
    expires_at: slot + DOWNLOAD_VALIDITY_SECONDS,
    timestamp: slot,
  };
  params.signature = signParams(params, cfg.apiSecret);
  params.api_key = cfg.apiKey;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const rt = RESOURCE_TYPES.includes(resourceType) ? resourceType : "image";
  return {
    url: `${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${rt}/download?${qs}`,
    maxAge: Math.max(0, slot + DOWNLOAD_SLOT_SECONDS - nowS),
  };
}

// Choisit l'URL de lecture d'un document stocké en privé.
// taille = "miniature" (grille) ou "original".
function fileUrlFor(doc, { taille, attachment } = {}, now = Date.now()) {
  const format = (doc.format || "").toLowerCase();
  if (doc.resource_type === "image" && DELIVERABLE_IMAGE_FORMATS.includes(format) && !attachment) {
    const thumb = taille === "miniature";
    const url = signedDeliveryUrl({
      publicId: doc.public_id,
      // HEIC (iPhone) n'est pas affichable par la plupart des navigateurs : converti en JPEG.
      format: thumb || format === "heic" ? THUMBNAIL_FORMAT : format,
      version: doc.version,
      transformation: thumb ? THUMBNAIL_TRANSFORMATION : null,
    });
    return url && { url, maxAge: 3600 };
  }
  return privateDownloadUrl(
    { publicId: doc.public_id, resourceType: doc.resource_type, format, deliveryType: doc.delivery_type, attachment },
    now
  );
}

// Supprime définitivement un fichier chez Cloudinary (destroy signé).
// Ne lève jamais d'erreur : renvoie { ok, result | error } pour journalisation.
async function destroyFile({ publicId, resourceType, deliveryType }) {
  const cfg = config();
  if (!cfg) return { ok: false, error: "Cloudinary non configuré" };
  const params = {
    public_id: publicId,
    type: deliveryType || DELIVERY_TYPE,
    invalidate: "true",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const body = new URLSearchParams({ ...params, api_key: cfg.apiKey, signature: signParams(params, cfg.apiSecret) });
  const rt = RESOURCE_TYPES.includes(resourceType) ? resourceType : "image";
  try {
    const res = await fetch(`${cfg.apiBase}/v1_1/${encodeURIComponent(cfg.cloudName)}/${rt}/destroy`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: data.result === "ok", result: data.result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  DELIVERY_TYPE,
  ROOT_FOLDER,
  ALLOWED_EXTENSIONS,
  THUMBNAIL_TRANSFORMATION,
  config,
  signParams,
  chantierFolder,
  buildUploadSignature,
  verifyUploadResult,
  signedDeliveryUrl,
  privateDownloadUrl,
  fileUrlFor,
  destroyFile,
};
