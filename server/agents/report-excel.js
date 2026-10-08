// Classeur Excel du portefeuille, joint aux emails de rapport :
// Synthèse · Locaux · Paiements de l'année · Retards · Échéances.
const XLSX = require("xlsx");
const { rentDue } = require("./insights");

const MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function sheet(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
  if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  return ws;
}

// data : JSON du portefeuille ; ins : computeInsights(data). Retourne un Buffer.
function buildReportExcel(data, ins) {
  const payments = data.payments || {};
  const now = new Date(ins.generatedAt);
  const year = now.getUTCFullYear();
  const curPeriod = ins.period;
  const units = [];
  for (const p of data.properties || []) for (const u of p.units || []) units.push({ ...u, propertyName: p.name });

  const wb = XLSX.utils.book_new();

  // Synthèse
  const m = ins.month;
  const synth = [
    ["Rapport du portefeuille", new Date(ins.generatedAt).toLocaleDateString("fr-FR")],
    [],
    ["Mois", ins.periodLabel],
    ["Loyers attendus (DH)", Math.round(m.expected)],
    ["Encaissés (DH)", Math.round(m.collected)],
    ["Reste à encaisser (DH)", Math.round(m.remaining)],
    ["Taux d'encaissement", m.rate / 100],
    ["Locaux loués / total", `${m.occupiedCount} / ${m.unitCount}`],
    ["Locataires en retard", ins.collections.length],
    ["Arriérés (DH)", Math.round(ins.arrearsTotal)],
    [],
    ["Immeuble", "Locaux", "Loués", "Attendu (DH)", "Encaissé (DH)", "Impayé (DH)", "Taux"],
    ...ins.buildings.filter((b) => b.units).map((b) => [b.name, b.units, b.occupied, Math.round(b.expected), Math.round(b.collected), Math.round(b.unpaid), b.rate / 100]),
  ];
  const wsS = XLSX.utils.aoa_to_sheet(synth);
  wsS["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
  wsS.B7.z = "0%";
  for (let r = 12; r < synth.length; r++) { const c = XLSX.utils.encode_cell({ r, c: 6 }); if (wsS[c]) wsS[c].z = "0%"; }
  XLSX.utils.book_append_sheet(wb, wsS, "Synthèse");

  // Locaux
  XLSX.utils.book_append_sheet(wb, sheet([
    ["Immeuble", "Local", "Type", "Locataire", "Loyer (DH)", "Loyer variable", `Dû ${ins.periodLabel} (DH)`, `Payé ${ins.periodLabel}`, "Début bail", "Fin bail", "Téléphone", "Email"],
    ...units.map((u) => [
      u.propertyName, u.name, u.unitType || "", u.tenant || "Vacant", Number(u.rent) || 0,
      Number(u.turnoverRate) > 0 ? `${u.turnoverRate} % du CA` : "",
      u.tenant ? rentDue(u, curPeriod) : 0,
      u.tenant ? (payments[`${u.id}|${curPeriod}`]?.paid ? "Oui" : "Non") : "",
      u.leaseStart || "", u.leaseEnd || "", u.tenantPhone || "", u.tenantEmail || "",
    ]),
  ], [22, 22, 12, 30, 11, 14, 14, 10, 11, 11, 14, 24]), "Locaux");

  // Paiements de l'année : une ligne par local occupé, une colonne par mois
  const occupied = units.filter((u) => u.tenant && u.tenant.trim());
  XLSX.utils.book_append_sheet(wb, sheet([
    ["Immeuble", "Local", "Locataire", ...MOIS.map((mm) => `${mm} ${year}`)],
    ...occupied.map((u) => [
      u.propertyName, u.name, u.tenant,
      ...MOIS.map((_, i) => {
        const period = `${year}-${String(i + 1).padStart(2, "0")}`;
        if (period > curPeriod) return "";
        const p = payments[`${u.id}|${period}`];
        return p?.paid ? `Payé${p.markedBy ? ` (${p.markedBy})` : ""}` : "Impayé";
      }),
    ]),
  ], [22, 18, 28, ...MOIS.map(() => 11)]), `Paiements ${year}`);

  // Retards
  XLSX.utils.book_append_sheet(wb, sheet([
    ["Relance conseillée", "Locataire", "Immeuble", "Locaux", "Mois impayés", "Montant (DH)", "Téléphone"],
    ...ins.collections.map((c) => [
      c.tier.label, c.tenant, c.propertyName, c.units.map((x) => x.name).join(", "),
      c.units[0].months.slice().reverse().join(", ") + (c.unknownHistory ? " (historique inconnu)" : ""),
      Math.round(c.amount), c.phone || "",
    ]),
  ], [18, 30, 22, 36, 30, 13, 14]), "Retards");

  // Échéances
  XLSX.utils.book_append_sheet(wb, sheet([
    ["Type", "Locataire", "Immeuble", "Local", "Date", "Détail"],
    ...ins.leaseEnds.map((l) => [l.days < 0 ? "Bail expiré" : "Fin de bail", l.tenant, l.propertyName, l.unit, l.leaseEnd, l.days < 0 ? `dépassé de ${-l.days} j` : `dans ${l.days} j`]),
    ...ins.revisions.map((r) => [r.eligible ? "Révision possible" : "Révision à venir", r.tenant, r.propertyName, r.unit, r.date, `${r.rent} DH → ${r.newRentMax} DH max (+${r.capPct} %)`]),
  ], [18, 28, 22, 18, 12, 34]), "Échéances");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
}

module.exports = { buildReportExcel };
