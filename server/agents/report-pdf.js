// Rapport PDF quotidien de l'Assistant : synthèse du mois, chiffres par
// immeuble, recouvrement, baux & révisions, qualité des données.
// Généré à partir de computeInsights() — aucune donnée n'est relue ici.
const PDFDocument = require("pdfkit");
const { fmt } = require("./insights");

const C = {
  ink: "#17191C",
  dim: "#686D74",
  faint: "#9A9EA4",
  line: "#E5E3DD",
  band: "#F2F1ED",
  gold: "#8C6A2B",
  good: "#2C7A4B",
  bad: "#B8432D",
};
const MARGIN = 48;

function frDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Casablanca" });
}

// Petit moteur de tableau : en-tête répété à chaque saut de page.
function table(doc, columns, rows, { zebra = true } = {}) {
  const width = doc.page.width - MARGIN * 2;
  const total = columns.reduce((s, c) => s + c.w, 0);
  const cols = columns.map((c) => ({ ...c, px: (c.w / total) * width }));
  const rowH = 20;

  const header = () => {
    let x = MARGIN;
    const y = doc.y;
    doc.rect(MARGIN, y, width, rowH).fill(C.band);
    doc.fillColor(C.dim).font("Helvetica-Bold").fontSize(8);
    for (const c of cols) {
      doc.text(c.label, x + 6, y + 6, { width: c.px - 12, height: 10, align: c.align || "left", ellipsis: true });
      x += c.px;
    }
    doc.y = y + rowH;
  };

  header();
  rows.forEach((r, i) => {
    if (doc.y + rowH > doc.page.height - MARGIN - 20) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    // Ligne d'intertitre (ex. un immeuble) sur toute la largeur.
    if (r.__group) {
      doc.rect(MARGIN, y, width, rowH).fill("#FBF7EE");
      doc.fillColor(C.gold).font("Helvetica-Bold").fontSize(8.5).text(r.__group, MARGIN + 6, y + 6, { width: width - 12, height: 10.5, ellipsis: true });
      doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + width, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = y + rowH;
      return;
    }
    if (zebra && i % 2 === 1) doc.rect(MARGIN, y, width, rowH).fill("#FAFAF8");
    let x = MARGIN;
    for (const c of cols) {
      const cell = r[c.key];
      const text = cell && typeof cell === "object" ? cell.text : cell;
      const color = cell && typeof cell === "object" && cell.color ? cell.color : C.ink;
      doc.fillColor(color).font(c.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
        .text(text == null ? "" : String(text), x + 6, y + 6, { width: c.px - 12, height: 10.5, align: c.align || "left", ellipsis: true });
      x += c.px;
    }
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + width, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y = y + rowH;
  });
  doc.moveDown(1.2);
}

function section(doc, title, subtitle) {
  if (doc.y > doc.page.height - MARGIN - 120) doc.addPage();
  doc.x = MARGIN;
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(13).text(title, MARGIN, doc.y);
  if (subtitle) doc.fillColor(C.dim).font("Helvetica").fontSize(9).text(subtitle, MARGIN, doc.y + 2);
  doc.moveDown(0.6);
}

function kpis(doc, items) {
  const width = doc.page.width - MARGIN * 2;
  const gap = 10;
  const w = (width - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  items.forEach((it, i) => {
    const x = MARGIN + i * (w + gap);
    doc.roundedRect(x, y, w, 58, 6).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.fillColor(C.dim).font("Helvetica").fontSize(8).text(it.label, x + 10, y + 10, { width: w - 20 });
    doc.fillColor(it.color || C.ink).font("Helvetica-Bold").fontSize(14).text(it.value, x + 10, y + 24, { width: w - 20, height: 16, ellipsis: true });
    if (it.sub) doc.fillColor(C.faint).font("Helvetica").fontSize(7.5).text(it.sub, x + 10, y + 42, { width: w - 20, height: 9, ellipsis: true });
  });
  doc.y = y + 58 + 18;
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function monthShort(p) {
  const [y, m] = p.split("-");
  return `${MOIS_COURTS[Number(m) - 1]} ${y.slice(2)}`;
}
// « oct. 26 », « 3 mois, depuis août 26 »
function monthsLabel(months) {
  if (months.length === 1) return monthShort(months[0]);
  return `${months.length} mois, depuis ${monthShort(months[months.length - 1])}`;
}

// Retourne une Promise<Buffer> du PDF.
function buildReportPdf(ins) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: `Rapport du ${ins.generatedAt.slice(0, 10)}`, Author: "Extranet — Assistant" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // En-tête
    doc.rect(0, 0, doc.page.width, 6).fill(C.gold);
    doc.fillColor(C.gold).font("Helvetica-Bold").fontSize(9).text("EXTRANET — GROUPE IMMOBILIER", MARGIN, 34, { characterSpacing: 1 });
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(22).text("Rapport quotidien", MARGIN, 50);
    doc.fillColor(C.dim).font("Helvetica").fontSize(10.5).text(frDate(ins.generatedAt).replace(/^./, (c) => c.toUpperCase()), MARGIN, 78);
    doc.y = 110;

    // Synthèse
    const m = ins.month;
    kpis(doc, [
      { label: `Encaissé · ${ins.periodLabel}`, value: fmt(m.collected), sub: `${m.rate} % de ${fmt(m.expected)}`, color: C.good },
      { label: "Reste à encaisser", value: fmt(m.remaining), sub: `${m.occupiedCount - m.paidCount} loyer(s) sur ${m.occupiedCount}` },
      { label: "Locataires en retard", value: String(ins.collections.length), sub: `${fmt(ins.arrearsTotal)} d'arriérés`, color: ins.collections.length ? C.bad : C.good },
      { label: "Occupation", value: `${m.unitCount ? Math.round((m.occupiedCount / m.unitCount) * 100) : 0} %`, sub: `${m.occupiedCount} loués · ${m.vacantCount} vacants` },
    ]);

    section(doc, "Par immeuble", `Loyers du mois de ${ins.periodLabel}.`);
    table(doc, [
      { key: "name", label: "Immeuble", w: 30, bold: true },
      { key: "units", label: "Locaux", w: 9, align: "right" },
      { key: "occupied", label: "Loués", w: 9, align: "right" },
      { key: "collected", label: "Encaissé", w: 17, align: "right" },
      { key: "unpaid", label: "Impayé", w: 17, align: "right" },
      { key: "rate", label: "Taux", w: 10, align: "right" },
    ], ins.buildings.filter((b) => b.units > 0).map((b) => ({
      name: b.name, units: b.units, occupied: b.occupied,
      collected: { text: fmt(b.collected), color: C.good },
      unpaid: { text: fmt(b.unpaid), color: b.unpaid ? C.bad : C.dim },
      rate: `${b.rate} %`,
    })));

    section(doc, "Recouvrement", `${ins.collections.length} locataire(s) en retard · ${fmt(ins.arrearsTotal)}. Le mois en cours compte à partir du ${ins.graceDay}.`);
    if (ins.collections.length) {
      // Regroupé par immeuble, avec un intertitre par immeuble.
      const byProp = new Map();
      for (const c of ins.collections) {
        if (!byProp.has(c.propertyName)) byProp.set(c.propertyName, []);
        byProp.get(c.propertyName).push(c);
      }
      const rows = [];
      for (const [prop, list] of byProp) {
        rows.push({ __group: `${prop}  ·  ${list.length} locataire(s)  ·  ${fmt(list.reduce((t, c) => t + c.amount, 0))}` });
        for (const c of list) {
          rows.push({
            tier: { text: c.tier.label, color: c.tier.level >= 2 ? C.bad : C.gold },
            tenant: c.tenant,
            units: c.units.length > 2 ? `${c.units.length} locaux` : c.units.map((u) => u.name).join(", "),
            months: monthsLabel(c.units[0].months) + (c.unknownHistory ? " *" : ""),
            amount: fmt(c.amount),
          });
        }
      }
      table(doc, [
        { key: "tier", label: "Relance", w: 17 },
        { key: "tenant", label: "Locataire", w: 31, bold: true },
        { key: "units", label: "Locaux", w: 18 },
        { key: "months", label: "Impayé", w: 21 },
        { key: "amount", label: "Montant", w: 13, align: "right" },
      ], rows);
      if (ins.collections.some((c) => c.unknownHistory)) {
        doc.fillColor(C.faint).font("Helvetica").fontSize(7.5).text("* Sans date de début de bail ni paiement enregistré : seul le dernier mois dû est compté.", MARGIN, doc.y - 8);
        doc.moveDown(1);
      }
    } else {
      doc.fillColor(C.good).font("Helvetica").fontSize(10).text("Aucun retard : tous les loyers dus sont encaissés.");
      doc.moveDown(1);
    }

    section(doc, "Baux & révisions", "Fins de bail sous 90 jours et révisions triennales possibles.");
    const leaseRows = [
      ...ins.leaseEnds.map((l) => ({ kind: { text: l.days < 0 ? "Bail expiré" : "Fin de bail", color: l.days < 0 ? C.bad : C.gold }, tenant: l.tenant, where: `${l.propertyName} · ${l.unit}`, detail: `${new Date(l.leaseEnd).toLocaleDateString("fr-FR")} (${l.days < 0 ? `depuis ${-l.days} j` : `dans ${l.days} j`})` })),
      ...ins.revisions.map((r) => ({ kind: { text: r.eligible ? "Révision possible" : "Révision à venir", color: C.good }, tenant: r.tenant, where: `${r.propertyName} · ${r.unit}`, detail: `${fmt(r.rent)} -> ${fmt(r.newRentMax)} max (+${r.capPct} %)` })),
    ];
    if (leaseRows.length) {
      table(doc, [
        { key: "kind", label: "Type", w: 18 },
        { key: "tenant", label: "Locataire", w: 24, bold: true },
        { key: "where", label: "Immeuble · local", w: 28 },
        { key: "detail", label: "Détail", w: 30 },
      ], leaseRows);
    } else {
      doc.fillColor(C.dim).font("Helvetica").fontSize(10).text(
        ins.dataQuality.noLeaseStartCount
          ? `Rien à signaler, mais ${ins.dataQuality.noLeaseStartCount} local(aux) n'ont pas de dates de bail : ils ne peuvent pas être surveillés.`
          : "Rien à signaler."
      );
      doc.moveDown(1);
    }

    section(doc, "Qualité des données");
    const dq = ins.dataQuality;
    const lines = [
      dq.missingCa.length ? `CA du mois précédent à saisir : ${dq.missingCa.map((x) => x.tenant).join(", ")}.` : "CA des loyers variables : à jour.",
      dq.noLeaseStartCount ? `${dq.noLeaseStartCount} local(aux) sans date de début de bail (${Object.entries(dq.noLeaseStartByProperty).map(([p, n]) => `${p} : ${n}`).join(", ")}).` : "Dates de bail : renseignées.",
      dq.noPhoneCount ? `${dq.noPhoneCount} locataire(s) sans téléphone (relances WhatsApp impossibles).` : "Téléphones : renseignés.",
      dq.vacant.length ? `${dq.vacant.length} local(aux) vacant(s).` : "Aucun local vacant.",
    ];
    doc.fillColor(C.ink).font("Helvetica").fontSize(9.5);
    lines.forEach((l) => doc.text(`•  ${l}`, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 }).moveDown(0.3));

    // Pied de page sur chaque page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Écrire sous la marge basse déclencherait sinon une page blanche.
      doc.page.margins.bottom = 0;
      doc.fillColor(C.faint).font("Helvetica").fontSize(7.5).text(
        `Généré automatiquement par l'Assistant de l'extranet · page ${i + 1}/${range.count}`,
        MARGIN, doc.page.height - MARGIN + 14, { width: doc.page.width - MARGIN * 2, align: "center", lineBreak: false }
      );
    }
    doc.end();
  });
}

module.exports = { buildReportPdf };
