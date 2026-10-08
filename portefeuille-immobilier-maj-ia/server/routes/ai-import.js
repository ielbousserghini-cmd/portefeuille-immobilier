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
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo
});

const UNIT_TYPES = ["magasin", "appartement", "bureau", "autre"];
const MAX_ROWS = 600; // garde-fou : au-delà, suggérer de scinder le fichier
const BATCH_SIZE = 120; // locaux par appel IA (le mall de ~118 locaux tient en un seul appel)

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
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function cleanUnit(raw, index) {
  const unitType = UNIT_TYPES.includes(raw.unitType) ? raw.unitType : "autre";
  return {
    sourceRow: typeof raw.sourceRow === "number" ? raw.sourceRow : index,
    name: String(raw.name || "").trim().slice(0, 200) || `Local ${index + 1}`,
    unitType,
    tenant: String(raw.tenant || "").trim().slice(0, 200),
    tenantEmail: String(raw.tenantEmail || "").trim().slice(0, 200),
    tenantPhone: String(raw.tenantPhone || "").trim().slice(0, 60),
    rent: Number.isFinite(Number(raw.rent)) ? Math.round(Number(raw.rent) * 100) / 100 : 0,
    leaseStart: cleanDate(raw.leaseStart),
    leaseEnd: cleanDate(raw.leaseEnd),
    lastRevisionDate: cleanDate(raw.lastRevisionDate),
    note: String(raw.note || "").trim().slice(0, 300),
  };
}

const EXCEL_SYSTEM_PROMPT = `Tu aides à importer un tableau Excel (gestion locative marocaine) dans une base de données structurée.
Pour CHAQUE ligne du tableau fourni (format JSON, une ligne = un objet avec les colonnes d'origine), déduis un local de location avec ces champs :
- sourceRow (numéro de ligne fourni, à recopier tel quel)
- name (nom/numéro du local, ex. "Bureau N°12", "Magasin 3" — déduis-le des colonnes disponibles)
- unitType : un seul de "magasin", "bureau", "appartement", "autre"
- tenant (nom du locataire, ou "" si vacant)
- tenantEmail (ou "")
- tenantPhone (ou "")
- rent (loyer MENSUEL en dirhams, nombre seul, sans texte ni devise — convertis si le tableau donne un montant annuel ou trimestriel)
- leaseStart (date de début de bail au format AAAA-MM-JJ, ou "" si inconnue)
- leaseEnd (date de fin de bail au format AAAA-MM-JJ, ou "" si inconnue)
- lastRevisionDate (date de dernière révision de loyer au format AAAA-MM-JJ, ou "" si inconnue/non applicable)
- note ("" normalement ; sinon une courte remarque si la ligne est ambiguë, incomplète, ou semble être un doublon/total/en-tête à ignorer)

Ignore les lignes qui sont clairement des titres, sous-totaux ou lignes vides : ne les inclus pas dans le résultat.
Réponds UNIQUEMENT avec un tableau JSON valide (pas de texte autour, pas de bloc markdown), un objet par local.`;

router.post(
  "/excel-preview",
  requireAuth,
  requireAdmin,
  handleUploadErrors(upload.single("file")),
  async (req, res) => {
    try {
      if (!aiConfigured()) throw new AiNotConfiguredError();
      if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

      let workbook;
      try {
        workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      } catch {
        return res.status(400).json({ error: "Ce fichier ne semble pas être un tableur valide (.xlsx, .xls, .csv)." });
      }

      // Prend la première feuille non vide.
      let rows = [];
      let sheetName = null;
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const asJson = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        if (asJson.length > 0) {
          rows = asJson;
          sheetName = name;
          break;
        }
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: "Aucune ligne de données trouvée dans ce fichier." });
      }
      if (rows.length > MAX_ROWS) {
        return res.status(400).json({
          error: `Ce fichier contient ${rows.length} lignes — au-delà de ${MAX_ROWS}, scinde-le en plusieurs fichiers avant import.`,
        });
      }

      // Numérote les lignes pour pouvoir recoller un sourceRow côté IA.
      const numberedRows = rows.map((r, i) => ({ sourceRow: i, ...r }));

      const warnings = [];
      const allUnits = [];
      for (let i = 0; i < numberedRows.length; i += BATCH_SIZE) {
        const batch = numberedRows.slice(i, i + BATCH_SIZE);
        const prompt = `Voici ${batch.length} lignes (feuille "${sheetName}") à convertir :\n\n${JSON.stringify(batch)}`;
        let text;
        try {
          text = await callClaude({ system: EXCEL_SYSTEM_PROMPT, prompt, maxTokens: 8000 });
        } catch (err) {
          if (err instanceof AiNotConfiguredError) throw err;
          warnings.push(`Lignes ${i + 1}-${i + batch.length} : échec de l'analyse IA (${err.message}).`);
          continue;
        }
        let parsed;
        try {
          parsed = extractJson(text);
        } catch (err) {
          warnings.push(`Lignes ${i + 1}-${i + batch.length} : réponse IA illisible, lignes ignorées.`);
          continue;
        }
        if (!Array.isArray(parsed)) {
          warnings.push(`Lignes ${i + 1}-${i + batch.length} : format de réponse inattendu, lignes ignorées.`);
          continue;
        }
        parsed.forEach((raw, j) => allUnits.push(cleanUnit(raw, i + j)));
      }

      if (allUnits.length === 0) {
        return res.status(422).json({
          error: "L'IA n'a extrait aucun local exploitable de ce fichier.",
          warnings,
        });
      }

      res.json({ units: allUnits, warnings, sheetName, rowCount: rows.length });
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        return res.status(501).json({ error: err.message });
      }
      console.error("excel-preview:", err);
      res.status(500).json({ error: "Échec de l'analyse du fichier : " + err.message });
    }
  }
);

const CONTRACT_SYSTEM_PROMPT = `Tu analyses le texte d'un contrat de bail marocain (extrait d'un PDF ou Word) pour en tirer les informations clés d'une gestion locative.
À partir du texte fourni, déduis :
- tenant (nom complet du locataire ou raison sociale)
- tenantEmail (si mentionné, sinon "")
- tenantPhone (si mentionné, sinon "")
- rent (loyer MENSUEL en dirhams, nombre seul — convertis si le contrat indique un montant annuel/trimestriel)
- leaseStart (date de début/prise d'effet du bail, format AAAA-MM-JJ, ou "" si absente)
- leaseEnd (date de fin ou d'échéance du bail, format AAAA-MM-JJ, ou "" si absente/bail à durée indéterminée)
- lastRevisionDate (date de référence pour la révision triennale du loyer si le contrat la précise explicitement — sinon "")
- unitType : un seul de "magasin", "bureau", "appartement", "autre", déduit de l'usage du local mentionné
- propertyNameHint (nom du bien/immeuble/local tel que mentionné dans le contrat, pour aider à le retrouver dans l'app — "" si absent)
- notes (courte phrase en français signalant toute ambiguïté, clause de révision particulière, ou information manquante — "" sinon)

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de bloc markdown) contenant exactement ces champs.`;

async function extractTextFromFile(file) {
  const name = (file.originalname || "").toLowerCase();
  const isPdf = file.mimetype === "application/pdf" || name.endsWith(".pdf");
  const isDocx =
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx");
  const isTxt = file.mimetype === "text/plain" || name.endsWith(".txt");

  if (isPdf) {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(file.buffer);
    return data.text || "";
  }
  if (isDocx) {
    const mammoth = require("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value || "";
  }
  if (isTxt) {
    return file.buffer.toString("utf8");
  }
  const err = new Error(
    "Format non pris en charge — envoie un PDF, un Word (.docx) ou un fichier texte. (Les anciens .doc ne sont pas lisibles.)"
  );
  err.status = 400;
  throw err;
}

router.post(
  "/contract-analyze",
  requireAuth,
  requireAdmin,
  handleUploadErrors(upload.single("file")),
  async (req, res) => {
    try {
      if (!aiConfigured()) throw new AiNotConfiguredError();
      if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

      let text;
      try {
        text = await extractTextFromFile(req.file);
      } catch (err) {
        return res.status(err.status || 400).json({ error: err.message });
      }

      text = text.trim();
      if (!text) {
        return res.status(422).json({ error: "Aucun texte lisible n'a pu être extrait de ce fichier (scan image non pris en charge)." });
      }
      const truncated = text.length > 20000;
      const textForAi = text.slice(0, 20000);

      const prompt = `Texte du contrat${truncated ? " (tronqué, début du document uniquement)" : ""} :\n\n${textForAi}`;
      const response = await callClaude({ system: CONTRACT_SYSTEM_PROMPT, prompt, maxTokens: 2000 });
      const parsed = extractJson(response);

      const fields = {
        tenant: String(parsed.tenant || "").trim().slice(0, 200),
        tenantEmail: String(parsed.tenantEmail || "").trim().slice(0, 200),
        tenantPhone: String(parsed.tenantPhone || "").trim().slice(0, 60),
        rent: Number.isFinite(Number(parsed.rent)) ? Math.round(Number(parsed.rent) * 100) / 100 : "",
        leaseStart: cleanDate(parsed.leaseStart),
        leaseEnd: cleanDate(parsed.leaseEnd),
        lastRevisionDate: cleanDate(parsed.lastRevisionDate),
        unitType: UNIT_TYPES.includes(parsed.unitType) ? parsed.unitType : "",
        propertyNameHint: String(parsed.propertyNameHint || "").trim().slice(0, 200),
      };
      const warnings = [];
      if (parsed.notes) warnings.push(String(parsed.notes).slice(0, 300));
      if (truncated) warnings.push("Le document était long : seul le début a été analysé.");

      res.json({ fields, warnings, textPreview: text.slice(0, 500) });
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        return res.status(501).json({ error: err.message });
      }
      console.error("contract-analyze:", err);
      res.status(500).json({ error: "Échec de l'analyse du contrat : " + err.message });
    }
  }
);

module.exports = router;
