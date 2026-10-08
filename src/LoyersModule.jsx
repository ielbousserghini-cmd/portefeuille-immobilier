import { useState, useEffect, useMemo } from "react";
import { Building2, Store, Landmark, Plus, X, Pencil, Trash2, ChevronDown, ChevronRight, Wallet, TrendingUp, AlertTriangle, CheckCircle2, Circle, MapPin, Download, Upload, CalendarClock, DoorOpen, FileText, Printer, Copy, Receipt, Mail, MessageCircle, Percent } from "lucide-react";
import { api } from "./api";
import { fontImport, styles, IconBtn } from "./theme.jsx";

const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const TYPES = {
  magasin: { label: "Magasin", icon: Store },
  immeuble: { label: "Immeuble", icon: Building2 },
  mall: { label: "Mall", icon: Landmark },
};
const UNIT_TYPES = {
  magasin: "Magasin",
  appartement: "Appartement",
  bureau: "Bureau",
  autre: "Autre",
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(n) {
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(n || 0) + " DH";
}
function periodKey(y, m) { return `${y}-${String(m + 1).padStart(2, "0")}`; }

// Loyer variable (ex. grande surface) : u.rent est alors le minimum garanti,
// u.turnoverRate le pourcentage du chiffre d'affaires, et u.turnovers le CA
// déclaré par mois ({ "2026-10": 1800000 }). Le loyer dû d'un mois est le plus
// élevé des deux ; tant que le CA du mois n'est pas saisi, c'est le minimum.
function isVariableRent(u) { return Number(u.turnoverRate) > 0; }
function rentDue(u, period) {
  const min = Number(u.rent) || 0;
  if (!isVariableRent(u)) return min;
  const ca = Number(u.turnovers?.[period]) || 0;
  return Math.max(min, Math.round((ca * Number(u.turnoverRate)) / 100));
}
// Loyer annuel d'un local : 12 × le loyer fixe, ou pour un loyer variable la
// somme des loyers dus de l'année (minimum garanti pour les mois sans CA saisi).
function unitAnnualRent(u, year) {
  if (!isVariableRent(u)) return (Number(u.rent) || 0) * 12;
  let total = 0;
  for (let m = 0; m < 12; m++) total += rentDue(u, periodKey(year, m));
  return total;
}
function fmtRate(r) { return `${String(Number(r)).replace(".", ",")} %`; }
function guessUnitType(u) {
  if (u.unitType && UNIT_TYPES[u.unitType]) return u.unitType;
  const n = (u.name || "").toLowerCase();
  if (/appart|appt|\bapt\b/.test(n)) return "appartement";
  if (/magasin|\bmag\b/.test(n)) return "magasin";
  if (/bureau/.test(n)) return "bureau";
  return "autre";
}

export default function LoyersModule({ currentUser }) {
  const isAdmin = currentUser.role === "admin";

  const [properties, setProperties] = useState(null);
  const [payments, setPayments] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState(isAdmin ? "dashboard" : "biens");
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [modal, setModal] = useState(null); // {type:'property'|'unit', data, propertyId}
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPortfolio();
        const rawProps = data.properties || [];
        let needsMigration = false;
        const fixedProps = rawProps.map((p) => ({
          ...p,
          units: (p.units || []).map((u) => {
            if (u.unitType && UNIT_TYPES[u.unitType]) return u;
            needsMigration = true;
            return { ...u, unitType: guessUnitType(u) };
          }),
        }));
        setProperties(fixedProps);
        setPayments(data.payments || {});
        setExpenses(data.expenses || []);
        if (needsMigration && isAdmin) {
          api.savePortfolio({ properties: fixedProps, payments: data.payments || {}, expenses: data.expenses || [] }).catch(() => {});
        }
      } catch {
        setProperties([]);
        setPayments({});
        setExpenses([]);
      }
      setLoaded(true);
    })();
  }, []);

  async function persist(nextProps, nextPay, nextExp) {
    // Un compte "employé" est en lecture seule : aucun bouton de l'interface
    // ne devrait appeler persist() pour lui, mais on bloque aussi ici par
    // sécurité (le serveur refuserait de toute façon l'écriture).
    if (!isAdmin) return;
    const p = nextProps !== undefined ? nextProps : properties;
    const pay = nextPay !== undefined ? nextPay : payments;
    const exp = nextExp !== undefined ? nextExp : expenses;
    setProperties(p);
    setPayments(pay);
    setExpenses(exp);
    try {
      await api.savePortfolio({ properties: p, payments: pay, expenses: exp });
    } catch {
      setError("Échec de la sauvegarde. Réessayez.");
      setTimeout(() => setError(null), 3000);
    }
  }

  const now = new Date();
  const curPeriod = periodKey(now.getFullYear(), now.getMonth());

  const allUnits = useMemo(() => {
    if (!properties) return [];
    return properties.flatMap((p) => (p.units || []).map((u) => ({ ...u, propertyId: p.id, propertyName: p.name, propertyType: p.type })));
  }, [properties]);

  const stats = useMemo(() => {
    const occupied = allUnits.filter((u) => u.tenant && u.tenant.trim());
    const expected = occupied.reduce((s, u) => s + rentDue(u, curPeriod), 0);
    const collected = occupied.reduce((s, u) => {
      const p = payments?.[`${u.id}|${curPeriod}`];
      return s + (p?.paid ? rentDue(u, curPeriod) : 0);
    }, 0);
    const unpaid = occupied
      .filter((u) => !payments?.[`${u.id}|${curPeriod}`]?.paid)
      .map((u) => ({ ...u, due: rentDue(u, curPeriod) }));
    return {
      totalProps: properties?.length || 0,
      totalUnits: allUnits.length,
      occupiedCount: occupied.length,
      vacantCount: allUnits.length - occupied.length,
      occupancyRate: allUnits.length ? Math.round((occupied.length / allUnits.length) * 100) : 0,
      expected,
      collected,
      unpaid,
    };
  }, [allUnits, payments, curPeriod]);

  function openAddProperty(city) { setModal({ type: "property", data: { name: "", type: "magasin", address: "", city: city || "", estimatedValue: "", titleDeed: "" } }); }
  function openEditProperty(p) { setModal({ type: "property", data: { ...p } }); }
  function openAddUnit(propertyId) { setModal({ type: "unit", propertyId, data: { name: "", unitType: "magasin", tenant: "", tenantEmail: "", tenantPhone: "", rent: "", leaseStart: "", leaseEnd: "" } }); }
  function openEditUnit(propertyId, u) { setModal({ type: "unit", propertyId, data: { ...u } }); }
  function openAddBulk(propertyId) { setModal({ type: "bulk", propertyId, data: { unitType: "magasin", prefix: "", start: 1, end: 3, rent: "" } }); }
  function openAddExpense(propertyId) { setModal({ type: "expense", propertyId, data: { label: "", amount: "", date: new Date().toISOString().slice(0, 10) } }); }

  function saveProperty(data) {
    const next = [...properties];
    if (data.id) {
      const i = next.findIndex((p) => p.id === data.id);
      next[i] = { ...next[i], ...data };
    } else {
      next.push({ id: uid(), name: data.name, type: data.type, address: data.address, city: data.city || "", estimatedValue: data.estimatedValue || "", titleDeed: data.titleDeed || "", valeurLocative: data.valeurLocative || "", units: [] });
    }
    persist(next, payments);
    setModal(null);
  }

  function deleteProperty(id) {
    persist(properties.filter((p) => p.id !== id), payments, (expenses || []).filter((e) => e.propertyId !== id));
    setSelectedPropertyId((cur) => (cur === id ? null : cur));
  }

  function saveUnit(propertyId, data) {
    const next = properties.map((p) => {
      if (p.id !== propertyId) return p;
      const units = [...(p.units || [])];
      if (data.id) {
        const i = units.findIndex((u) => u.id === data.id);
        units[i] = { ...units[i], ...data, rent: Number(data.rent) || 0, turnoverRate: Number(data.turnoverRate) || 0 };
      } else {
        units.push({ id: uid(), ...data, rent: Number(data.rent) || 0, turnoverRate: Number(data.turnoverRate) || 0 });
      }
      return { ...p, units };
    });
    persist(next, payments);
    setModal(null);
  }

  function saveBulk(propertyId, data) {
    const start = Math.min(Number(data.start) || 1, Number(data.end) || 1);
    const end = Math.max(Number(data.start) || 1, Number(data.end) || 1);
    const rent = Number(data.rent) || 0;
    const newUnits = [];
    for (let i = start; i <= end; i++) {
      newUnits.push({
        id: uid(),
        unitType: data.unitType,
        name: `${data.prefix.trim()} ${i}`,
        tenant: "",
        rent,
        leaseStart: "",
        leaseEnd: "",
      });
    }
    const next = properties.map((p) => p.id === propertyId ? { ...p, units: [...(p.units || []), ...newUnits] } : p);
    persist(next, payments);
    setModal(null);
  }

  function deleteUnit(propertyId, unitId) {
    const next = properties.map((p) => p.id === propertyId ? { ...p, units: p.units.filter((u) => u.id !== unitId) } : p);
    persist(next, payments);
  }

  function applyRentRevision(propertyId, unitId, newRent) {
    const today = new Date().toISOString().slice(0, 10);
    const next = properties.map((p) => {
      if (p.id !== propertyId) return p;
      return {
        ...p,
        units: p.units.map((u) => u.id === unitId ? { ...u, rent: Number(newRent) || u.rent, lastRevisionDate: today } : u),
      };
    });
    persist(next, payments);
    setModal(null);
  }

  function saveTurnover(propertyId, unitId, period, amount) {
    const next = properties.map((p) => {
      if (p.id !== propertyId) return p;
      return {
        ...p,
        units: p.units.map((u) => {
          if (u.id !== unitId) return u;
          const turnovers = { ...(u.turnovers || {}) };
          if (Number(amount) > 0) turnovers[period] = Number(amount);
          else delete turnovers[period];
          return { ...u, turnovers };
        }),
      };
    });
    persist(next, payments);
    setModal(null);
  }

  function togglePayment(unitId, period, amount) {
    const key = `${unitId}|${period}`;
    const cur = payments[key];
    const next = { ...payments };
    if (cur?.paid) {
      delete next[key];
    } else {
      next[key] = { paid: true, amount, datePaid: new Date().toISOString().slice(0, 10) };
    }
    persist(properties, next);
  }

  function addExpense(propertyId, data) {
    const entry = {
      id: uid(),
      propertyId,
      label: data.label.trim(),
      amount: Number(data.amount) || 0,
      date: data.date || new Date().toISOString().slice(0, 10),
    };
    persist(properties, payments, [...(expenses || []), entry]);
    setModal(null);
  }

  function deleteExpense(id) {
    persist(properties, payments, (expenses || []).filter((e) => e.id !== id));
  }

  function exportBackup() {
    try {
      const payload = JSON.stringify({ properties, payments, expenses, exportedAt: new Date().toISOString() }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `portefeuille-sauvegarde-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Échec de l'export. Réessaie.");
      setTimeout(() => setError(null), 3000);
    }
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.properties)) throw new Error("Fichier invalide");
        persist(data.properties, data.payments || {}, data.expenses || []);
      } catch {
        setError("Ce fichier ne semble pas être une sauvegarde valide.");
        setTimeout(() => setError(null), 4000);
      }
    };
    reader.readAsText(file);
  }

  if (!loaded) {
    return (
      <div style={styles.loadingScreen}>
        <style>{fontImport}</style>
        <div style={styles.loadingText}><span className="spinner" /> Chargement du portefeuille…</div>
      </div>
    );
  }

  return (
    <>
      <style>{fontImport}</style>
      <LoyersNav tab={tab} setTab={setTab} isAdmin={isAdmin} onExport={exportBackup} onImport={importBackup} />
      {error && <div role="alert" style={styles.errorBanner}><AlertTriangle size={16} strokeWidth={2} color="var(--bad)" style={{ flexShrink: 0 }} />{error}</div>}
      {tab === "dashboard" && isAdmin && <Dashboard stats={stats} properties={properties} allUnits={allUnits} expenses={expenses} setModal={setModal} />}
      {tab === "biens" && (
        <Biens
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          setSelectedPropertyId={setSelectedPropertyId}
          openAddProperty={openAddProperty}
          openEditProperty={openEditProperty}
          deleteProperty={deleteProperty}
          openAddUnit={openAddUnit}
          openAddBulk={openAddBulk}
          openEditUnit={openEditUnit}
          deleteUnit={deleteUnit}
          payments={payments}
          curPeriod={curPeriod}
          togglePayment={togglePayment}
          expenses={expenses}
          openAddExpense={openAddExpense}
          deleteExpense={deleteExpense}
          setModal={setModal}
          isAdmin={isAdmin}
        />
      )}
      {tab === "loyers" && (
        <Loyers
          allUnits={allUnits}
          payments={payments}
          ledgerYear={ledgerYear}
          setLedgerYear={setLedgerYear}
          togglePayment={togglePayment}
          isAdmin={isAdmin}
        />
      )}
      {tab === "fiscalite" && isAdmin && (
        <Fiscalite properties={properties} expenses={expenses} />
      )}
      {modal && modal.type === "receipt" && <ReceiptModal data={modal.data} onClose={() => setModal(null)} />}
      {modal && modal.type === "letter" && <LetterModal data={modal.data} onClose={() => setModal(null)} />}
      {modal && modal.type === "revision" && <RevisionModal data={modal.data} onClose={() => setModal(null)} onConfirm={applyRentRevision} />}
      {modal && modal.type === "turnover" && <TurnoverModal data={modal.data} onClose={() => setModal(null)} onSave={saveTurnover} />}
      {modal && !["receipt", "letter", "revision", "turnover"].includes(modal.type) && (
        <Modal
          modal={modal}
          onClose={() => setModal(null)}
          onSaveProperty={saveProperty}
          onSaveUnit={saveUnit}
          onSaveBulk={saveBulk}
          onSaveExpense={addExpense}
        />
      )}
    </>
  );
}

// Sous-navigation interne au module Loyers (remplace l'ancien Sidebar, qui est
// désormais unifié au niveau d'ExtranetShell). Les onglets et la logique
// d'export/import restent celles du module Loyers, inchangées.
function LoyersNav({ tab, setTab, isAdmin, onExport, onImport }) {
  const items = isAdmin
    ? [
        { id: "dashboard", label: "Tableau de bord", icon: TrendingUp },
        { id: "biens", label: "Mes biens", icon: Building2 },
        { id: "loyers", label: "Suivi des loyers", icon: Wallet },
        { id: "fiscalite", label: "Fiscalité", icon: Percent },
      ]
    : [
        { id: "biens", label: "Mes biens", icon: Building2 },
        { id: "loyers", label: "Suivi des loyers", icon: Wallet },
      ];
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = "";
  }
  return (
    <div className="subnav" style={styles.subnav}>
      <div role="tablist" style={styles.tabBar}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(it.id)}
              title={it.label}
              className={active ? "tab-btn is-active" : "tab-btn"}
              style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
            >
              <Icon size={15} strokeWidth={1.75} color={active ? "var(--accent)" : "currentColor"} />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
          <button style={styles.backupBtn} onClick={onExport} title="Télécharger une sauvegarde de toutes tes données">
            <Download size={15} strokeWidth={1.75} />
            <span>Exporter</span>
          </button>
          <label role="button" style={styles.backupBtn} title="Restaurer depuis un fichier de sauvegarde">
            <Upload size={15} strokeWidth={1.75} />
            <span>Importer</span>
            <input type="file" accept="application/json" onChange={handleFileChange} style={{ display: "none" }} />
          </label>
        </div>
      )}
    </div>
  );
}

function Dashboard({ stats, properties, allUnits, expenses, setModal }) {
  const byType = { magasin: 0, immeuble: 0, mall: 0 };
  (properties || []).forEach((p) => { byType[p.type] = (byType[p.type] || 0) + 1; });

  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 86400000);

  const revisableUnits = useMemo(() => {
    return allUnits
      .filter((u) => u.tenant && u.tenant.trim())
      .map((u) => ({ ...u, revision: rentRevisionInfo(u, today) }))
      .filter((u) => u.revision.eligible);
  }, [allUnits]);

  const upcomingLeaseEnds = useMemo(() => {
    return allUnits
      .filter((u) => u.tenant && u.tenant.trim() && u.leaseEnd)
      .map((u) => ({ ...u, endDate: new Date(u.leaseEnd) }))
      .filter((u) => !isNaN(u.endDate) && u.endDate <= in90)
      .sort((a, b) => a.endDate - b.endDate);
  }, [allUnits]);

  const prolongedVacancies = useMemo(() => {
    return allUnits
      .filter((u) => !u.tenant || !u.tenant.trim())
      .map((u) => {
        let days = null;
        if (u.leaseEnd) {
          const d = new Date(u.leaseEnd);
          if (!isNaN(d) && d < today) days = Math.floor((today - d) / 86400000);
        }
        return { ...u, vacantDays: days };
      })
      .filter((u) => u.vacantDays === null || u.vacantDays >= 60)
      .sort((a, b) => (b.vacantDays || 0) - (a.vacantDays || 0));
  }, [allUnits]);

  const yieldRanking = useMemo(() => {
    return (properties || [])
      .map((p) => ({ property: p, yield: calcYield(p) }))
      .filter((r) => r.yield !== null)
      .sort((a, b) => b.yield - a.yield);
  }, [properties]);

  const globalYield = useMemo(() => {
    const withValue = (properties || []).filter((p) => Number(p.estimatedValue) > 0);
    const totalValeur = withValue.reduce((s, p) => s + Number(p.estimatedValue), 0);
    const totalRevenu = withValue.reduce((s, p) => s + annualRent(p), 0);
    if (!totalValeur) return null;
    return { totalValeur, totalRevenu, pct: (totalRevenu / totalValeur) * 100, count: withValue.length };
  }, [properties]);

  const totalExpensesThisYear = useMemo(() => {
    const y = today.getFullYear();
    return (expenses || []).filter((e) => (e.date || "").slice(0, 4) === String(y)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }, [expenses]);

  return (
    <div className="page" style={styles.page}>
      <header style={styles.pageHeader}>
        <div style={styles.eyebrow}>Vue d'ensemble</div>
        <h1 style={styles.h1}>Tableau de bord</h1>
      </header>

      <div className="kpi-grid" style={styles.kpiGrid}>
        <KpiCard icon={CheckCircle2} label="Loyers encaissés — ce mois" value={fmt(stats.collected)} accent="good" />
        <KpiCard icon={Wallet} label="Loyers attendus — ce mois" value={fmt(stats.expected)} accent="neutral" />
        <KpiCard icon={AlertTriangle} label="Impayés en cours" value={String(stats.unpaid.length)} accent={stats.unpaid.length ? "bad" : "good"} suffix="local(aux)" />
        <KpiCard icon={Building2} label="Taux d'occupation" value={`${stats.occupancyRate}%`} accent="neutral" progress={stats.occupancyRate} />
      </div>

      <div className="two-col" style={styles.twoCol}>
        <section style={styles.card}>
          <div style={styles.cardTitle}>Composition du portefeuille</div>
          <div style={styles.typeRows}>
            {Object.entries(TYPES).map(([key, t]) => {
              const Icon = t.icon;
              return (
                <div key={key} style={styles.typeRow}>
                  <Icon size={16} strokeWidth={1.75} color="var(--accent)" />
                  <span style={styles.typeRowLabel}>{t.label}s</span>
                  <span style={styles.typeRowValue}>{byType[key] || 0}</span>
                </div>
              );
            })}
          </div>
          <div style={styles.divider} />
          <div style={styles.typeRow}>
            <Circle size={16} strokeWidth={1.75} color="var(--text-dim)" />
            <span style={styles.typeRowLabel}>Locaux au total</span>
            <span style={styles.typeRowValue}>{stats.totalUnits}</span>
          </div>
          <div style={styles.typeRow}>
            <Circle size={16} strokeWidth={1.75} color="var(--text-dim)" />
            <span style={styles.typeRowLabel}>Occupés / vacants</span>
            <span style={styles.typeRowValue}>{stats.occupiedCount} / {stats.vacantCount}</span>
          </div>
          <div style={styles.typeRow}>
            <Circle size={16} strokeWidth={1.75} color="var(--text-dim)" />
            <span style={styles.typeRowLabel}>Charges enregistrées ({today.getFullYear()})</span>
            <span style={styles.typeRowValue}>{fmt(totalExpensesThisYear)}</span>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Locaux en impayé — ce mois</div>
          {stats.unpaid.length === 0 ? (
            <div style={styles.emptyNote}>Aucun impayé ce mois. Tous les loyers dus sont encaissés.</div>
          ) : (
            <ul style={styles.unpaidList}>
              {stats.unpaid.map((u) => (
                <li key={u.id} style={styles.unpaidItem}>
                  <ListIcon icon={AlertTriangle} tone="bad" />
                  <div>
                    <div style={styles.unpaidName}>{u.tenant} — {u.name}</div>
                    <div style={styles.unpaidMeta}>{u.propertyName} · {fmt(u.due)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="two-col" style={{ ...styles.twoCol, marginTop: 16 }}>
        <section style={styles.card}>
          <div style={styles.cardTitle}>Fins de bail à venir (90 jours)</div>
          {upcomingLeaseEnds.length === 0 ? (
            <div style={styles.emptyNote}>Aucune échéance de bail dans les 90 prochains jours.</div>
          ) : (
            <ul style={styles.unpaidList}>
              {upcomingLeaseEnds.map((u) => {
                const daysLeft = Math.ceil((u.endDate - today) / 86400000);
                return (
                  <li key={u.id} style={styles.unpaidItem}>
                    <ListIcon icon={CalendarClock} tone={daysLeft < 0 ? "bad" : "warn"} />
                    <div>
                      <div style={styles.unpaidName}>{u.tenant} — {u.name}</div>
                      <div style={styles.unpaidMeta}>
                        {u.propertyName} · échéance {u.leaseEnd} · {daysLeft < 0 ? `dépassée de ${-daysLeft} j` : `dans ${daysLeft} j`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Vacances prolongées</div>
          {prolongedVacancies.length === 0 ? (
            <div style={styles.emptyNote}>Aucun local vacant depuis plus de 60 jours.</div>
          ) : (
            <ul style={styles.unpaidList}>
              {prolongedVacancies.map((u) => (
                <li key={u.id} style={styles.unpaidItem}>
                  <ListIcon icon={DoorOpen} tone="bad" />
                  <div>
                    <div style={styles.unpaidName}>{u.name}</div>
                    <div style={styles.unpaidMeta}>{u.propertyName} · {u.vacantDays !== null ? `vacant depuis ${u.vacantDays} j` : "vacant, date inconnue"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitle}>Révisions de loyer possibles (loi marocaine)</div>
        {revisableUnits.length === 0 ? (
          <div style={styles.emptyNote}>Aucun local éligible à une révision pour l'instant (il faut 3 ans depuis le début du bail ou la dernière révision).</div>
        ) : (
          <ul style={styles.unpaidList}>
            {revisableUnits.map((u) => {
              const property = (properties || []).find((p) => p.id === u.propertyId);
              return (
                <li key={u.id} style={styles.unpaidItem}>
                  <ListIcon icon={Percent} tone="warn" />
                  <div style={{ flex: 1 }}>
                    <div style={styles.unpaidName}>{u.tenant} — {u.name}</div>
                    <div style={styles.unpaidMeta}>
                      {u.propertyName} · loyer actuel {fmt(u.rent)} · plafond légal {fmt(u.revision.newRentMax)} (+{(u.revision.capRate * 100).toFixed(0)}%)
                    </div>
                  </div>
                  {property && (
                    <button style={styles.ghostBtn} onClick={() => setModal({ type: "revision", data: { unit: u, property } })}>
                      Préparer
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitle}>Rendement locatif — portefeuille</div>
        {yieldRanking.length === 0 ? (
          <div style={styles.emptyNote}>
            Renseigne une "Valeur estimée" pour au moins un bien (bouton "Modifier" dans sa fiche, dans "Mes biens") pour voir son rendement ici — loyer annuel occupé ÷ valeur estimée.
          </div>
        ) : (
          <>
            {globalYield && (
              <div style={styles.globalYieldBlock}>
                <div>
                  <div style={styles.kpiLabel}>Rendement global du portefeuille</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{globalYield.pct.toFixed(1)}%</div>
                  <div style={styles.emptyNote}>{fmt(globalYield.totalRevenu)} de loyers annuels ÷ {fmt(globalYield.totalValeur)} de valeur estimée, sur {globalYield.count} bien(s) renseigné(s) sur {properties.length}.</div>
                </div>
              </div>
            )}
            <div style={styles.emptyNote}>Détail par bien — basé sur la valeur estimée renseignée dans la fiche de chacun (loyer annuel occupé ÷ valeur).</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Bien</th>
                  <th style={styles.th}>Loyer annuel</th>
                  <th style={styles.th}>Valeur estimée</th>
                  <th style={styles.th}>Rendement</th>
                </tr>
              </thead>
              <tbody>
                {yieldRanking.map((r) => (
                  <tr key={r.property.id}>
                    <td style={styles.td}>{r.property.name}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(annualRent(r.property))}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.property.estimatedValue)}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{r.yield.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

function ListIcon({ icon: Icon, tone }) {
  const t = styles.badge(tone);
  return (
    <div style={{ width: 30, height: 30, borderRadius: 8, background: t.background, color: t.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={15} strokeWidth={1.9} />
    </div>
  );
}

function annualRent(property) {
  const year = new Date().getFullYear();
  return (property.units || []).filter((u) => u.tenant && u.tenant.trim()).reduce((s, u) => s + unitAnnualRent(u, year), 0);
}
function calcYield(property) {
  const val = Number(property.estimatedValue) || 0;
  if (!val) return null;
  return (annualRent(property) / val) * 100;
}

function KpiCard({ icon: Icon, label, value, accent, suffix, progress }) {
  const colorVar = accent === "good" ? "var(--good)" : accent === "bad" ? "var(--bad)" : "var(--accent)";
  const softVar = accent === "good" ? "var(--good-soft)" : accent === "bad" ? "var(--bad-dim)" : "var(--accent-soft)";
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiHead}>
        <div style={{ ...styles.kpiLabel, marginBottom: 0 }}>{label}</div>
        {Icon && <div style={{ ...styles.kpiIcon, background: softVar, color: colorVar }}><Icon size={15} strokeWidth={2} /></div>}
      </div>
      <div className="kpi-value" style={styles.kpiValue}>{value}</div>
      {suffix && <div style={styles.kpiSuffix}>{suffix}</div>}
      {progress !== undefined && (
        <div style={{ ...styles.progressTrack, flex: "none", marginTop: 12 }}>
          <div style={styles.progressFill(progress, colorVar)} />
        </div>
      )}
    </div>
  );
}

function Biens({ properties, selectedPropertyId, setSelectedPropertyId, openAddProperty, openEditProperty, deleteProperty, openAddUnit, openAddBulk, openEditUnit, deleteUnit, payments, curPeriod, togglePayment, expenses, openAddExpense, deleteExpense, setModal, isAdmin }) {
  const selected = properties.find((p) => p.id === selectedPropertyId);

  if (selected) {
    return (
      <BuildingDetail
        property={selected}
        onBack={() => setSelectedPropertyId(null)}
        openEditProperty={openEditProperty}
        deleteProperty={(id) => { deleteProperty(id); }}
        openAddUnit={openAddUnit}
        openAddBulk={openAddBulk}
        openEditUnit={openEditUnit}
        deleteUnit={deleteUnit}
        payments={payments}
        curPeriod={curPeriod}
        togglePayment={togglePayment}
        expenses={(expenses || []).filter((e) => e.propertyId === selected.id)}
        openAddExpense={openAddExpense}
        deleteExpense={deleteExpense}
        setModal={setModal}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <div className="page" style={styles.page}>
      <header className="page-header-row" style={styles.pageHeaderRow}>
        <div>
          <div style={styles.eyebrow}>Portefeuille</div>
          <h1 style={styles.h1}>Mes biens</h1>
        </div>
        {isAdmin && (
          <button style={styles.primaryBtn} onClick={() => openAddProperty()}>
            <Plus size={16} strokeWidth={2} /> Ajouter un immeuble / bien
          </button>
        )}
      </header>

      {properties.length === 0 ? (
        <div style={styles.emptyState}>
          <Building2 size={28} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucun bien enregistré</div>
          <div style={styles.emptyStateSub}>Créez un immeuble, un magasin ou un mall. Vous ajouterez ensuite ses locaux un par un, à l'intérieur.</div>
        </div>
      ) : (
        <>
        <PortfolioSummary properties={properties} payments={payments} curPeriod={curPeriod} />
        <div className="building-grid" style={styles.buildingGrid}>
          {properties.map((p) => {
            const Icon = TYPES[p.type]?.icon || Store;
            const units = p.units || [];
            const st = buildingStats(p, payments, curPeriod);
            return (
              <div key={p.id} className="card-interactive" style={styles.buildingCard} onClick={() => setSelectedPropertyId(p.id)}>
                <div style={styles.buildingCardTop}>
                  <div style={styles.buildingIconWrap}><Icon size={20} strokeWidth={1.75} color="var(--accent)" /></div>
                  {isAdmin && (
                    <div style={styles.buildingCardActions} onClick={(e) => e.stopPropagation()}>
                      <IconBtn onClick={() => openEditProperty(p)}><Pencil size={13} /></IconBtn>
                      <IconBtn onClick={() => deleteProperty(p.id)} danger><Trash2 size={13} /></IconBtn>
                    </div>
                  )}
                </div>
                <div style={styles.buildingName}>{p.name}</div>
                <div style={styles.buildingMeta}>
                  {TYPES[p.type]?.label}{p.city ? ` · ${p.city}` : ""}
                </div>
                {units.length === 0 ? (
                  <div style={styles.buildingStock}><span>Aucun local enregistré</span></div>
                ) : (
                  <>
                    <div style={styles.buildingMoney}>
                      <div>
                        <div style={styles.buildingMoneyLabel}>Encaissé · {MOIS[Number(curPeriod.slice(5)) - 1]}</div>
                        <div style={{ ...styles.buildingMoneyValue, color: "var(--good)" }}>{fmt(st.collected)}</div>
                      </div>
                      <div>
                        <div style={styles.buildingMoneyLabel}>Impayé</div>
                        <div style={{ ...styles.buildingMoneyValue, color: st.unpaid > 0 ? "var(--bad)" : "var(--text-dim)" }}>{fmt(st.unpaid)}</div>
                      </div>
                    </div>
                    <div>
                      <div style={styles.buildingOccRow}>
                        <span><strong style={{ color: "var(--text)" }}>{st.occupied}</strong> loué{st.occupied > 1 ? "s" : ""} · <strong style={{ color: st.vacant ? "var(--bad)" : "var(--text)" }}>{st.vacant}</strong> vacant{st.vacant > 1 ? "s" : ""}</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{st.rate}%</span>
                      </div>
                      <div style={{ display: "flex" }}>
                        <div style={styles.progressTrack}><div style={styles.progressFill(st.rate, "var(--good)")} /></div>
                      </div>
                    </div>
                    <div style={styles.buildingStock}>
                      <span>Encaissé depuis janvier</span>
                      <span style={{ marginLeft: "auto", fontWeight: 600, color: "var(--text)" }}>{fmt(st.collectedYtd)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

// Chiffres d'un immeuble pour le mois en cours : loyers encaissés / impayés
// (loyer dû du mois, donc % du CA inclus pour les loyers variables), locaux
// loués / vacants, taux de remplissage, et encaissé cumulé depuis janvier.
function buildingStats(property, payments, curPeriod) {
  const units = property.units || [];
  const occupiedUnits = units.filter((u) => u.tenant && u.tenant.trim());
  let collected = 0, unpaid = 0, collectedYtd = 0;
  const [year, month] = curPeriod.split("-").map(Number);
  occupiedUnits.forEach((u) => {
    const due = rentDue(u, curPeriod);
    if (payments?.[`${u.id}|${curPeriod}`]?.paid) collected += due; else unpaid += due;
    for (let m = 0; m < month; m++) {
      const period = periodKey(year, m);
      if (payments?.[`${u.id}|${period}`]?.paid) collectedYtd += rentDue(u, period);
    }
  });
  const occupied = occupiedUnits.length;
  return {
    collected,
    unpaid,
    collectedYtd,
    occupied,
    vacant: units.length - occupied,
    rate: units.length ? Math.round((occupied / units.length) * 100) : 0,
  };
}

function PortfolioSummary({ properties, payments, curPeriod }) {
  const t = properties.reduce((acc, p) => {
    const st = buildingStats(p, payments, curPeriod);
    acc.collected += st.collected; acc.unpaid += st.unpaid; acc.occupied += st.occupied; acc.vacant += st.vacant;
    return acc;
  }, { collected: 0, unpaid: 0, occupied: 0, vacant: 0 });
  const total = t.occupied + t.vacant;
  const items = [
    { label: `Encaissé · ${MOIS[Number(curPeriod.slice(5)) - 1]}`, value: fmt(t.collected), color: "var(--good)" },
    { label: "Impayé", value: fmt(t.unpaid), color: t.unpaid > 0 ? "var(--bad)" : "var(--text)" },
    { label: "Loués / vacants", value: `${t.occupied} / ${t.vacant}` },
    { label: "Remplissage", value: `${total ? Math.round((t.occupied / total) * 100) : 0}%` },
  ];
  return (
    <div className="kpi-grid" style={{ ...styles.kpiGrid, marginBottom: 18 }}>
      {items.map((it) => (
        <div key={it.label} style={{ ...styles.kpiCard, padding: "14px 16px" }}>
          <div style={styles.kpiLabel}>{it.label}</div>
          <div className="kpi-value" style={{ ...styles.kpiValue, fontSize: 21, color: it.color || "var(--text)" }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function BuildingDetail({ property, onBack, openEditProperty, deleteProperty, openAddUnit, openAddBulk, openEditUnit, deleteUnit, payments, curPeriod, togglePayment, expenses, openAddExpense, deleteExpense, setModal, isAdmin }) {
  const Icon = TYPES[property.type]?.icon || Store;
  const units = property.units || [];
  const yieldPct = calcYield(property);
  const totalCharges = (expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const groups = useMemo(() => {
    const map = {};
    units.forEach((u) => {
      const t = guessUnitType(u);
      if (!map[t]) map[t] = [];
      map[t].push(u);
    });
    return Object.keys(UNIT_TYPES)
      .filter((t) => map[t]?.length)
      .map((t) => ({ type: t, label: UNIT_TYPES[t], items: map[t] }));
  }, [units]);

  const duplicateNames = useMemo(() => {
    const counts = {};
    units.forEach((u) => {
      const key = (u.name || "").trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [units]);
  const duplicateCount = units.filter((u) => duplicateNames.has((u.name || "").trim().toLowerCase())).length;

  return (
    <div className="page" style={styles.page}>
      <button style={styles.backLink} onClick={onBack}>
        <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Tous les biens
      </button>

      <header className="page-header-row" style={styles.pageHeaderRow}>
        <div style={styles.buildingDetailHead}>
          <div style={styles.buildingIconWrap}><Icon size={22} strokeWidth={1.75} color="var(--accent)" /></div>
          <div>
            <div style={styles.eyebrow}>{TYPES[property.type]?.label}{property.city ? ` · ${property.city}` : ""}</div>
            <h1 style={styles.h1}>{property.name}</h1>
            {property.address && <div style={styles.buildingAddress}>{property.address}</div>}
            {property.titleDeed && <div style={styles.buildingAddress}>Titre foncier : {property.titleDeed}</div>}
            {yieldPct !== null && <div style={styles.yieldBadge}>Rendement estimé : {yieldPct.toFixed(1)}%</div>}
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => openEditProperty(property)}>
              <Pencil size={14} /> Modifier
            </button>
            <button style={styles.secondaryBtn} onClick={() => openAddExpense(property.id)}>
              <Receipt size={14} /> Ajouter une charge
            </button>
            <button style={styles.secondaryBtn} onClick={() => openAddBulk(property.id)}>
              <Plus size={14} /> Ajouter en série
            </button>
            <button style={styles.primaryBtn} onClick={() => openAddUnit(property.id)}>
              <Plus size={16} strokeWidth={2} /> Ajouter un local
            </button>
          </div>
        )}
      </header>

      {duplicateCount > 0 && (
        <div style={styles.dupBanner}>
          <AlertTriangle size={15} strokeWidth={1.75} />
          <span>{duplicateCount} local(aux) portent un nom en double dans cet immeuble — probablement des doublons créés par "Ajouter en série". Vérifie chaque paire (surlignée ci-dessous) et supprime l'entrée vide avec l'icône corbeille, en gardant celle qui a le loyer/locataire renseigné.</span>
        </div>
      )}

      {units.length === 0 ? (
        <div style={styles.emptyState}>
          <Store size={28} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucun local dans {property.name}</div>
          <div style={styles.emptyStateSub}>Ajoutez ici chaque magasin, appartement ou lot de cet immeuble, un par un — précisez le type à chaque ajout.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {groups.map((g) => (
            <div key={g.type}>
              <div style={styles.groupHeading}>{g.label}s <span style={styles.groupCount}>({g.items.length})</span></div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Local</th>
                    <th style={styles.th}>Locataire</th>
                    <th style={styles.th}>Loyer</th>
                    <th style={styles.th}>Bail</th>
                    <th style={styles.th}>Ce mois</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((u) => {
                    const paid = payments?.[`${u.id}|${curPeriod}`]?.paid;
                    const vacant = !u.tenant || !u.tenant.trim();
                    const isDup = duplicateNames.has((u.name || "").trim().toLowerCase());
                    return (
                      <tr key={u.id} style={isDup ? styles.dupRow : undefined}>
                        <td style={styles.td}>{u.name}{isDup && <span title="Nom en double" style={styles.dupMarker}> ⚠</span>}</td>
                        <td style={styles.td}>{vacant ? <span style={{ color: "var(--text-dim)" }}>Vacant</span> : u.tenant}</td>
                        <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>
                          {isVariableRent(u) ? (
                            <>
                              <div>{fmt(rentDue(u, curPeriod))}</div>
                              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                                {fmtRate(u.turnoverRate)} du CA · min. {fmt(u.rent)}
                              </div>
                            </>
                          ) : fmt(u.rent)}
                        </td>
                        <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {u.leaseStart || "—"} → {u.leaseEnd || "—"}
                        </td>
                        <td style={styles.td}>
                          {vacant ? "—" : isAdmin ? (
                            <button
                              type="button"
                              onClick={() => togglePayment(u.id, curPeriod, rentDue(u, curPeriod))}
                              style={{ ...styles.statusBtn, ...(paid ? styles.statusBtnGood : styles.statusBtnBad) }}
                              title="Cliquer pour changer le statut de ce mois"
                            >
                              {paid ? (
                                <span style={styles.tagGood}><CheckCircle2 size={13} /> Payé</span>
                              ) : (
                                <span style={styles.tagBad}><AlertTriangle size={13} /> Impayé</span>
                              )}
                            </button>
                          ) : (
                            paid ? (
                              <span style={styles.tagGood}><CheckCircle2 size={13} /> Payé</span>
                            ) : (
                              <span style={styles.tagBad}><AlertTriangle size={13} /> Impayé</span>
                            )
                          )}
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {!vacant && paid && (
                              <IconBtn onClick={() => setModal({ type: "receipt", data: { unit: u, property, period: curPeriod, datePaid: payments?.[`${u.id}|${curPeriod}`]?.datePaid } })} title="Voir la quittance">
                                <Receipt size={13} />
                              </IconBtn>
                            )}
                            {!vacant && !paid && (
                              <IconBtn onClick={() => setModal({ type: "letter", data: { unit: u, property, period: curPeriod, payments } })} title="Générer une lettre de relance ou de mise en demeure">
                                <FileText size={13} />
                              </IconBtn>
                            )}
                            {isAdmin && !vacant && isVariableRent(u) && (
                              <IconBtn onClick={() => setModal({ type: "turnover", data: { unit: u, propertyId: property.id, period: curPeriod } })} title="Saisir le chiffre d'affaires du mois">
                                <TrendingUp size={13} />
                              </IconBtn>
                            )}
                            {isAdmin && <IconBtn onClick={() => openEditUnit(property.id, u)} title="Modifier"><Pencil size={13} /></IconBtn>}
                            {isAdmin && <IconBtn onClick={() => deleteUnit(property.id, u.id)} danger title="Supprimer"><Trash2 size={13} /></IconBtn>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div style={styles.expensesSection}>
        <div className="page-header-row" style={{ ...styles.pageHeaderRow, marginBottom: 12 }}>
          <div style={styles.groupHeading}>Charges de cet immeuble</div>
          {isAdmin && (
            <button style={styles.secondaryBtn} onClick={() => openAddExpense(property.id)}>
              <Plus size={14} /> Ajouter une charge
            </button>
          )}
        </div>
        {(!expenses || expenses.length === 0) ? (
          <div style={styles.emptyNote}>Aucune charge enregistrée pour cet immeuble (travaux, syndic, taxes...).</div>
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Charge</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Montant</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((e) => (
                  <tr key={e.id}>
                    <td style={styles.td}>{e.label}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.date}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(e.amount)}</td>
                    <td style={styles.td}>{isAdmin && <IconBtn onClick={() => deleteExpense(e.id)} danger><Trash2 size={13} /></IconBtn>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.expensesTotal}>Total des charges enregistrées : {fmt(totalCharges)}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Loyers({ allUnits, payments, ledgerYear, setLedgerYear, togglePayment, isAdmin }) {
  const occupied = allUnits.filter((u) => u.tenant && u.tenant.trim());
  return (
    <div className="page" style={styles.page}>
      <header className="page-header-row" style={styles.pageHeaderRow}>
        <div>
          <div style={styles.eyebrow}>Carnet de loyers</div>
          <h1 style={styles.h1}>Suivi des loyers {ledgerYear}</h1>
        </div>
        <div style={styles.yearSwitcher}>
          <button style={styles.yearBtn} onClick={() => setLedgerYear(ledgerYear - 1)}>←</button>
          <span style={styles.yearLabel}>{ledgerYear}</span>
          <button style={styles.yearBtn} onClick={() => setLedgerYear(ledgerYear + 1)}>→</button>
        </div>
      </header>

      {occupied.length === 0 ? (
        <div style={styles.emptyState}>
          <Wallet size={28} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucun local occupé</div>
          <div style={styles.emptyStateSub}>Ajoutez un locataire à un local dans "Mes biens" pour suivre ses loyers ici.</div>
        </div>
      ) : (
        <div style={styles.ledgerScroll}>
          <table style={styles.ledgerTable}>
            <thead>
              <tr>
                <th style={styles.ledgerHeadCell}>Local</th>
                {MOIS.map((m) => <th key={m} style={styles.ledgerMonthHead}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {occupied.map((u) => (
                <tr key={u.id}>
                  <td style={styles.ledgerRowLabel}>
                    <div style={styles.ledgerTenant}>{u.tenant}</div>
                    <div style={styles.ledgerUnit}>{u.propertyName} · {u.name}</div>
                  </td>
                  {MOIS.map((_, mi) => {
                    const period = periodKey(ledgerYear, mi);
                    const paid = payments?.[`${u.id}|${period}`]?.paid;
                    const isFuture = new Date(ledgerYear, mi, 1) > new Date();
                    return (
                      <td key={mi} style={styles.ledgerCell}>
                        <button
                          onClick={() => isAdmin && !isFuture && togglePayment(u.id, period, rentDue(u, period))}
                          disabled={isFuture || !isAdmin}
                          title={`${isFuture ? "Mois à venir" : !isAdmin ? (paid ? "Payé" : "Impayé") : paid ? "Marquer impayé" : "Marquer payé"} · ${fmt(rentDue(u, period))}`}
                          style={{
                            ...styles.ledgerDot,
                            background: isFuture ? "transparent" : paid ? "var(--good)" : "var(--bad-dim)",
                            border: isFuture ? "1px dashed var(--border-strong)" : paid ? "1px solid var(--good)" : "1px solid color-mix(in srgb, var(--bad) 45%, transparent)",
                            cursor: isFuture || !isAdmin ? "default" : "pointer",
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={styles.legend}>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: "var(--good)" }} /> Payé</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: "var(--bad-dim)", border: "1px solid color-mix(in srgb, var(--bad) 45%, transparent)" }} /> Impayé</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, border: "1px dashed var(--border-strong)", background: "transparent" }} /> À venir</span>
      </div>
    </div>
  );
}

function cssRate(benefice) {
  if (benefice < 1000000) return 0;
  if (benefice <= 5000000) return 0.015;
  if (benefice <= 10000000) return 0.025;
  if (benefice <= 40000000) return 0.035;
  return 0.05;
}

const CCA_TAUX_PLAFOND_2026 = 2.15; // taux maximum des intérêts déductibles sur comptes courants d'associés, arrêté 2026

function loanYearBreakdown(loanAmount, ratePct, durationYears, startDateStr, targetYear) {
  const amount = Number(loanAmount) || 0;
  const rate = Number(ratePct) || 0;
  const years = Number(durationYears) || 0;
  const start = startDateStr ? new Date(startDateStr) : null;
  if (!amount || !years || !start || isNaN(start)) {
    return { interest: 0, principal: 0, remaining: amount, monthlyPayment: 0 };
  }
  const monthlyRate = rate / 100 / 12;
  const totalMonths = Math.round(years * 12);
  const monthlyPayment = monthlyRate > 0
    ? (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths))
    : amount / totalMonths;

  let balance = amount;
  let interestYear = 0;
  let principalYear = 0;
  let remainingAtYearEnd = null;
  let y = start.getFullYear();
  let m = start.getMonth();

  for (let i = 0; i < totalMonths && balance > 0.5; i++) {
    const interest = balance * monthlyRate;
    let principal = monthlyPayment - interest;
    if (principal > balance) principal = balance;
    balance -= principal;
    if (y === targetYear) {
      interestYear += interest;
      principalYear += principal;
      if (m === 11) remainingAtYearEnd = balance;
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    if (y > targetYear) { if (remainingAtYearEnd === null) remainingAtYearEnd = balance; break; }
  }
  if (remainingAtYearEnd === null) remainingAtYearEnd = y <= targetYear ? balance : amount;

  return { interest: interestYear, principal: principalYear, remaining: Math.max(remainingAtYearEnd, 0), monthlyPayment };
}

function amortissementAnnuel(property) {
  const val = Number(property.estimatedValue) || 0;
  const duration = Number(property.amortissementDuration) || 25;
  const batiment = duration > 0 ? val / duration : 0;
  const furnitureVal = property.meuble ? (Number(property.furnitureValue) || 0) : 0;
  const mobilier = furnitureVal > 0 ? furnitureVal / 10 : 0;
  return { batiment, mobilier, total: batiment + mobilier };
}

function tvaApplicable(property) {
  const units = property.units || [];
  const hasProUnit = units.some((u) => { const t = guessUnitType(u); return t === "magasin" || t === "bureau"; });
  if (!hasProUnit) return false; // que de l'habitation -> hors champ TVA
  if (property.type === "mall") return true; // locaux nus en mall = soumis TVA
  if (property.meuble) return true; // meublé/équipé = soumis TVA
  return false; // nu, hors mall = hors champ par défaut
}

function tvaBreakdown(property, expensesForProperty) {
  const assujetti = tvaApplicable(property);
  const units = property.units || [];
  const baseLoyers = units
    .filter((u) => { const t = guessUnitType(u); return (t === "magasin" || t === "bureau") && u.tenant && u.tenant.trim(); })
    .reduce((s, u) => s + unitAnnualRent(u, new Date().getFullYear()), 0);
  const tvaCollectee = assujetti ? baseLoyers * 0.20 : 0;
  const totalCharges = (expensesForProperty || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tvaRecuperable = assujetti ? totalCharges * (0.20 / 1.20) : 0;
  const tvaNette = tvaCollectee - tvaRecuperable;
  return { assujetti, baseLoyers, tvaCollectee, tvaRecuperable, tvaNette };
}

function financingBreakdown(property, year) {
  const mode = property.financingMode || "cash";
  if (mode === "credit") {
    const r = loanYearBreakdown(property.loanAmount, property.loanRate, property.loanDuration, property.loanStartDate, year);
    return { mode, interetDeductible: r.interest, principalNonDeductible: r.principal, soldeRestant: r.remaining, label: "Capital restant dû" };
  }
  if (mode === "cca") {
    const balance = Number(property.ccaBalance) || 0;
    const rateAsked = Number(property.ccaRate) || 0;
    const rateApplied = Math.min(rateAsked, CCA_TAUX_PLAFOND_2026);
    const interet = balance * (rateApplied / 100);
    const interetNonDeductible = balance * (Math.max(rateAsked - CCA_TAUX_PLAFOND_2026, 0) / 100);
    return { mode, interetDeductible: interet, principalNonDeductible: 0, soldeRestant: balance, label: "Solde compte courant", interetNonDeductible, rateApplied };
  }
  return { mode, interetDeductible: 0, principalNonDeductible: 0, soldeRestant: 0, label: null };
}

function Fiscalite({ properties, expenses }) {
  const year = new Date().getFullYear();
  const [onlyRealEstate, setOnlyRealEstate] = useState(null);

  const perProperty = useMemo(() => {
    return (properties || []).map((p) => {
      const revenu = annualRent(p);
      const expensesForProperty = (expenses || []).filter((e) => e.propertyId === p.id && (e.date || "").slice(0, 4) === String(year));
      const charges = expensesForProperty.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const resultatComptable = revenu - charges;
      const valeurLocative = Number(p.valeurLocative) || revenu;
      const taxeCommunale = valeurLocative * 0.105;
      const amort = amortissementAnnuel(p);
      const fin = financingBreakdown(p, year);
      const resultatFiscal = resultatComptable - amort.total - fin.interetDeductible;
      const tva = tvaBreakdown(p, expensesForProperty);
      return { property: p, revenu, charges, resultatComptable, resultatFiscal, valeurLocative, taxeCommunale, amort, fin, tva };
    });
  }, [properties, expenses, year]);

  const totals = perProperty.reduce(
    (acc, r) => ({
      revenu: acc.revenu + r.revenu,
      charges: acc.charges + r.charges,
      resultatComptable: acc.resultatComptable + r.resultatComptable,
      resultatFiscal: acc.resultatFiscal + r.resultatFiscal,
      taxeCommunale: acc.taxeCommunale + r.taxeCommunale,
      amort: acc.amort + r.amort.total,
      interets: acc.interets + r.fin.interetDeductible,
      principal: acc.principal + (r.fin.principalNonDeductible || 0),
      tvaCollectee: acc.tvaCollectee + r.tva.tvaCollectee,
      tvaRecuperable: acc.tvaRecuperable + r.tva.tvaRecuperable,
      tvaNette: acc.tvaNette + r.tva.tvaNette,
    }),
    { revenu: 0, charges: 0, resultatComptable: 0, resultatFiscal: 0, taxeCommunale: 0, amort: 0, interets: 0, principal: 0, tvaCollectee: 0, tvaRecuperable: 0, tvaNette: 0 }
  );

  const beneficeImposable = Math.max(totals.resultatFiscal, 0);
  const isDuGlobal = beneficeImposable * 0.20;
  const cssRatePct = cssRate(beneficeImposable);
  const cssDuGlobal = beneficeImposable * cssRatePct;
  const cotisationMinimaleGlobale = totals.revenu * 0.0025;
  const isRetenuGlobal = Math.max(isDuGlobal, cotisationMinimaleGlobale);
  const totalEstime = isRetenuGlobal + cssDuGlobal + totals.taxeCommunale;

  // Allocation par bien, à titre indicatif : au prorata du résultat fiscal positif de chaque bien
  // (l'IS/CSS réels se calculent sur le bénéfice GLOBAL de la société, pas bien par bien)
  const totalResultatPositif = perProperty.reduce((s, r) => s + Math.max(r.resultatFiscal, 0), 0);
  const perPropertyWithTax = perProperty.map((r) => {
    const part = totalResultatPositif > 0 ? Math.max(r.resultatFiscal, 0) / totalResultatPositif : 0;
    return {
      ...r,
      isAlloue: isRetenuGlobal * part,
      cssAlloue: cssDuGlobal * part,
      totalAlloue: isRetenuGlobal * part + cssDuGlobal * part + r.taxeCommunale,
    };
  });

  if (onlyRealEstate === null) {
    return (
      <div className="page" style={styles.page}>
        <header style={styles.pageHeader}>
          <div style={styles.eyebrow}>Fiscalité</div>
          <h1 style={styles.h1}>Estimation fiscale (société, régime IS)</h1>
        </header>
        <section style={styles.card}>
          <div style={styles.cardTitle}>Une question avant de calculer</div>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            L'IS, la CSS et la cotisation minimale se calculent sur le <strong>bénéfice global de la société</strong>, pas seulement sur l'immobilier locatif. Pour que l'estimation ait un sens :
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={styles.primaryBtn} onClick={() => setOnlyRealEstate(true)}>La société ne fait que de la location immobilière</button>
            <button style={styles.secondaryBtn} onClick={() => setOnlyRealEstate(false)}>Elle a d'autres activités aussi</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page" style={styles.page}>
      <header style={styles.pageHeader}>
        <div style={styles.eyebrow}>Fiscalité — {year}</div>
        <h1 style={styles.h1}>Estimation fiscale (société, régime IS)</h1>
      </header>

      <div style={styles.dupBanner}>
        <AlertTriangle size={15} strokeWidth={1.75} />
        <span>
          Ceci est une <strong>estimation</strong>, pas une déclaration fiscale — elle ne remplace pas ton expert-comptable et ignore amortissements, provisions, déficits reportés et TVA. La colonne "par bien" ci-dessous est une <strong>répartition indicative</strong> : l'IS et la CSS réels se calculent sur le bénéfice global de la société (tous biens + autres activités confondus), pas immeuble par immeuble — seule la taxe communale est vraiment propre à chaque bien. {!onlyRealEstate && "Comme la société a d'autres activités, ce total ne couvre que la part immobilière du bénéfice réel de la société."}
          {" "}<button type="button" onClick={() => setOnlyRealEstate(null)} style={styles.linkBtn}>Changer ma réponse</button>
        </span>
      </div>

      <section style={styles.card}>
        <div style={styles.cardTitle}>Détail bien par bien — {year}</div>
        <div style={styles.ledgerScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Bien</th>
                <th style={styles.th}>Loyer annuel</th>
                <th style={styles.th}>Charges</th>
                <th style={styles.th}>Amortissement</th>
                <th style={styles.th}>Intérêts déd.</th>
                <th style={styles.th}>Résultat fiscal</th>
                <th style={styles.th}>Taxe communale</th>
                <th style={styles.th}>IS (part alloué)</th>
                <th style={styles.th}>CSS (part alloué)</th>
                <th style={styles.th}>Total estimé</th>
              </tr>
            </thead>
            <tbody>
              {perPropertyWithTax.map((r) => (
                <tr key={r.property.id}>
                  <td style={styles.td}>{r.property.name}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.revenu)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.charges)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.amort.total)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.fin.interetDeductible)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)", color: r.resultatFiscal >= 0 ? "var(--good)" : "var(--bad)" }}>{fmt(r.resultatFiscal)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.taxeCommunale)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.isAlloue)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.cssAlloue)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>{fmt(r.totalAlloue)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Total portefeuille</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.revenu)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.charges)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.amort)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.interets)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.resultatFiscal)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.taxeCommunale)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(isRetenuGlobal)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(cssDuGlobal)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{fmt(totalEstime)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={styles.emptyNote}>
          Résultat fiscal = loyers − charges − amortissement − intérêts déductibles (crédit ou compte courant, hors remboursement de capital, non déductible). Astuce : renseigne la "Valeur locative annuelle officielle" dans la fiche de chaque bien pour une taxe communale plus précise.
        </div>
      </section>

      <section style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitle}>Financement par bien — crédits, comptes courants, amortissement</div>
        <div style={styles.ledgerScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Bien</th>
                <th style={styles.th}>Financement</th>
                <th style={styles.th}>Amort. bâti</th>
                <th style={styles.th}>Amort. mobilier</th>
                <th style={styles.th}>Intérêts déductibles</th>
                <th style={styles.th}>Remb. capital (non déd.)</th>
                <th style={styles.th}>Solde restant</th>
              </tr>
            </thead>
            <tbody>
              {perProperty.map((r) => (
                <tr key={r.property.id}>
                  <td style={styles.td}>{r.property.name}</td>
                  <td style={styles.td}>
                    {r.fin.mode === "cash" && "Cash"}
                    {r.fin.mode === "credit" && "Crédit bancaire"}
                    {r.fin.mode === "cca" && "Compte courant associé"}
                  </td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.amort.batiment)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.property.meuble ? fmt(r.amort.mobilier) : "—"}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmt(r.fin.interetDeductible)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.fin.mode === "credit" ? fmt(r.fin.principalNonDeductible) : "—"}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.fin.label ? fmt(r.fin.soldeRestant) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={styles.emptyNote}>
          Amortissement du bâti : valeur estimée ÷ durée choisie (25 ans par défaut = 4%/an). Amortissement du mobilier : sur 10 ans (10%/an), uniquement si le bien est marqué "meublé" avec une valeur de mobilier renseignée. Pour un compte courant d'associé, l'intérêt déductible est plafonné au taux légal 2026 ({CCA_TAUX_PLAFOND_2026}%) même si un taux supérieur est appliqué en réalité — le surplus n'est pas déductible.
        </div>
      </section>

      <section style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitle}>TVA par bien</div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
          Au Maroc, la location de locaux <strong>nus</strong> à usage professionnel/commercial est en principe <strong>hors champ de TVA</strong> — sauf dans un <strong>mall</strong> (soumis à 20% même nu) ou si le local est <strong>meublé/équipé</strong> (soumis à 20%). L'habitation reste toujours hors champ. Coche "Meublé" dans la fiche d'un bien s'il l'est réellement.
        </p>
        <div style={styles.ledgerScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Bien</th>
                <th style={styles.th}>Assujetti ?</th>
                <th style={styles.th}>Base locative pro (annuelle)</th>
                <th style={styles.th}>TVA collectée (20%)</th>
                <th style={styles.th}>TVA récupérable (charges)</th>
                <th style={styles.th}>TVA nette due</th>
              </tr>
            </thead>
            <tbody>
              {perProperty.map((r) => (
                <tr key={r.property.id}>
                  <td style={styles.td}>{r.property.name}</td>
                  <td style={styles.td}>
                    {r.tva.assujetti ? (
                      <span style={styles.tagGood}><CheckCircle2 size={13} /> Oui</span>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>Hors champ</span>
                    )}
                  </td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.tva.assujetti ? fmt(r.tva.baseLoyers) : "—"}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.tva.assujetti ? fmt(r.tva.tvaCollectee) : "—"}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{r.tva.assujetti ? fmt(r.tva.tvaRecuperable) : "—"}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{r.tva.assujetti ? fmt(r.tva.tvaNette) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Total portefeuille</td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(perProperty.reduce((s, r) => s + (r.tva.assujetti ? r.tva.baseLoyers : 0), 0))}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.tvaCollectee)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(totals.tvaRecuperable)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{fmt(totals.tvaNette)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={styles.emptyNote}>
          La TVA collectée est facturée en plus du loyer au locataire (donc pas un coût pour toi), mais doit être reversée à l'État, minorée de la TVA que tu récupères sur tes charges. Estimation basée sur des charges saisies TTC. Cas particuliers (option volontaire pour la TVA sur un local nu, promoteur, etc.) non couverts ici — à confirmer avec ton comptable.
        </div>
      </section>

      <div className="two-col" style={{ ...styles.twoCol, marginTop: 16 }}>
        <section style={styles.card}>
          <div style={styles.cardTitle}>Impôt sur les Sociétés (IS) — global</div>
          <div style={styles.typeRows}>
            <div style={styles.typeRow}><span style={styles.typeRowLabel}>Bénéfice imposable (part immobilière)</span><span style={styles.typeRowValue}>{fmt(beneficeImposable)}</span></div>
            <div style={styles.typeRow}><span style={styles.typeRowLabel}>IS à 20% (taux 2026, sociétés &lt; 100M DH)</span><span style={styles.typeRowValue}>{fmt(isDuGlobal)}</span></div>
            <div style={styles.typeRow}><span style={styles.typeRowLabel}>Cotisation minimale (0,25% du CA locatif)</span><span style={styles.typeRowValue}>{fmt(cotisationMinimaleGlobale)}</span></div>
            <div style={styles.divider} />
            <div style={styles.typeRow}><span style={{ ...styles.typeRowLabel, fontWeight: 600 }}>IS retenu (le plus élevé des deux)</span><span style={{ ...styles.typeRowValue, color: "var(--accent)" }}>{fmt(isRetenuGlobal)}</span></div>
          </div>
          <div style={styles.emptyNote}>La cotisation minimale s'applique même en cas de déficit — c'est un plancher, pas une option.</div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Contribution Sociale de Solidarité (CSS) — globale</div>
          {beneficeImposable < 1000000 ? (
            <div style={styles.emptyNote}>Ne s'applique pas : la CSS ne concerne que les bénéfices dépassant 1 000 000 DH.</div>
          ) : (
            <div style={styles.typeRows}>
              <div style={styles.typeRow}><span style={styles.typeRowLabel}>Tranche applicable</span><span style={styles.typeRowValue}>{(cssRatePct * 100).toFixed(1)}%</span></div>
              <div style={styles.typeRow}><span style={{ ...styles.typeRowLabel, fontWeight: 600 }}>CSS estimée</span><span style={{ ...styles.typeRowValue, color: "var(--accent)" }}>{fmt(cssDuGlobal)}</span></div>
            </div>
          )}
        </section>
      </div>

      <section style={{ ...styles.card, marginTop: 16, borderColor: "var(--accent-dim)" }}>
        <div style={styles.cardTitle}>Total estimé à provisionner ({year})</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: "var(--accent)", marginTop: 6 }}>{fmt(totalEstime)}</div>
        <div style={styles.emptyNote}>IS/cotisation minimale retenue + CSS + taxe de services communaux (tous biens). Hors taxe professionnelle, TVA éventuelle, et impôts liés aux autres activités de la société.</div>
      </section>
    </div>
  );
}

function Modal({ modal, onClose, onSaveProperty, onSaveUnit, onSaveBulk, onSaveExpense }) {
  const [form, setForm] = useState(modal.data);
  const [formError, setFormError] = useState(null);
  const isProperty = modal.type === "property";
  const isBulk = modal.type === "bulk";
  const isExpense = modal.type === "expense";

  function set(field, val) {
    if (formError) setFormError(null);
    setForm({ ...form, [field]: val });
  }

  function submit() {
    if (isExpense) {
      if (!form.label || !form.label.trim()) {
        setFormError("Donne un libellé à cette charge (ex. Travaux, Syndic).");
        return;
      }
      try {
        onSaveExpense(modal.propertyId, form);
      } catch (err) {
        setFormError("Une erreur est survenue : " + (err?.message || "réessaie."));
      }
      return;
    }
    if (isBulk) {
      if (!form.prefix || !form.prefix.trim()) {
        setFormError("Donne un préfixe (ex. Magasin, Apt) avant d'enregistrer.");
        return;
      }
      if (!form.start || !form.end || Number(form.end) < Number(form.start)) {
        setFormError("Vérifie la plage de numéros (début / fin).");
        return;
      }
      const count = Math.abs(Number(form.end) - Number(form.start)) + 1;
      if (count > 300) {
        setFormError("Plage trop large (300 locaux max en une fois).");
        return;
      }
      try {
        onSaveBulk(modal.propertyId, form);
      } catch (err) {
        setFormError("Une erreur est survenue : " + (err?.message || "réessaie."));
      }
      return;
    }
    if (!form.name || !form.name.trim()) {
      setFormError(isProperty ? "Donne un nom à ce bien avant d'enregistrer." : "Donne un nom ou numéro à ce local avant d'enregistrer.");
      return;
    }
    try {
      if (isProperty) {
        onSaveProperty(form);
      } else {
        onSaveUnit(modal.propertyId, form);
      }
    } catch (err) {
      setFormError("Une erreur est survenue : " + (err?.message || "réessaie."));
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>
            {isProperty ? (form.id ? "Modifier le bien" : "Nouveau bien") : isBulk ? "Ajouter plusieurs locaux d'un coup" : isExpense ? "Nouvelle charge" : (form.id ? "Modifier le local" : "Nouveau local")}
          </div>
          <button type="button" style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={styles.modalBody}>
        {isProperty ? (
          <>
            <Field label="Nom du bien">
              <input style={styles.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Résidence Al Manar" autoFocus />
            </Field>
            <Field label="Type">
              <select style={styles.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Ville">
              <input style={styles.input} value={form.city || ""} onChange={(e) => set("city", e.target.value)} placeholder="Ex. Casablanca" />
            </Field>
            <Field label="Adresse">
              <input style={styles.input} value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Ex. Bd Zerktouni" />
            </Field>
            <Field label="N° de titre foncier / certificat de propriété">
              <input style={styles.input} value={form.titleDeed || ""} onChange={(e) => set("titleDeed", e.target.value)} placeholder="Ex. TF n°9970/S" />
            </Field>
            <Field label="Valeur estimée du bien (DH) — optionnel, pour le rendement">
              <input style={styles.input} type="number" value={form.estimatedValue || ""} onChange={(e) => set("estimatedValue", e.target.value)} placeholder="Ex. 3500000" />
            </Field>
            <Field label="Valeur locative annuelle officielle (DH) — optionnel, pour la taxe communale">
              <input style={styles.input} type="number" value={form.valeurLocative || ""} onChange={(e) => set("valeurLocative", e.target.value)} placeholder="Laisser vide = loyer encaissé utilisé" />
            </Field>

            <Field label="Mode de financement">
              <select style={styles.input} value={form.financingMode || "cash"} onChange={(e) => set("financingMode", e.target.value)}>
                <option value="cash">Achat cash</option>
                <option value="credit">Crédit bancaire</option>
                <option value="cca">Compte courant d'associé</option>
              </select>
            </Field>

            {form.financingMode === "credit" && (
              <>
                <div style={styles.fieldRow}>
                  <Field label="Montant emprunté (DH)">
                    <input style={styles.input} type="number" value={form.loanAmount || ""} onChange={(e) => set("loanAmount", e.target.value)} placeholder="Ex. 2000000" />
                  </Field>
                  <Field label="Taux annuel (%)">
                    <input style={styles.input} type="number" step="0.01" value={form.loanRate || ""} onChange={(e) => set("loanRate", e.target.value)} placeholder="Ex. 4.5" />
                  </Field>
                </div>
                <div style={styles.fieldRow}>
                  <Field label="Durée (années)">
                    <input style={styles.input} type="number" value={form.loanDuration || ""} onChange={(e) => set("loanDuration", e.target.value)} placeholder="Ex. 15" />
                  </Field>
                  <Field label="Date de départ du crédit">
                    <input style={styles.input} type="date" value={form.loanStartDate || ""} onChange={(e) => set("loanStartDate", e.target.value)} />
                  </Field>
                </div>
              </>
            )}

            {form.financingMode === "cca" && (
              <div style={styles.fieldRow}>
                <Field label="Solde du compte courant (DH)">
                  <input style={styles.input} type="number" value={form.ccaBalance || ""} onChange={(e) => set("ccaBalance", e.target.value)} placeholder="Ex. 1500000" />
                </Field>
                <Field label="Taux d'intérêt (%) — plafond légal 2,15% en 2026">
                  <input style={styles.input} type="number" step="0.01" value={form.ccaRate || ""} onChange={(e) => set("ccaRate", e.target.value)} placeholder="Ex. 2.15" />
                </Field>
              </div>
            )}

            <Field label="Durée d'amortissement du bâti (années) — défaut 25 ans (4%/an)">
              <input style={styles.input} type="number" value={form.amortissementDuration || ""} onChange={(e) => set("amortissementDuration", e.target.value)} placeholder="25" />
            </Field>

            <Field label="Bien meublé ?">
              <select style={styles.input} value={form.meuble ? "oui" : "non"} onChange={(e) => set("meuble", e.target.value === "oui")}>
                <option value="non">Non meublé</option>
                <option value="oui">Meublé</option>
              </select>
            </Field>

            {form.meuble && (
              <Field label="Valeur du mobilier (DH) — amorti sur 10 ans (10%/an)">
                <input style={styles.input} type="number" value={form.furnitureValue || ""} onChange={(e) => set("furnitureValue", e.target.value)} placeholder="Ex. 150000" />
              </Field>
            )}
          </>
        ) : isBulk ? (
          <>
            <Field label="Type de local">
              <select style={styles.input} value={form.unitType || "magasin"} onChange={(e) => set("unitType", e.target.value)}>
                {Object.entries(UNIT_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <Field label="Préfixe du nom">
              <input style={styles.input} value={form.prefix || ""} onChange={(e) => set("prefix", e.target.value)} placeholder="Ex. Magasin, Apt" autoFocus />
            </Field>
            <div style={styles.fieldRow}>
              <Field label="Numéro de début">
                <input style={styles.input} type="number" value={form.start} onChange={(e) => set("start", e.target.value)} />
              </Field>
              <Field label="Numéro de fin">
                <input style={styles.input} type="number" value={form.end} onChange={(e) => set("end", e.target.value)} />
              </Field>
            </div>
            <Field label="Loyer mensuel (DH) — identique pour tous, modifiable ensuite">
              <input style={styles.input} type="number" value={form.rent} onChange={(e) => set("rent", e.target.value)} placeholder="0" />
            </Field>
            {form.prefix && form.start && form.end && Number(form.end) >= Number(form.start) && (
              <div style={styles.bulkPreview}>
                Ça créera : {form.prefix.trim()} {form.start} → {form.prefix.trim()} {form.end} ({Number(form.end) - Number(form.start) + 1} locaux, vacants)
              </div>
            )}
          </>
        ) : isExpense ? (
          <>
            <Field label="Libellé de la charge">
              <input style={styles.input} value={form.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="Ex. Travaux plomberie, Syndic, Taxe" autoFocus />
            </Field>
            <Field label="Montant (DH)">
              <input style={styles.input} type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Date">
              <input style={styles.input} type="date" value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Type de local">
              <select style={styles.input} value={form.unitType || "magasin"} onChange={(e) => set("unitType", e.target.value)}>
                {Object.entries(UNIT_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <Field label="Nom / numéro du local">
              <input style={styles.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Magasin 1, Apt 3, Lot 12" autoFocus />
            </Field>
            <Field label="Locataire (laisser vide si vacant)">
              <input style={styles.input} value={form.tenant || ""} onChange={(e) => set("tenant", e.target.value)} placeholder="Nom du locataire" />
            </Field>
            <div style={styles.fieldRow}>
              <Field label="Email du locataire">
                <input style={styles.input} type="email" value={form.tenantEmail || ""} onChange={(e) => set("tenantEmail", e.target.value)} placeholder="nom@email.com" />
              </Field>
              <Field label="Téléphone (WhatsApp)">
                <input style={styles.input} value={form.tenantPhone || ""} onChange={(e) => set("tenantPhone", e.target.value)} placeholder="Ex. 0661234567" />
              </Field>
            </div>
            <div style={styles.fieldRow}>
              <Field label={Number(form.turnoverRate) > 0 ? "Loyer minimum (DH / mois)" : "Loyer mensuel (DH)"}>
                <input style={styles.input} type="number" value={form.rent} onChange={(e) => set("rent", e.target.value)} placeholder="0" />
              </Field>
              <Field label="% du chiffre d'affaires (optionnel)">
                <input style={styles.input} type="number" step="0.1" min="0" value={form.turnoverRate || ""} onChange={(e) => set("turnoverRate", e.target.value)} placeholder="Loyer fixe" />
              </Field>
            </div>
            {Number(form.turnoverRate) > 0 && (
              <div style={{ ...styles.bulkPreview, fontFamily: "var(--font-body)" }}>
                Loyer du mois = le plus élevé entre {fmt(form.rent)} et {fmtRate(form.turnoverRate)} du CA du mois.
              </div>
            )}
            <div style={styles.fieldRow}>
              <Field label="Début du bail">
                <input style={styles.input} type="date" value={form.leaseStart || ""} onChange={(e) => set("leaseStart", e.target.value)} />
              </Field>
              <Field label="Fin du bail">
                <input style={styles.input} type="date" value={form.leaseEnd || ""} onChange={(e) => set("leaseEnd", e.target.value)} />
              </Field>
            </div>
            <Field label="Date de la dernière révision de loyer — laisser vide si jamais révisé (le début du bail sert alors de référence)">
              <input style={styles.input} type="date" value={form.lastRevisionDate || ""} onChange={(e) => set("lastRevisionDate", e.target.value)} />
            </Field>
          </>
        )}

        {formError && <div style={styles.formError}>{formError}</div>}
        </div>

        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Annuler</button>
          <button type="button" style={styles.primaryBtn} onClick={submit}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function periodLabelFr(period) {
  const [y, m] = period.split("-");
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${noms[Number(m) - 1]} ${y}`;
}

function buildWhatsAppLink(phone, text) {
  if (!phone || !phone.trim()) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "212" + digits.slice(1); // Maroc par défaut si numéro local
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email, subject, body) {
  if (!email || !email.trim()) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function SendLinks({ email, phone, subject, text }) {
  const mailtoHref = buildMailtoLink(email, subject, text);
  const waHref = buildWhatsAppLink(phone, text);
  return (
    <div style={styles.sendRow}>
      {mailtoHref ? (
        <a href={mailtoHref} style={styles.sendLink}><Mail size={14} /> Envoyer par email</a>
      ) : (
        <span style={styles.sendLinkDisabled} title="Ajoute l'email du locataire dans sa fiche"><Mail size={14} /> Email non renseigné</span>
      )}
      {waHref ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" style={styles.sendLink}><MessageCircle size={14} /> Envoyer par WhatsApp</a>
      ) : (
        <span style={styles.sendLinkDisabled} title="Ajoute le téléphone du locataire dans sa fiche"><MessageCircle size={14} /> Téléphone non renseigné</span>
      )}
    </div>
  );
}

function downloadHtml(filename, title, bodyHtml) {
  const full = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Georgia, serif; color: #1a1a1a; padding: 40px; line-height: 1.6; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #ddd; }
          .amount { font-size: 22px; font-weight: bold; margin: 20px 0; }
          .sign { margin-top: 60px; display: flex; justify-content: space-between; }
          pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; line-height: 1.7; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>${bodyHtml}
        <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
      </body>
    </html>`;
  try {
    const blob = new Blob([full], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function ReceiptModal({ data, onClose }) {
  const { unit, property, period, datePaid } = data;
  const label = periodLabelFr(period);
  const amount = rentDue(unit, period);
  const [downloaded, setDownloaded] = useState(false);

  const plainText = `Quittance de loyer

Bien : ${property.name}${property.address ? " — " + property.address : ""}
Local : ${unit.name}
Locataire : ${unit.tenant}
Période : ${label}
Date de paiement : ${datePaid || "—"}
Montant reçu : ${fmt(amount)}

Je soussigné(e), bailleur du local désigné ci-dessus, atteste avoir reçu de ${unit.tenant} la somme de ${fmt(amount)} au titre du loyer de ${label}, et lui en donne quittance.

Le bailleur`;

  function handleDownload() {
    const html = `
      <h1>Quittance de loyer</h1>
      <div class="meta">Émise le ${new Date().toLocaleDateString("fr-FR")}</div>
      <div class="row"><span>Bien</span><strong>${property.name}${property.address ? " — " + property.address : ""}</strong></div>
      <div class="row"><span>Local</span><strong>${unit.name}</strong></div>
      <div class="row"><span>Locataire</span><strong>${unit.tenant}</strong></div>
      <div class="row"><span>Période</span><strong>${label}</strong></div>
      <div class="row"><span>Date de paiement</span><strong>${datePaid || "—"}</strong></div>
      <div class="amount">Montant reçu : ${fmt(amount)}</div>
      <p>Je soussigné(e), bailleur du local désigné ci-dessus, atteste avoir reçu de ${unit.tenant} la somme de ${fmt(amount)} au titre du loyer de ${label}, et lui en donne quittance.</p>
      <div class="sign"><div>Le bailleur</div><div>Signature</div></div>
    `;
    const ok = downloadHtml(`quittance-${unit.name}-${period}.html`, `Quittance ${unit.name} ${label}`, html);
    setDownloaded(ok);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Quittance de loyer</div>
          <button type="button" style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={styles.modalBody}>
        <div style={styles.receiptPreview}>
          <div style={styles.receiptRow}><span>Bien</span><strong>{property.name}</strong></div>
          <div style={styles.receiptRow}><span>Local</span><strong>{unit.name}</strong></div>
          <div style={styles.receiptRow}><span>Locataire</span><strong>{unit.tenant}</strong></div>
          <div style={styles.receiptRow}><span>Période</span><strong>{label}</strong></div>
          <div style={styles.receiptRow}><span>Montant</span><strong>{fmt(amount)}</strong></div>
        </div>
        <SendLinks email={unit.tenantEmail} phone={unit.tenantPhone} subject={`Quittance de loyer — ${unit.name} — ${label}`} text={plainText} />
        <div style={styles.emptyNote}>Le fichier téléchargé (avec mise en page) peut être joint manuellement à l'email si besoin.</div>
        {downloaded && (
          <div style={styles.downloadNote}>
            Fichier téléchargé. Ouvre-le (double-clic) — il s'imprime automatiquement, ou choisis "Enregistrer en PDF" dans la fenêtre d'impression.
          </div>
        )}
        </div>
        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Fermer</button>
          <button type="button" style={styles.primaryBtn} onClick={handleDownload}>
            <Download size={14} /> Télécharger la quittance
          </button>
        </div>
      </div>
    </div>
  );
}

function TurnoverModal({ data, onClose, onSave }) {
  const { unit, propertyId } = data;
  const [period, setPeriod] = useState(data.period);
  const [amount, setAmount] = useState(String(unit.turnovers?.[data.period] || ""));
  const preview = rentDue({ ...unit, turnovers: { [period]: Number(amount) || 0 } }, period);

  function changePeriod(p) {
    setPeriod(p);
    setAmount(String(unit.turnovers?.[p] || ""));
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Chiffre d'affaires — {unit.tenant}</div>
          <IconBtn onClick={onClose} title="Fermer"><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <Field label="Mois">
            <input style={styles.input} type="month" value={period} onChange={(e) => e.target.value && changePeriod(e.target.value)} />
          </Field>
          <Field label="Chiffre d'affaires déclaré du mois (DH)">
            <input style={styles.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
          </Field>
          <div style={styles.receiptPreview}>
            <div style={styles.receiptRow}><span>{fmtRate(unit.turnoverRate)} du CA</span><span>{fmt(Math.round(((Number(amount) || 0) * Number(unit.turnoverRate)) / 100))}</span></div>
            <div style={styles.receiptRow}><span>Minimum garanti</span><span>{fmt(unit.rent)}</span></div>
            <div style={styles.divider} />
            <div style={styles.receiptRow}><span>Loyer dû pour {periodLabelFr(period)}</span><strong>{fmt(preview)}</strong></div>
          </div>
        </div>
        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Annuler</button>
          <button type="button" style={styles.primaryBtn} onClick={() => onSave(propertyId, unit.id, period, amount)}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function getUnpaidMonthsBack(unitId, payments, curPeriod, maxBack) {
  const [y, m] = curPeriod.split("-").map(Number);
  const months = [];
  let year = y, month = m;
  for (let i = 0; i < (maxBack || 12); i++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const paid = payments?.[`${unitId}|${key}`]?.paid;
    if (paid) break;
    months.push(key);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return months; // most recent first
}

function rentRevisionInfo(unit, today) {
  const t = guessUnitType(unit);
  let capRate, lawRef;
  if (t === "magasin") { capRate = 0.10; lawRef = "loi 49-16 (bail commercial), révision triennale plafonnée à 10%"; }
  else if (t === "bureau") { capRate = 0.08; lawRef = "loi 49-16 (bail professionnel), révision triennale plafonnée à 8%"; }
  else if (t === "appartement") { capRate = 0.08; lawRef = "loi 67-12 (bail d'habitation), révision triennale plafonnée à 8%"; }
  else { capRate = null; lawRef = "type de bail non déterminé — vérifier le contrat"; }

  const refDateStr = unit.lastRevisionDate || unit.leaseStart;
  if (!refDateStr) return { eligible: false, capRate, lawRef, refDate: null, nextEligibleDate: null };
  const refDate = new Date(refDateStr);
  if (isNaN(refDate)) return { eligible: false, capRate, lawRef, refDate: null, nextEligibleDate: null };
  const nextEligibleDate = new Date(refDate);
  nextEligibleDate.setFullYear(nextEligibleDate.getFullYear() + 3);
  const eligible = nextEligibleDate <= today && capRate !== null;
  const newRentMax = capRate !== null ? Math.round((Number(unit.rent) || 0) * (1 + capRate)) : null;
  return { eligible, capRate, lawRef, refDate, nextEligibleDate, newRentMax };
}

function legalBasis(unit) {
  const t = guessUnitType(unit);
  if (t === "magasin" || t === "bureau") {
    return {
      isCommercial: true,
      lawName: "la loi n° 49-16 relative aux baux d'immeubles à usage commercial, industriel ou artisanal",
      article: "l'article 8 de la loi 49-16, lequel autorise le bailleur à saisir le tribunal en référé pour obtenir la résiliation du bail, sans indemnité d'éviction, lorsque le non-paiement se poursuit pendant trois mois consécutifs après mise en demeure restée infructueuse",
    };
  }
  return {
    isCommercial: false,
    lawName: "la loi n° 67-12 relative aux baux d'habitation ou à usage professionnel",
    article: "l'article 56 de la loi 67-12, le non-paiement du loyer constituant un motif grave et légitime de résiliation judiciaire du bail",
  };
}

function buildLetterText(tier, unit, property, unpaidMonths) {
  const monthsOldestFirst = unpaidMonths.slice().reverse();
  const monthsLabels = monthsOldestFirst.map(periodLabelFr).join(", ");
  const totalDue = unpaidMonths.reduce((sum, m) => sum + rentDue(unit, m), 0);
  const legal = legalBasis(unit);
  const addressPart = property.address ? ", " + property.address : "";
  const today = new Date().toLocaleDateString("fr-FR");

  if (tier === 1) {
    return `Objet : Rappel de paiement — loyer de ${monthsLabels}

Madame, Monsieur ${unit.tenant},

Sauf erreur ou paiement croisé avec le présent courrier, je constate que le loyer du local "${unit.name}" situé dans "${property.name}"${addressPart}, au titre de ${monthsLabels}, d'un montant de ${fmt(totalDue)}, n'a pas encore été réglé.

Je vous remercie de bien vouloir régulariser cette situation dans les meilleurs délais.

Je reste à votre disposition pour tout renseignement complémentaire.

Cordialement,
Le bailleur
Date : ${today}`;
  }

  if (tier === 2) {
    return `Objet : Avertissement — loyers impayés (${monthsLabels})

Madame, Monsieur ${unit.tenant},

Malgré mon précédent rappel, je constate que les loyers du local "${unit.name}" situé dans "${property.name}"${addressPart}, au titre de ${monthsLabels}, restent impayés à ce jour, pour un montant total de ${fmt(totalDue)}.

Je vous demande de bien vouloir régulariser cette situation sous 8 jours. À défaut, je me verrai contraint de vous adresser une mise en demeure formelle, conformément à ${legal.lawName}, laquelle pourra conduire à une procédure judiciaire en résiliation du bail${legal.isCommercial ? " et à la perte de votre droit au bail" : " et expulsion"}.

Je reste toutefois à votre disposition pour trouver une solution amiable avant d'en arriver là.

Cordialement,
Le bailleur
Date : ${today}`;
  }

  return `Objet : Mise en demeure de payer — loyers impayés

Madame, Monsieur ${unit.tenant},

Par la présente, je vous mets en demeure de régler la somme de ${fmt(totalDue)}, correspondant aux loyers impayés des mois de ${monthsLabels}, relatifs au local "${unit.name}" situé dans "${property.name}"${addressPart}.

Conformément à ${legal.article}, vous disposez d'un délai de 15 jours à compter de la réception de la présente pour régulariser intégralement votre situation.

À défaut de paiement dans ce délai, je me réserve le droit de saisir le tribunal compétent${legal.isCommercial ? " en référé" : ""} aux fins d'obtenir${legal.isCommercial ? " la résiliation du bail commercial, sans indemnité d'éviction," : " une ordonnance de paiement puis, le cas échéant, la résiliation judiciaire du bail et votre expulsion,"} ainsi que le paiement des sommes dues, majorées des intérêts moratoires et frais de procédure.

Pour donner à cette lettre pleine valeur juridique, il est recommandé de la faire signifier par huissier de justice ou de l'envoyer en lettre recommandée avec accusé de réception.

Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Le bailleur
Date : ${today}`;
}

function LetterModal({ data, onClose }) {
  const { unit, property, period, payments } = data;
  const unpaidMonths = useMemo(() => getUnpaidMonthsBack(unit.id, payments, period, 12), [unit.id, payments, period]);
  const suggestedTier = unpaidMonths.length >= 3 ? 3 : unpaidMonths.length;
  const [tier, setTier] = useState(suggestedTier || 1);
  const [text, setText] = useState(buildLetterText(suggestedTier || 1, unit, property, unpaidMonths));
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  function chooseTier(t) {
    setTier(t);
    setText(buildLetterText(t, unit, property, unpaidMonths));
    setDownloaded(false);
  }

  const totalDue = unpaidMonths.reduce((sum, m) => sum + rentDue(unit, m), 0);
  const tierNames = { 1: "1er rappel", 2: "2e avertissement", 3: "Mise en demeure" };
  const fileTag = { 1: "rappel", 2: "avertissement", 3: "mise-en-demeure" };

  function handleDownload() {
    const ok = downloadHtml(`${fileTag[tier]}-${unit.tenant}.html`, `${tierNames[tier]} — ${unit.tenant}`, `<pre>${text.replace(/</g, "&lt;")}</pre>`);
    setDownloaded(ok);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, width: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Courrier pour loyer impayé</div>
          <button type="button" style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={styles.modalBody}>
        <div style={styles.emptyNote}>
          {unpaidMonths.length} mois impayé(s) détecté(s) pour ce locataire ({fmt(totalDue)} au total). Palier suggéré présélectionné ci-dessous, modifiable.
        </div>
        <div style={styles.tierSelector}>
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => chooseTier(t)}
              style={{ ...styles.tierBtn, ...(tier === t ? styles.tierBtnActive : {}) }}
            >
              {tierNames[t]}
            </button>
          ))}
        </div>
        <div style={styles.emptyNote}>Modèle informatif basé sur la loi marocaine — à relire avant envoi, modifiable ci-dessous.</div>
        <textarea style={styles.letterTextarea} value={text} onChange={(e) => setText(e.target.value)} rows={14} />
        <SendLinks email={unit.tenantEmail} phone={unit.tenantPhone} subject={`${tierNames[tier]} — ${property.name} — ${unit.name}`} text={text} />
        {downloaded && (
          <div style={styles.downloadNote}>
            Fichier téléchargé. Ouvre-le — il s'imprime automatiquement, ou choisis "Enregistrer en PDF".
          </div>
        )}
        </div>
        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={handleCopy}>
            <Copy size={14} /> {copied ? "Copié !" : "Copier le texte"}
          </button>
          <button type="button" style={styles.primaryBtn} onClick={handleDownload}>
            <Download size={14} /> Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}

function RevisionModal({ data, onClose, onConfirm }) {
  const { unit, property } = data;
  const info = rentRevisionInfo(unit, new Date());
  const [newRent, setNewRent] = useState(String(info.newRentMax || unit.rent));
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const noticeText = `Objet : Notification de révision de loyer

Madame, Monsieur ${unit.tenant},

Conformément à ${info.lawRef}, et le délai légal de trois ans étant écoulé depuis ${info.refDate ? info.refDate.toLocaleDateString("fr-FR") : "la dernière révision"}, je vous informe de la révision du loyer du local "${unit.name}" situé dans "${property.name}"${property.address ? ", " + property.address : ""}.

Loyer actuel : ${fmt(unit.rent)}
Nouveau loyer proposé : ${fmt(Number(newRent) || 0)}
Applicable à compter du : ${new Date().toLocaleDateString("fr-FR")}

Je reste à votre disposition pour en discuter si nécessaire.

Cordialement,
Le bailleur`;

  function handleDownload() {
    const ok = downloadHtml(`revision-loyer-${unit.tenant}.html`, `Révision de loyer — ${unit.tenant}`, `<pre>${noticeText.replace(/</g, "&lt;")}</pre>`);
    setDownloaded(ok);
  }

  function handleConfirm() {
    onConfirm(property.id, unit.id, newRent);
  }

  const exceedsCap = info.capRate !== null && Number(newRent) > Math.round(unit.rent * (1 + info.capRate)) + 1;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Révision de loyer</div>
          <button type="button" style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.emptyNote}>{info.lawRef}. Ce montant n'est appliqué qu'après ta confirmation ci-dessous — rien n'est modifié automatiquement.</div>

          <div style={styles.receiptPreview}>
            <div style={styles.receiptRow}><span>Local</span><strong>{unit.name} — {property.name}</strong></div>
            <div style={styles.receiptRow}><span>Locataire</span><strong>{unit.tenant}</strong></div>
            <div style={styles.receiptRow}><span>Loyer actuel</span><strong>{fmt(unit.rent)}</strong></div>
            <div style={styles.receiptRow}><span>Plafond légal (+{info.capRate !== null ? (info.capRate * 100).toFixed(0) : "?"}%)</span><strong>{fmt(info.newRentMax)}</strong></div>
          </div>

          <Field label="Nouveau loyer à appliquer (DH) — modifiable, plafonné par la loi">
            <input style={styles.input} type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} />
          </Field>
          {exceedsCap && (
            <div style={styles.formError}>Ce montant dépasse le plafond légal de +{(info.capRate * 100).toFixed(0)}%. Assure-toi d'avoir un accord écrit du locataire, sinon la hausse est contestable.</div>
          )}

          <SendLinks email={unit.tenantEmail} phone={unit.tenantPhone} subject={`Notification de révision de loyer — ${unit.name}`} text={noticeText} />
          {downloaded && <div style={styles.downloadNote}>Fichier téléchargé — à envoyer au locataire pour l'informer avant application.</div>}

          <label style={styles.confirmRow}>
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
            <span>Je confirme vouloir appliquer ce nouveau loyer de {fmt(Number(newRent) || 0)} à partir de maintenant.</span>
          </label>
        </div>
        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={handleDownload}>
            <Download size={14} /> Télécharger la notification
          </button>
          <button type="button" style={{ ...styles.primaryBtn, opacity: confirmChecked ? 1 : 0.5 }} disabled={!confirmChecked} onClick={handleConfirm}>
            Confirmer et mettre à jour le loyer
          </button>
        </div>
      </div>
    </div>
  );
}

