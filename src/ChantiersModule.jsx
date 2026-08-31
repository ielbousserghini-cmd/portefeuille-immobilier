import { useState, useEffect, useMemo } from "react";
import {
  HardHat, LayoutGrid, Plus, Pencil, Trash2,
  ChevronRight, MapPin, Calendar, Wallet, ListChecks, Image as ImageIcon,
  Upload, X, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { api } from "./api";
import { uploadToCloudinary } from "./cloudinary";
import { styles, IconBtn } from "./theme.jsx";

// Ce module est monté par ExtranetShell.jsx, qui possède désormais l'unique
// Sidebar, le bouton de déconnexion et le bloc compte de toute l'extranet.
// currentUser.chantierRole (résolu côté serveur par access.getChantierRole,
// renvoyé par /api/me et /api/login) porte le rôle propre au module Chantiers
// — admin/direction/chef_chantier/sous_traitant — indépendamment de
// currentUser.role qui reste le rôle global Loyers (admin/employe).
//
// Ce module ne conserve que sa navigation interne (liste de chantiers ->
// détail d'un chantier -> onglets avancement/planning/budget/documents),
// intacte par rapport à l'app d'origine.

const STATUS_LABELS = {
  en_cours: { label: "En cours", tone: "warn" },
  termine: { label: "Terminé", tone: "good" },
  suspendu: { label: "Suspendu", tone: "bad" },
};

const TASK_STATUS = {
  a_venir: { label: "À venir", tone: "neutral" },
  en_cours: { label: "En cours", tone: "warn" },
  termine: { label: "Terminé", tone: "good" },
  retard: { label: "En retard", tone: "bad" },
};

function fmtMoney(n) {
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(n || 0) + " DH";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

export default function ChantiersModule({ currentUser }) {
  const isAdmin = currentUser.chantierRole === "admin";

  const [chantiers, setChantiers] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState(null);

  async function loadChantiers() {
    try {
      const { chantiers } = await api.listChantiers();
      setChantiers(chantiers);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadChantiers();
  }, []);

  function flashError(msg) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  async function createChantier(data) {
    try {
      await api.createChantier(data);
      setModal(null);
      loadChantiers();
    } catch (err) {
      flashError(err.message);
    }
  }

  return (
    <>
      {error && <div style={styles.errorBanner}>{error}</div>}

      {!selectedId && (
        <ChantiersList
          chantiers={chantiers}
          isAdmin={isAdmin}
          onOpen={setSelectedId}
          onNew={() => setModal({ type: "chantier" })}
        />
      )}

      {selectedId && (
        <ChantierDetail
          chantierId={selectedId}
          currentUser={currentUser}
          onBack={() => { setSelectedId(null); loadChantiers(); }}
          flashError={flashError}
        />
      )}

      {modal?.type === "chantier" && (
        <ChantierModal onClose={() => setModal(null)} onSave={createChantier} />
      )}
    </>
  );
}

function ChantiersList({ chantiers, isAdmin, onOpen, onNew }) {
  return (
    <div style={styles.page}>
      <header style={styles.pageHeaderRow}>
        <div>
          <div style={styles.eyebrow}>Vue d'ensemble</div>
          <h1 style={styles.h1}>Chantiers</h1>
        </div>
        {isAdmin && (
          <button style={styles.primaryBtn} onClick={onNew}>
            <Plus size={16} strokeWidth={2} /> Nouveau chantier
          </button>
        )}
      </header>

      {chantiers === null ? (
        <div style={styles.emptyNote}>Chargement...</div>
      ) : chantiers.length === 0 ? (
        <div style={styles.emptyState}>
          <HardHat size={28} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucun chantier pour l'instant</div>
          <div style={styles.emptyStateSub}>
            {isAdmin ? "Crée ton premier chantier pilote pour commencer le suivi." : "Aucun chantier ne t'a encore été affecté."}
          </div>
        </div>
      ) : (
        <div style={styles.grid3}>
          {chantiers.map((c) => {
            const status = STATUS_LABELS[c.status] || STATUS_LABELS.en_cours;
            return (
              <div key={c.id} style={{ ...styles.card, cursor: "pointer" }} onClick={() => onOpen(c.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</div>
                  <span style={styles.badge(status.tone)}>{status.label}</span>
                </div>
                {c.address && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
                    <MapPin size={12} /> {c.address}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={styles.progressTrack}><div style={styles.progressFill(c.avancement_global)} /></div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--accent)" }}>{c.avancement_global}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChantierDetail({ chantierId, currentUser, onBack, flashError }) {
  const [data, setData] = useState(null);
  const [subtab, setSubtab] = useState("avancement");
  const [modal, setModal] = useState(null);
  const isAdmin = currentUser.chantierRole === "admin";
  const canWrite = currentUser.chantierRole !== "direction";
  const canWritePlanning = currentUser.chantierRole === "admin" || currentUser.chantierRole === "chef_chantier";
  const canWriteBudget = currentUser.chantierRole === "admin";

  async function load() {
    try {
      const res = await api.getChantier(chantierId);
      setData(res);
    } catch (err) {
      flashError(err.message);
    }
  }

  useEffect(() => { load(); }, [chantierId]);

  if (!data) return <div style={styles.page}><div style={styles.emptyNote}>Chargement...</div></div>;

  const { chantier, lots, canSeeBudget } = data;
  const status = STATUS_LABELS[chantier.status] || STATUS_LABELS.en_cours;

  const tabs = [
    { id: "avancement", label: "Avancement", icon: HardHat },
    { id: "planning", label: "Planning", icon: Calendar },
    ...(canSeeBudget ? [{ id: "budget", label: "Budget", icon: Wallet }] : []),
    { id: "documents", label: "Photos & documents", icon: ImageIcon },
  ];

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={onBack}>
        <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Tous les chantiers
      </button>

      <header style={styles.pageHeaderRow}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={styles.eyebrow}>{chantier.address || "Chantier"}</span>
            <span style={styles.badge(status.tone)}>{status.label}</span>
          </div>
          <h1 style={styles.h1}>{chantier.name}</h1>
          {(chantier.start_date || chantier.planned_end_date) && (
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 6 }}>
              {fmtDate(chantier.start_date)} → {fmtDate(chantier.planned_end_date)}
            </div>
          )}
        </div>
        {isAdmin && (
          <button style={styles.secondaryBtn} onClick={() => setModal({ type: "editChantier" })}>
            <Pencil size={14} /> Modifier le chantier
          </button>
        )}
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = subtab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubtab(t.id)}
              style={{
                ...styles.ghostBtn,
                borderColor: active ? "var(--accent)" : "var(--border)",
                color: active ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {subtab === "avancement" && (
        <AvancementTab
          chantierId={chantierId}
          lots={lots}
          isAdmin={isAdmin}
          canWrite={canWrite}
          onChanged={load}
          flashError={flashError}
        />
      )}
      {subtab === "planning" && (
        <PlanningTab chantierId={chantierId} lots={lots} canWrite={canWritePlanning} flashError={flashError} />
      )}
      {subtab === "budget" && canSeeBudget && (
        <BudgetTab chantierId={chantierId} canWrite={canWriteBudget} flashError={flashError} />
      )}
      {subtab === "documents" && (
        <DocumentsTab chantierId={chantierId} lots={lots} currentUser={currentUser} canWrite={canWrite} flashError={flashError} />
      )}

      {modal?.type === "editChantier" && (
        <ChantierModal
          initial={chantier}
          onClose={() => setModal(null)}
          onSave={async (patch) => {
            try {
              await api.updateChantier(chantierId, patch);
              setModal(null);
              load();
            } catch (err) {
              flashError(err.message);
            }
          }}
        />
      )}
    </div>
  );
}

// --- Avancement (lots) ---

function AvancementTab({ chantierId, lots, isAdmin, canWrite, onChanged, flashError }) {
  const [modal, setModal] = useState(null);

  async function saveLot(data) {
    try {
      if (data.id) await api.updateLot(data.id, data);
      else await api.addLot(chantierId, data);
      setModal(null);
      onChanged();
    } catch (err) {
      flashError(err.message);
    }
  }

  async function deleteLot(lotId) {
    try {
      await api.deleteLot(lotId);
      onChanged();
    } catch (err) {
      flashError(err.message);
    }
  }

  async function addAvancement(lotId, data) {
    try {
      await api.addAvancement(lotId, data);
      setModal(null);
      onChanged();
    } catch (err) {
      flashError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {isAdmin && (
          <button style={styles.secondaryBtn} onClick={() => setModal({ type: "lot" })}>
            <Plus size={14} /> Ajouter un lot
          </button>
        )}
      </div>

      {lots.length === 0 ? (
        <div style={styles.emptyState}>
          <ListChecks size={26} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucun lot défini</div>
          <div style={styles.emptyStateSub}>Un lot représente une phase ou un corps de métier (ex. gros œuvre, électricité, plomberie).</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lots.map((l) => (
            <div key={l.id} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{l.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={styles.progressTrack}><div style={styles.progressFill(l.avancement)} /></div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--accent)", minWidth: 36 }}>{l.avancement}%</span>
                  </div>
                  {l.avancement_updated_at && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>Mis à jour le {fmtDate(l.avancement_updated_at)}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {canWrite && (
                    <button style={styles.ghostBtn} onClick={() => setModal({ type: "avancement", lot: l })}>
                      Mettre à jour
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <IconBtn onClick={() => setModal({ type: "lot", lot: l })}><Pencil size={13} /></IconBtn>
                      <IconBtn danger onClick={() => deleteLot(l.id)}><Trash2 size={13} /></IconBtn>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.type === "lot" && (
        <LotModal initial={modal.lot} onClose={() => setModal(null)} onSave={saveLot} />
      )}
      {modal?.type === "avancement" && (
        <AvancementModal lot={modal.lot} onClose={() => setModal(null)} onSave={(data) => addAvancement(modal.lot.id, data)} />
      )}
    </div>
  );
}

function LotModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{initial ? "Modifier le lot" : "Nouveau lot"}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Nom du lot</span>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Gros œuvre, Électricité..." autoFocus />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Description (optionnel)</span>
            <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div style={styles.modalActions}>
          <button style={styles.ghostBtn} onClick={onClose}>Annuler</button>
          <button style={styles.primaryBtn} onClick={() => onSave({ id: initial?.id, name, description })} disabled={!name.trim()}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function AvancementModal({ lot, onClose, onSave }) {
  const [percentage, setPercentage] = useState(lot.avancement ?? 0);
  const [comment, setComment] = useState("");
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Mise à jour — {lot.name}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Avancement (%)</span>
            <input style={styles.input} type="number" min="0" max="100" value={percentage} onChange={(e) => setPercentage(e.target.value)} autoFocus />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Commentaire (optionnel)</span>
            <input style={styles.input} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. Coulage dalle terminé" />
          </label>
        </div>
        <div style={styles.modalActions}>
          <button style={styles.ghostBtn} onClick={onClose}>Annuler</button>
          <button style={styles.primaryBtn} onClick={() => onSave({ percentage: Number(percentage), comment })}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Planning ---

function PlanningTab({ chantierId, lots, canWrite, flashError }) {
  const [tasks, setTasks] = useState(null);
  const [modal, setModal] = useState(null);

  async function load() {
    try {
      const { tasks } = await api.listPlanning(chantierId);
      setTasks(tasks);
    } catch (err) {
      flashError(err.message);
    }
  }
  useEffect(() => { load(); }, [chantierId]);

  async function saveTask(data) {
    try {
      if (data.id) await api.updatePlanningTask(data.id, data);
      else await api.addPlanningTask(chantierId, data);
      setModal(null);
      load();
    } catch (err) {
      flashError(err.message);
    }
  }
  async function deleteTask(id) {
    try {
      await api.deletePlanningTask(id);
      load();
    } catch (err) {
      flashError(err.message);
    }
  }

  const lotName = (id) => lots.find((l) => l.id === id)?.name || "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {canWrite && (
          <button style={styles.secondaryBtn} onClick={() => setModal({ type: "task" })}>
            <Plus size={14} /> Ajouter une tâche
          </button>
        )}
      </div>

      {tasks === null ? (
        <div style={styles.emptyNote}>Chargement...</div>
      ) : tasks.length === 0 ? (
        <div style={styles.emptyState}>
          <Calendar size={26} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucune tâche planifiée</div>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tâche</th>
              <th style={styles.th}>Lot</th>
              <th style={styles.th}>Début</th>
              <th style={styles.th}>Fin prévue</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const st = TASK_STATUS[t.status] || TASK_STATUS.a_venir;
              return (
                <tr key={t.id}>
                  <td style={styles.td}>{t.title}</td>
                  <td style={styles.td}>{t.lot_id ? lotName(t.lot_id) : <span style={{ color: "var(--text-dim)" }}>Général</span>}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(t.start_date)}</td>
                  <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(t.end_date)}</td>
                  <td style={styles.td}>
                    {canWrite ? (
                      <select
                        style={{ ...styles.input, padding: "4px 8px", fontSize: 12 }}
                        value={t.status}
                        onChange={(e) => saveTask({ id: t.id, status: e.target.value })}
                      >
                        {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : (
                      <span style={styles.badge(st.tone)}>{st.label}</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {canWrite && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <IconBtn onClick={() => setModal({ type: "task", task: t })}><Pencil size={13} /></IconBtn>
                        <IconBtn danger onClick={() => deleteTask(t.id)}><Trash2 size={13} /></IconBtn>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modal?.type === "task" && (
        <PlanningTaskModal initial={modal.task} lots={lots} onClose={() => setModal(null)} onSave={saveTask} />
      )}
    </div>
  );
}

function PlanningTaskModal({ initial, lots, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [lotId, setLotId] = useState(initial?.lot_id || "");
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) || "");
  const [endDate, setEndDate] = useState(initial?.end_date?.slice(0, 10) || "");
  const [status, setStatus] = useState(initial?.status || "a_venir");

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{initial ? "Modifier la tâche" : "Nouvelle tâche"}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Titre</span>
            <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Lot concerné (optionnel)</span>
            <select style={styles.input} value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">Général (tout le chantier)</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Début</span>
              <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Fin prévue</span>
              <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Statut</span>
            <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>
        <div style={styles.modalActions}>
          <button style={styles.ghostBtn} onClick={onClose}>Annuler</button>
          <button
            style={styles.primaryBtn}
            disabled={!title.trim()}
            onClick={() => onSave({ id: initial?.id, title, lot_id: lotId || null, start_date: startDate || null, end_date: endDate || null, status })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Budget ---

function BudgetTab({ chantierId, canWrite, flashError }) {
  const [lines, setLines] = useState(null);
  const [modal, setModal] = useState(null);

  async function load() {
    try {
      const { lines } = await api.listBudget(chantierId);
      setLines(lines);
    } catch (err) {
      flashError(err.message);
    }
  }
  useEffect(() => { load(); }, [chantierId]);

  async function saveLine(data) {
    try {
      if (data.id) await api.updateBudgetLine(data.id, data);
      else await api.addBudgetLine(chantierId, data);
      setModal(null);
      load();
    } catch (err) {
      flashError(err.message);
    }
  }
  async function deleteLine(id) {
    try {
      await api.deleteBudgetLine(id);
      load();
    } catch (err) {
      flashError(err.message);
    }
  }

  const totals = useMemo(() => {
    if (!lines) return { prevu: 0, reel: 0 };
    return lines.reduce((acc, l) => ({ prevu: acc.prevu + Number(l.montant_prevu), reel: acc.reel + Number(l.montant_reel) }), { prevu: 0, reel: 0 });
  }, [lines]);
  const ecart = totals.reel - totals.prevu;

  return (
    <div>
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Budget prévisionnel</div>
          <div style={styles.kpiValue}>{fmtMoney(totals.prevu)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Dépenses réelles</div>
          <div style={styles.kpiValue}>{fmtMoney(totals.reel)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Écart</div>
          <div style={{ ...styles.kpiValue, color: ecart > 0 ? "var(--bad)" : "var(--good)" }}>
            {ecart > 0 ? "+" : ""}{fmtMoney(ecart)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {canWrite && (
          <button style={styles.secondaryBtn} onClick={() => setModal({ type: "line" })}>
            <Plus size={14} /> Ajouter une ligne
          </button>
        )}
      </div>

      {lines === null ? (
        <div style={styles.emptyNote}>Chargement...</div>
      ) : lines.length === 0 ? (
        <div style={styles.emptyState}>
          <Wallet size={26} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucune ligne budgétaire</div>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Catégorie</th>
              <th style={styles.th}>Libellé</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Prévu</th>
              <th style={styles.th}>Réel</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td style={styles.td}>{l.category}</td>
                <td style={styles.td}>{l.label}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(l.date)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmtMoney(l.montant_prevu)}</td>
                <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }}>{fmtMoney(l.montant_reel)}</td>
                <td style={styles.td}>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn onClick={() => setModal({ type: "line", line: l })}><Pencil size={13} /></IconBtn>
                      <IconBtn danger onClick={() => deleteLine(l.id)}><Trash2 size={13} /></IconBtn>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal?.type === "line" && (
        <BudgetLineModal initial={modal.line} onClose={() => setModal(null)} onSave={saveLine} />
      )}
    </div>
  );
}

function BudgetLineModal({ initial, onClose, onSave }) {
  const [category, setCategory] = useState(initial?.category || "");
  const [label, setLabel] = useState(initial?.label || "");
  const [montantPrevu, setMontantPrevu] = useState(initial?.montant_prevu || "");
  const [montantReel, setMontantReel] = useState(initial?.montant_reel || "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) || "");

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{initial ? "Modifier la ligne" : "Nouvelle ligne budgétaire"}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Catégorie</span>
            <input style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex. Matériaux, Main d'œuvre..." autoFocus />
          </label>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Libellé</span>
            <input style={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Montant prévu (DH)</span>
              <input style={styles.input} type="number" value={montantPrevu} onChange={(e) => setMontantPrevu(e.target.value)} />
            </label>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Montant réel (DH)</span>
              <input style={styles.input} type="number" value={montantReel} onChange={(e) => setMontantReel(e.target.value)} />
            </label>
          </div>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Date</span>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div style={styles.modalActions}>
          <button style={styles.ghostBtn} onClick={onClose}>Annuler</button>
          <button
            style={styles.primaryBtn}
            disabled={!category.trim() || !label.trim()}
            onClick={() => onSave({ id: initial?.id, category, label, montant_prevu: montantPrevu, montant_reel: montantReel, date: date || null })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Documents / photos ---

function DocumentsTab({ chantierId, lots, currentUser, canWrite, flashError }) {
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lotId, setLotId] = useState("");

  async function load() {
    try {
      const { documents } = await api.listDocuments(chantierId);
      setDocs(documents);
    } catch (err) {
      flashError(err.message);
    }
  }
  useEffect(() => { load(); }, [chantierId]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      const type = file.type.startsWith("image/") ? "photo" : "document";
      await api.addDocument({ chantierId, lotId: lotId || null, type, url, caption: file.name });
      load();
    } catch (err) {
      flashError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    try {
      await api.deleteDocument(id);
      load();
    } catch (err) {
      flashError(err.message);
    }
  }

  return (
    <div>
      {canWrite && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select style={{ ...styles.input, maxWidth: 220 }} value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">Général (tout le chantier)</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label style={{ ...styles.secondaryBtn, cursor: uploading ? "default" : "pointer" }}>
            <Upload size={14} /> {uploading ? "Envoi..." : "Ajouter une photo / un document"}
            <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>
      )}

      {docs === null ? (
        <div style={styles.emptyNote}>Chargement...</div>
      ) : docs.length === 0 ? (
        <div style={styles.emptyState}>
          <ImageIcon size={26} strokeWidth={1.5} color="var(--text-dim)" />
          <div style={styles.emptyStateTitle}>Aucune photo ni document</div>
        </div>
      ) : (
        <div style={styles.photoGrid}>
          {docs.map((d) => (
            <div key={d.id} style={styles.photoCard}>
              {d.type === "photo" ? (
                <a href={d.url} target="_blank" rel="noreferrer"><img src={d.url} alt={d.caption} style={styles.photoImg} /></a>
              ) : (
                <a href={d.url} target="_blank" rel="noreferrer" style={{ ...styles.photoImg, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                  Document
                </a>
              )}
              <div style={styles.photoCaption}>
                {d.caption || "Sans titre"}
                <br />
                <span style={{ opacity: 0.7 }}>{fmtDate(d.uploaded_at)} · {d.uploaded_by_name || "—"}</span>
              </div>
              {(currentUser.chantierRole === "admin" || d.uploaded_by === currentUser.id) && (
                <div style={{ position: "absolute", top: 6, right: 6 }}>
                  <IconBtn danger onClick={() => remove(d.id)}><Trash2 size={13} /></IconBtn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Chantier modal (create/edit) ---

function ChantierModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) || "");
  const [endDate, setEndDate] = useState(initial?.planned_end_date?.slice(0, 10) || "");
  const [status, setStatus] = useState(initial?.status || "en_cours");

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{initial ? "Modifier le chantier" : "Nouveau chantier"}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Nom du chantier</span>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label style={{ ...styles.field, marginBottom: 12 }}>
            <span style={styles.fieldLabel}>Adresse</span>
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Début</span>
              <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label style={{ ...styles.field, flex: 1 }}>
              <span style={styles.fieldLabel}>Fin prévue</span>
              <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          {initial && (
            <label style={{ ...styles.field, marginBottom: 12 }}>
              <span style={styles.fieldLabel}>Statut</span>
              <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Description (optionnel)</span>
            <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div style={styles.modalActions}>
          <button style={styles.ghostBtn} onClick={onClose}>Annuler</button>
          <button
            style={styles.primaryBtn}
            disabled={!name.trim()}
            onClick={() => onSave({ name, address, description, start_date: startDate || null, planned_end_date: endDate || null, ...(initial ? { status } : {}) })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
