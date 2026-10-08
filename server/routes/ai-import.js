const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { requireAuth, requireAdmin } = require("../auth");
const { callClaude, extractJson, aiConfigured, AiNotConfiguredError } = require("../ai");

const router = express.Router();

// Tout reste en mémoire (pas de disque persistant sur Render) ; les fichiers
// ne sont jamais écrits sur disque ni conservés après la requête.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15 Mo, un seul fichier
});

const UNIT_TYPES = ["magasin", "appartement", "bureau", "autre"];
const PROPERTY_TYPES = ["magasin", "immeuble", "mall"];
const MAX_ROWS = 800; // garde-fou : au-delà, suggérer de scinder le fichier
const BATCH_SIZE = 40; // lignes par appel IA (réponse assez courte pour ne pas être tronquée)
const PARALLEL_BATCHES = 3; // appels IA simultanés (le mall de ~118 locaux = 3 lots en parallèle)
const MAX_TEXT_CHARS = 60000;

function handleUploadErrors(fn) {
  return (req, res, next) => {
    fn(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Fichier trop volumineux (15 Mo max)." });
        }
        return res.status(400).json({ error: "Échec de la lecture du fichier envoyé." });
      }
      next();
    });
  };
}

function cleanDate(v) {
  if (!v || typeof v !== "string") return "";
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  // Refuse les dates impossibles (ex. 2022-02-31) plutôt que de les enregistrer.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function str(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function cleanUnit(raw, index) {
  const rent = Number(String(raw.rent ?? "").replace(/[\s ]/g, "").replace(",", "."));
  return {
    sourceRow: typeof raw.sourceRow === "number" ? raw.sourceRow : index,
    name: str(raw.name, 200) || `Local ${index + 1}`,
    unitType: UNIT_TYPES.includes(raw.unitType) ? raw.unitType : "autre",
    tenant: str(raw.tenant, 200),
    tenantEmail: str(raw.tenantEmail, 200),
    tenantPhone: str(raw.tenantPhone, 60),
    rent: Number.isFinite(rent) && rent >= 0 ? Math.round(rent * 100) / 100 : 0,
    leaseStart: cleanDate(raw.leaseStart),
    leaseEnd: cleanDate(raw.leaseEnd),
    lastRevisionDate: cleanDate(raw.lastRevisionDate),
    note: str(raw.note, 300),
  };
}

function cleanProperty(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = {
    name: str(raw.name, 200),
    type: PROPERTY_TYPES.includes(raw.type) ? raw.type : "",
    city: str(raw.city, 120),
    address: str(raw.address, 300),
    titleDeed: str(raw.titleDeed, 120),
  };
  return Object.values(p).some(Boolean) ? p : null;
}

const UNIT_FIELDS = `- sourceRow (numéro de ligne fourni, à recopier tel quel ; pour un document sans lignes numérotées, numérote à partir de 0)
- name (nom/numéro du local, ex. "Bureau N°12", "Magasin 3" — déduis-le des colonnes disponibles)
- unitType : un seul de "magasin", "bureau", "appartement", "autre"
- tenant (nom du locataire ou raison sociale)
- tenantEmail, tenantPhone
- rent (loyer MENSUEL en dirhams, nombre seul, sans texte ni devise — convertis si le document donne un montant annuel ou trimestriel)
- leaseStart, leaseEnd (dates de début et de fin de bail au format AAAA-MM-JJ ; au Maroc les dates s'écrivent jour/mois/année)
- lastRevisionDate (date de dernière révision de loyer au format AAAA-MM-JJ)
- note (courte remarque seulement si la ligne est ambiguë, incomplète, ou semble être un doublon)
N'inclus PAS les champs vides ou inconnus (omets-les pour gagner de la place).`;

const PROPERTY_FIELDS = `- name (nom du bien/immeuble/centre commercial, souvent dans le titre, le nom du fichier ou de la feuille)
- type : un seul de "magasin" (un seul local commercial), "immeuble" (immeuble d'appartements/bureaux), "mall" (centre commercial, kissaria/qissariya, galerie de nombreux magasins)
- city, address, titleDeed (numéro de titre foncier, ex. "TF n°9970/S")
Omets les champs inconnus.`;

const TABLE_SYSTEM_PROMPT = `Tu aides à importer un fichier de gestion locative marocaine (état locatif, liste de locaux, tableau de loyers) dans une base de données structurée.
On te donne des lignes de tableau au format JSON (une ligne = un objet avec les colonnes d'origine, plus "sourceRow" et "_feuille").
Pour CHAQUE ligne qui décrit un local loué ou vacant, produis un objet "local" avec ces champs :
${UNIT_FIELDS}

Ignore les lignes qui sont des titres, sous-totaux, totaux ou lignes vides : ne les inclus pas.
Si on te le demande, déduis aussi le bien (l'immeuble) concerné, avec ces champs :
${PROPERTY_FIELDS}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni bloc markdown, de la forme :
{"property": {...} ou null, "units": [ ... ]}`;

const DOCUMENT_SYSTEM_PROMPT = `Tu aides à importer un document de gestion locative marocaine (état locatif, liste de locaux, contrat, fiche d'immeuble, photo d'un tableau) dans une base de données structurée.
Repère tous les locaux (magasins, bureaux, appartements…) décrits dans le document. Pour chacun, produis un objet "local" avec ces champs :
${UNIT_FIELDS}

Déduis aussi le bien (l'immeuble) concerné, avec ces champs :
${PROPERTY_FIELDS}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni bloc markdown, de la forme :
{"property": {...} ou null, "units": [ ... ]}`;

// Identifie le type de fichier reçu, à partir de l'extension et du type MIME.
function fileKind(file) {
  const name = (file.originalname || "").toLowerCase();
  const mt = file.mimetype || "";
  if (/\.(xlsx|xlsm|xls|ods|csv)$/.test(name) || /spreadsheet|ms-excel|csv/.test(mt)) return "table";
  if (name.endsWith(".pdf") || mt === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (/\.(png|jpe?g|webp|gif)$/.test(name) || /^image\/(png|jpeg|webp|gif)$/.test(mt)) return "image";
  if (name.endsWith(".txt") || mt === "text/plain") return "text";
  return null;
}

function imageMediaType(file) {
  const name = (file.originalname || "").toLowerCase();
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) return file.mimetype;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function unsupportedError() {
  const err = new Error(
    "Format non pris en charge. Envoie un Excel (.xlsx, .xls), un CSV, un PDF, un Word (.docx) ou une photo (JPG, PNG)."
  );
  err.status = 400;
  return err;
}

// Lit toutes les feuilles non vides d'un classeur. Les clés commençant par
// "_" ou "__" sont propres à la librairie (colonnes sans en-tête) : on les
// garde, l'IA sait les interpréter, mais on enlève les valeurs vides.
function readWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  } catch {
    const err = new Error("Ce fichier ne semble pas être un tableur valide (.xlsx, .xls, .csv).");
    err.status = 400;
    throw err;
  }
  const rows = [];
  const heads = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const asJson = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    const nonEmpty = asJson.filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));
    if (nonEmpty.length === 0) continue;
    // Les toutes premières lignes brutes (titre du tableau, nom de l'immeuble…)
    // aident l'IA à deviner le bien concerné.
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    heads.push({ feuille: sheetName, premieresLignes: raw.slice(0, 6) });
    for (const r of nonEmpty) {
      const clean = {};
      for (const [k, v] of Object.entries(r)) {
        const s = String(v).trim();
        if (s !== "") clean[k] = s.slice(0, 300);
      }
      rows.push({ _feuille: sheetName, ...clean });
    }
  }
  return { rows, heads, sheetNames: workbook.SheetNames };
}

// Exécute des tâches asynchrones par paquets de `limit` à la fois.
async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function analyzeTable(file, wantProperty) {
  const { rows, heads, sheetNames } = readWorkbook(file.buffer);
  if (rows.length === 0) {
    const err = new Error("Aucune ligne de données trouvée dans ce fichier.");
    err.status = 400;
    throw err;
  }
  if (rows.length > MAX_ROWS) {
    const err = new Error(`Ce fichier contient ${rows.length} lignes. Au-delà de ${MAX_ROWS}, scinde-le en plusieurs fichiers avant import.`);
    err.status = 400;
    throw err;
  }

  const numbered = rows.map((r, i) => ({ sourceRow: i, ...r }));
  const batches = [];
  for (let i = 0; i < numbered.length; i += BATCH_SIZE) batches.push({ start: i, rows: numbered.slice(i, i + BATCH_SIZE) });

  const warnings = [];
  const tasks = batches.map((b, idx) => async () => {
    const askProperty = wantProperty && idx === 0;
    const prompt =
      `Nom du fichier : "${file.originalname || ""}". Feuilles : ${JSON.stringify(sheetNames)}.\n` +
      (askProperty
        ? `Déduis aussi le bien concerné ("property"). Début brut de chaque feuille, pour t'aider : ${JSON.stringify(heads)}\n`
        : `Ne déduis pas le bien : mets "property": null.\n`) +
      `\nVoici ${b.rows.length} lignes à convertir :\n${JSON.stringify(b.rows)}`;
    const label = `Lignes ${b.start + 1} à ${b.start + b.rows.length}`;
    try {
      const text = await callClaude({ system: TABLE_SYSTEM_PROMPT, prompt, maxTokens: 16000 });
      const parsed = extractJson(text);
      const units = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.units) ? parsed.units : null;
      if (!units) {
        warnings.push(`${label} : format de réponse inattendu, lignes ignorées.`);
        return { units: [], property: null };
      }
      return { units, property: Array.isArray(parsed) ? null : parsed.property };
    } catch (err) {
      if (err instanceof AiNotConfiguredError) throw err;
      warnings.push(`${label} : échec de l'analyse IA (${err.message}).`);
      return { units: [], property: null };
    }
  });

  const results = await runLimited(tasks, PARALLEL_BATCHES);
  const units = [];
  results.forEach((r) => r.units.forEach((u) => units.push(cleanUnit(u, units.length))));
  return {
    property: wantProperty ? cleanProperty(results[0]?.property) : null,
    units,
    warnings,
    source: { fileName: file.originalname || "", sheetNames, rowCount: rows.length },
  };
}

async function analyzeDocument(file, kind) {
  let content;
  if (kind === "pdf") {
    // Le PDF est envoyé tel quel à Claude, qui lit aussi les scans.
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") } },
      { type: "text", text: `Nom du fichier : "${file.originalname || ""}". Extrais le bien et ses locaux.` },
    ];
  } else if (kind === "image") {
    content = [
      { type: "image", source: { type: "base64", media_type: imageMediaType(file), data: file.buffer.toString("base64") } },
      { type: "text", text: `Nom du fichier : "${file.originalname || ""}". Extrais le bien et ses locaux.` },
    ];
  } else {
    const text = await extractText(file, kind);
    if (!text.trim()) {
      const err = new Error("Aucun texte lisible n'a pu être extrait de ce fichier.");
      err.status = 422;
      throw err;
    }
    content = `Nom du fichier : "${file.originalname || ""}".\n\nContenu du document${text.length > MAX_TEXT_CHARS ? " (tronqué)" : ""} :\n\n${text.slice(0, MAX_TEXT_CHARS)}`;
  }
  const response = await callClaude({ system: DOCUMENT_SYSTEM_PROMPT, content, maxTokens: 16000 });
  const parsed = extractJson(response);
  const rawUnits = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.units) ? parsed.units : [];
  return {
    property: cleanProperty(Array.isArray(parsed) ? null : parsed?.property),
    units: rawUnits.map((u, i) => cleanUnit(u, i)),
    warnings: [],
    source: { fileName: file.originalname || "" },
  };
}

async function extractText(file, kind) {
  if (kind === "docx") {
    const mammoth = require("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value || "";
  }
  return file.buffer.toString("utf8");
}

// Import de n'importe quel fichier (Excel, CSV, PDF, Word, photo) : l'IA en
// tire la liste des locaux et, si demandé, les informations du bien. Rien
// n'est enregistré ici : la réponse sert d'aperçu, l'enregistrement se fait
// côté interface une fois que l'admin a confirmé.
async function fileImportHandler(req, res) {
  try {
    if (!aiConfigured()) throw new AiNotConfiguredError();
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const kind = fileKind(req.file);
    if (!kind) throw unsupportedError();
    const wantProperty = req.query.withProperty === "1" || req.body?.withProperty === "1";

    const result = kind === "table" ? await analyzeTable(req.file, wantProperty) : await analyzeDocument(req.file, kind);
    if (!wantProperty) result.property = null;

    if (result.units.length === 0 && !result.property) {
      return res.status(422).json({ error: "L'IA n'a trouvé aucun local exploitable dans ce fichier.", warnings: result.warnings });
    }
    res.json({ ...result, rowCount: result.source.rowCount ?? result.units.length });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return res.status(501).json({ error: err.message });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("file-import:", err);
    res.status(500).json({ error: "Échec de l'analyse du fichier : " + err.message });
  }
}

router.post("/file-import", requireAuth, requireAdmin, handleUploadErrors(upload.single("file")), fileImportHandler);
// Ancien nom de la route, conservé pour compatibilité.
router.post("/excel-preview", requireAuth, requireAdmin, handleUploadErrors(upload.single("file")), fileImportHandler);

const CONTRACT_SYSTEM_PROMPT = `Tu analyses un contrat de bail marocain pour en tirer les informations clés d'une gestion locative.
Déduis :
- tenant (nom complet du locataire ou raison sociale)
- tenantEmail (si mentionné, sinon "")
- tenantPhone (si mentionné, sinon "")
- rent (loyer MENSUEL en dirhams, nombre seul — convertis si le contrat indique un montant annuel/trimestriel)
- leaseStart (date de début/prise d'effet du bail, format AAAA-MM-JJ, ou "" si absente)
- leaseEnd (date de fin ou d'échéance du bail, format AAAA-MM-JJ, ou "" si absente/bail à durée indéterminée)
- lastRevisionDate (date de référence pour la révision triennale du loyer si le contrat la précise explicitement — sinon "")
- unitType : un seul de "magasin", "bureau", "appartement", "autre", déduit de l'usage du local mentionné
- unitName (numéro ou nom du local tel que mentionné, ex. "Magasin n°14" — "" si absent)
- propertyNameHint (nom du bien/immeuble tel que mentionné dans le contrat — "" si absent)
- notes (courte phrase en français signalant toute ambiguïté, clause de révision particulière, ou information manquante — "" sinon)

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de bloc markdown) contenant exactement ces champs.`;

router.post(
  "/contract-analyze",
  requireAuth,
  requireAdmin,
  handleUploadErrors(upload.single("file")),
  async (req, res) => {
    try {
      if (!aiConfigured()) throw new AiNotConfiguredError();
      if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
      const kind = fileKind(req.file);
      if (!kind || kind === "table") {
        return res.status(400).json({ error: "Envoie le contrat en PDF, en Word (.docx) ou en photo (JPG, PNG)." });
      }

      let content;
      const warnings = [];
      if (kind === "pdf") {
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: req.file.buffer.toString("base64") } },
          { type: "text", text: "Analyse ce contrat de bail." },
        ];
      } else if (kind === "image") {
        content = [
          { type: "image", source: { type: "base64", media_type: imageMediaType(req.file), data: req.file.buffer.toString("base64") } },
          { type: "text", text: "Analyse ce contrat de bail (photo)." },
        ];
      } else {
        const text = (await extractText(req.file, kind)).trim();
        if (!text) return res.status(422).json({ error: "Aucun texte lisible n'a pu être extrait de ce fichier." });
        if (text.length > MAX_TEXT_CHARS) warnings.push("Le document était long : seul le début a été analysé.");
        content = `Texte du contrat :\n\n${text.slice(0, MAX_TEXT_CHARS)}`;
      }

      const response = await callClaude({ system: CONTRACT_SYSTEM_PROMPT, content, maxTokens: 2000 });
      const parsed = extractJson(response);
      const rent = Number(String(parsed.rent ?? "").replace(/[\s ]/g, "").replace(",", "."));

      const fields = {
        tenant: str(parsed.tenant, 200),
        tenantEmail: str(parsed.tenantEmail, 200),
        tenantPhone: str(parsed.tenantPhone, 60),
        rent: parsed.rent !== "" && Number.isFinite(rent) ? Math.round(rent * 100) / 100 : "",
        leaseStart: cleanDate(parsed.leaseStart),
        leaseEnd: cleanDate(parsed.leaseEnd),
        lastRevisionDate: cleanDate(parsed.lastRevisionDate),
        unitType: UNIT_TYPES.includes(parsed.unitType) ? parsed.unitType : "",
        unitName: str(parsed.unitName, 200),
        propertyNameHint: str(parsed.propertyNameHint, 200),
      };
      if (parsed.notes) warnings.unshift(str(parsed.notes, 300));

      res.json({ fields, warnings });
    } catch (err) {
      if (err instanceof AiNotConfiguredError) return res.status(501).json({ error: err.message });
      console.error("contract-analyze:", err);
      res.status(500).json({ error: "Échec de l'analyse du contrat : " + err.message });
    }
  }
);

module.exports = router;
