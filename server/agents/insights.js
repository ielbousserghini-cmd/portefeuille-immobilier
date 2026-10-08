// Analyse du portefeuille pour l'Assistant (agents « Recouvrement », « Baux &
// révisions » et « Qualité des données »). Fonctions pures : elles ne lisent
// que le JSON du portefeuille ({ properties, payments, expenses }) et ne
// touchent jamais à la base. Les mêmes règles que l'interface (LoyersModule)
// sont reprises ici côté serveur : loyer dû (loyer variable compris), plafonds
// de révision triennale de la loi marocaine, niveaux de relance.

const MS_PER_DAY = 86400000;

// Un loyer du mois en cours n'est considéré en retard qu'après ce jour du mois.
const GRACE_DAY = 5;
// Fenêtres de surveillance des baux.
const LEASE_END_WINDOW_DAYS = 90;
const REVISION_SOON_DAYS = 60;
// On ne remonte pas plus loin que 12 mois pour compter un retard.
const MAX_MONTHS_BACK = 12;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function periodKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function periodLabel(period) {
  const [y, m] = period.split("-");
  return `${MOIS[Number(m) - 1]} ${y}`;
}
function fmt(n) {
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(n || 0) + " DH";
}
function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
function normalize(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function guessUnitType(u) {
  if (["magasin", "appartement", "bureau", "autre"].includes(u.unitType)) return u.unitType;
  const n = (u.name || "").toLowerCase();
  if (/appart|appt|\bapt\b/.test(n)) return "appartement";
  if (/magasin|\bmag\b/.test(n)) return "magasin";
  if (/bureau/.test(n)) return "bureau";
  return "autre";
}

// Loyer variable : u.rent = minimum garanti, u.turnoverRate = % du CA,
// u.turnovers = CA déclaré par mois. Même règle que rentDue() côté client.
function isVariableRent(u) {
  return Number(u.turnoverRate) > 0;
}
function rentDue(u, period) {
  const min = Number(u.rent) || 0;
  if (!isVariableRent(u)) return min;
  const ca = Number(u.turnovers?.[period]) || 0;
  return Math.max(min, Math.round((ca * Number(u.turnoverRate)) / 100));
}

function revisionInfo(unit, today) {
  const t = guessUnitType(unit);
  const capRate = t === "magasin" ? 0.1 : t === "bureau" || t === "appartement" ? 0.08 : null;
  const ref = parseDate(unit.lastRevisionDate || unit.leaseStart);
  if (!ref || capRate === null) return null;
  const next = new Date(ref.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 3);
  return {
    capRate,
    nextDate: next,
    daysUntil: daysBetween(today, next),
    newRentMax: Math.round((Number(unit.rent) || 0) * (1 + capRate)),
  };
}

function todayUtc(now) {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
}

// Liste des mois à considérer comme dus pour un local, du plus récent au plus
// ancien : le mois en cours seulement après le jour de grâce, et jamais avant
// le début du bail s'il est connu.
function dueMonths(unit, now) {
  const months = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (now.getUTCDate() <= GRACE_DAY) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  const start = parseDate(unit.leaseStart);
  const startKey = start ? periodKey(start.getUTCFullYear(), start.getUTCMonth()) : null;
  for (let i = 0; i < MAX_MONTHS_BACK; i++) {
    const key = periodKey(y, m);
    if (startKey && key < startKey) break;
    months.push(key);
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return months;
}

// Retard d'un local : mois impayés consécutifs en partant du plus récent dû
// (on s'arrête au premier mois payé, comme les lettres de relance).
//
// Sans date de début de bail, on ne sait pas depuis quand le locataire doit
// payer : on ne remonte pas avant le premier paiement jamais enregistré pour
// ce local, et s'il n'y en a aucun, seul le dernier mois dû est compté
// (historique inconnu) — plutôt que d'inventer 12 mois d'impayés.
function unitArrears(unit, payments, now) {
  let floor = null;
  let unknownHistory = false;
  if (!unit.leaseStart) {
    const prefix = `${unit.id}|`;
    for (const [k, v] of Object.entries(payments || {})) {
      if (v?.paid && k.startsWith(prefix)) {
        const period = k.slice(prefix.length);
        if (!floor || period < floor) floor = period;
      }
    }
    if (!floor) unknownHistory = true;
  }
  const unpaid = [];
  for (const period of dueMonths(unit, now)) {
    if (floor && period < floor) break;
    if (payments?.[`${unit.id}|${period}`]?.paid) break;
    unpaid.push(period);
    if (unknownHistory) break;
  }
  const amount = unpaid.reduce((s, p) => s + rentDue(unit, p), 0);
  return { months: unpaid, amount, unknownHistory };
}

function tierFor(monthsLate) {
  if (monthsLate >= 3) return { level: 3, label: "Mise en demeure", tone: "bad" };
  if (monthsLate === 2) return { level: 2, label: "2e avertissement", tone: "bad" };
  return { level: 1, label: "1er rappel", tone: "warn" };
}

function whatsappLink(phone, text) {
  if (!phone || !String(phone).trim()) return null;
  let digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "212" + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function reminderText(tenant, months, amount, level) {
  const list = months.slice().reverse().map(periodLabel).join(", ");
  if (level >= 3) {
    return `Bonjour ${tenant}, malgré nos précédents rappels, les loyers de ${list} restent impayés (${fmt(amount)}). Sans régularisation sous 8 jours, une mise en demeure formelle vous sera adressée. Cordialement.`;
  }
  if (level === 2) {
    return `Bonjour ${tenant}, nous constatons que les loyers de ${list} (${fmt(amount)}) ne sont toujours pas réglés. Merci de procéder au paiement au plus vite. Cordialement.`;
  }
  return `Bonjour ${tenant}, petit rappel : le loyer de ${list} (${fmt(amount)}) n'a pas encore été réglé. Merci de faire le nécessaire. Bonne journée.`;
}

// Point d'entrée : toutes les analyses, prêtes à afficher ou à notifier.
function computeInsights(data, now = new Date()) {
  const today = todayUtc(now);
  const curPeriod = periodKey(now.getUTCFullYear(), now.getUTCMonth());
  const payments = data.payments || {};
  const units = [];
  for (const p of data.properties || []) {
    for (const u of p.units || []) {
      units.push({ ...u, propertyId: p.id, propertyName: p.name });
    }
  }
  const occupied = units.filter((u) => u.tenant && u.tenant.trim());

  // --- Chiffres du mois ---
  let expected = 0;
  let collected = 0;
  let paidCount = 0;
  for (const u of occupied) {
    const due = rentDue(u, curPeriod);
    expected += due;
    if (payments[`${u.id}|${curPeriod}`]?.paid) { collected += due; paidCount += 1; }
  }

  // --- Par immeuble (rapport PDF) ---
  const buildings = (data.properties || []).map((p) => {
    const us = p.units || [];
    const occ = us.filter((u) => u.tenant && u.tenant.trim());
    let exp = 0, col = 0;
    for (const u of occ) {
      const due = rentDue(u, curPeriod);
      exp += due;
      if (payments[`${u.id}|${curPeriod}`]?.paid) col += due;
    }
    return { name: p.name, units: us.length, occupied: occ.length, expected: exp, collected: col, unpaid: Math.max(0, exp - col), rate: exp ? Math.round((col / exp) * 100) : 0 };
  });

  // --- Agent Recouvrement : retards regroupés par locataire ---
  const byTenant = new Map();
  for (const u of occupied) {
    const a = unitArrears(u, payments, now);
    // Un local à loyer nul (ex. antenne gratuite) n'est jamais « en retard ».
    if (!a.months.length || a.amount <= 0) continue;
    const key = `${normalize(u.tenant)}|${u.propertyId}`;
    let t = byTenant.get(key);
    if (!t) {
      t = { tenant: u.tenant.trim(), propertyId: u.propertyId, propertyName: u.propertyName, phone: "", email: "", units: [], amount: 0, monthsLate: 0, missingLeaseStart: false, unknownHistory: false };
      byTenant.set(key, t);
    }
    t.units.push({ id: u.id, name: u.name, months: a.months, amount: a.amount });
    t.amount += a.amount;
    t.monthsLate = Math.max(t.monthsLate, a.months.length);
    if (!t.phone && u.tenantPhone) t.phone = u.tenantPhone;
    if (!t.email && u.tenantEmail) t.email = u.tenantEmail;
    if (!u.leaseStart) t.missingLeaseStart = true;
    if (a.unknownHistory) t.unknownHistory = true;
  }
  const collections = [...byTenant.values()]
    .map((t) => {
      const tier = tierFor(t.monthsLate);
      const months = t.units.reduce((acc, u) => (u.months.length > acc.length ? u.months : acc), []);
      const text = reminderText(t.tenant, months, t.amount, tier.level);
      t.units.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr", { numeric: true }));
      return { ...t, tier, oldestMonth: months[months.length - 1], message: text, whatsapp: whatsappLink(t.phone, text) };
    })
    .sort((a, b) => b.tier.level - a.tier.level || b.amount - a.amount);
  const arrearsTotal = collections.reduce((s, t) => s + t.amount, 0);

  // --- Agent Baux & révisions ---
  const leaseEnds = [];
  const revisions = [];
  for (const u of occupied) {
    const end = parseDate(u.leaseEnd);
    if (end) {
      const days = daysBetween(today, end);
      if (days <= LEASE_END_WINDOW_DAYS) {
        leaseEnds.push({ id: u.id, tenant: u.tenant, unit: u.name, propertyName: u.propertyName, leaseEnd: isoDate(end), days });
      }
    }
    const r = revisionInfo(u, today);
    if (r && r.daysUntil <= REVISION_SOON_DAYS) {
      revisions.push({
        id: u.id, tenant: u.tenant, unit: u.name, propertyName: u.propertyName,
        rent: Number(u.rent) || 0, newRentMax: r.newRentMax, capPct: Math.round(r.capRate * 100),
        date: isoDate(r.nextDate), days: r.daysUntil, eligible: r.daysUntil <= 0,
      });
    }
  }
  leaseEnds.sort((a, b) => a.days - b.days);
  revisions.sort((a, b) => a.days - b.days);

  // --- Agent Qualité des données ---
  const lastPeriod = (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return periodKey(d.getUTCFullYear(), d.getUTCMonth());
  })();
  const missingCa = occupied
    .filter((u) => isVariableRent(u) && !(Number(u.turnovers?.[lastPeriod]) > 0))
    .map((u) => ({ id: u.id, tenant: u.tenant, unit: u.name, propertyName: u.propertyName, period: lastPeriod }));
  const noLeaseStart = occupied.filter((u) => !u.leaseStart);
  const noPhone = occupied.filter((u) => !(u.tenantPhone || "").trim());
  const vacant = units.filter((u) => !(u.tenant || "").trim());
  const dataQuality = {
    missingCa,
    noLeaseStartCount: noLeaseStart.length,
    noLeaseStartByProperty: countBy(noLeaseStart, "propertyName"),
    noPhoneCount: noPhone.length,
    vacant: vacant.map((u) => ({ id: u.id, unit: u.name, propertyName: u.propertyName })),
  };

  return {
    generatedAt: now.toISOString(),
    period: curPeriod,
    periodLabel: periodLabel(curPeriod),
    graceDay: GRACE_DAY,
    month: {
      expected,
      collected,
      remaining: Math.max(0, expected - collected),
      rate: expected ? Math.round((collected / expected) * 100) : 0,
      paidCount,
      occupiedCount: occupied.length,
      unitCount: units.length,
      vacantCount: vacant.length,
    },
    buildings,
    collections,
    arrearsTotal,
    leaseEnds,
    revisions,
    dataQuality,
  };
}

function countBy(list, field) {
  const out = {};
  for (const item of list) out[item[field]] = (out[item[field]] || 0) + 1;
  return out;
}

// Texte court du briefing (notification push du matin).
function briefingNotification(ins) {
  const parts = [];
  parts.push(`${fmt(ins.month.collected)} encaissés sur ${fmt(ins.month.expected)} (${ins.month.rate} %)`);
  if (ins.collections.length) parts.push(`${ins.collections.length} locataire(s) en retard · ${fmt(ins.arrearsTotal)}`);
  const urgentLeases = ins.leaseEnds.filter((l) => l.days <= 30).length;
  if (urgentLeases) parts.push(`${urgentLeases} fin(s) de bail sous 30 j`);
  const elig = ins.revisions.filter((r) => r.eligible).length;
  if (elig) parts.push(`${elig} révision(s) de loyer possible(s)`);
  if (ins.dataQuality.missingCa.length) parts.push(`CA à saisir : ${ins.dataQuality.missingCa.map((m) => m.tenant).join(", ")}`);
  return { title: `Briefing du ${new Date(ins.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`, body: parts.join(" · ") };
}

module.exports = { computeInsights, briefingNotification, rentDue, periodLabel, fmt, GRACE_DAY };
