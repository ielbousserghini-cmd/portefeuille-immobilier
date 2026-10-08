import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, KeyRound, Link2, X } from "lucide-react";
import { api } from "./api";
import { styles, IconBtn } from "./theme.jsx";

const CHANTIER_ROLES = {
  "": "Aucun",
  admin: "Admin",
  direction: "Direction",
  chef_chantier: "Chef de chantier",
  sous_traitant: "Sous-traitant",
};

const localStyles = {
  roleTag: (role) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    fontWeight: 600,
    color: role === "admin" ? "var(--accent)" : "var(--text-dim)",
    background: role === "admin" ? "var(--accent-soft)" : "var(--surface-2)",
  }),
  activeTag: (active) => ({
    fontSize: 12,
    color: active ? "var(--good)" : "var(--bad)",
  }),
  formRow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" },
};

function newUserDraft() {
  return { name: "", username: "", password: "", role: "employe" };
}

export default function Users({ currentUser }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(newUserDraft());
  const [creating, setCreating] = useState(false);
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  // Rôle "Chantiers" de chaque utilisateur, indépendant de son rôle Loyers
  // (users.role ci-dessus) : { [userId]: 'admin'|'direction'|'chef_chantier'|'sous_traitant'|null }
  const [chantierAccess, setChantierAccess] = useState({});
  const [assignUser, setAssignUser] = useState(null);
  const [chantiersList, setChantiersList] = useState(null);

  async function load() {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
      const entries = await Promise.all(
        users.map(async (u) => {
          try {
            const { role } = await api.getModuleAccess(u.id);
            return [u.id, role];
          } catch {
            return [u.id, null];
          }
        })
      );
      setChantierAccess(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changeChantierAccess(user, role) {
    setError(null);
    try {
      const { role: saved } = await api.setModuleAccess(user.id, "chantiers", role || null);
      setChantierAccess((prev) => ({ ...prev, [user.id]: saved }));
      if (saved !== "chef_chantier" && saved !== "sous_traitant" && assignUser?.id === user.id) {
        setAssignUser(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function openAssignments(user) {
    if (chantiersList === null) {
      try {
        const { chantiers } = await api.listChantiers();
        setChantiersList(chantiers);
      } catch (err) {
        setError(err.message);
        return;
      }
    }
    setAssignUser(user);
  }

  async function submitNewUser(e) {
    e.preventDefault();
    setError(null);
    if (!draft.name.trim() || !draft.username.trim() || !draft.password) {
      setError("Nom, identifiant et mot de passe sont requis.");
      return;
    }
    setCreating(true);
    try {
      await api.createUser(draft);
      setDraft(newUserDraft());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user) {
    setError(null);
    try {
      await api.updateUser(user.id, { active: !user.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleLoyersAccess(user) {
    setError(null);
    try {
      await api.updateUser(user.id, { loyers_access: !user.loyers_access });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRole(user) {
    setError(null);
    const nextRole = user.role === "admin" ? "employe" : "admin";
    try {
      await api.updateUser(user.id, { role: nextRole });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(user) {
    setError(null);
    try {
      await api.deleteUser(user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReset(userId) {
    setError(null);
    if (!resetPassword || resetPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    try {
      await api.updateUser(userId, { password: resetPassword });
      setResetTargetId(null);
      setResetPassword("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page" style={styles.page}>
      <header style={styles.pageHeader}>
        <div style={styles.eyebrow}>Administration</div>
        <h1 style={styles.h1}>Utilisateurs</h1>
      </header>

      {error && <div style={styles.formError}>{error}</div>}

      <section style={styles.card}>
        <div style={styles.cardTitle}>Ajouter un employé ou un administrateur</div>
        <form onSubmit={submitNewUser} style={localStyles.formRow}>
          <label style={{ ...styles.field, minWidth: 160 }}>
            <span style={styles.fieldLabel}>Nom complet</span>
            <input style={styles.input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label style={{ ...styles.field, minWidth: 140 }}>
            <span style={styles.fieldLabel}>Identifiant</span>
            <input style={styles.input} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          </label>
          <label style={{ ...styles.field, minWidth: 140 }}>
            <span style={styles.fieldLabel}>Mot de passe</span>
            <input
              style={styles.input}
              type="text"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              placeholder="8 caractères min."
            />
          </label>
          <label style={{ ...styles.field, minWidth: 130 }}>
            <span style={styles.fieldLabel}>Rôle</span>
            <select style={styles.input} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              <option value="employe">Employé (accès limité)</option>
              <option value="admin">Admin (accès complet)</option>
            </select>
          </label>
          <button type="submit" style={{ ...styles.primaryBtn, height: 38 }} disabled={creating}>
            <Plus size={16} strokeWidth={2} /> Ajouter
          </button>
        </form>
        <div style={{ ...styles.emptyNote, marginTop: 10 }}>
          Un nouvel employé a accès au module Loyers par défaut. Pour un compte réservé au module Chantiers (chef de chantier, sous-traitant), décoche "Accès Loyers" ci-dessous une fois le compte créé, puis règle son accès Chantiers dans la colonne suivante.
        </div>
      </section>

      <section style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitle}>Comptes existants</div>
        {!users ? (
          <div style={styles.emptyNote}>Chargement...</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nom</th>
                <th style={styles.th}>Identifiant</th>
                <th style={styles.th}>Rôle</th>
                <th style={styles.th}>Accès Loyers</th>
                <th style={styles.th}>Accès Chantiers</th>
                <th style={styles.th}>Statut</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.name}{u.id === currentUser.id && <span style={{ color: "var(--text-dim)" }}> (toi)</span>}</td>
                  <td style={styles.td}>{u.username}</td>
                  <td style={styles.td}><span style={localStyles.roleTag(u.role)}>{u.role === "admin" ? "Admin" : "Employé"}</span></td>
                  <td style={styles.td}>
                    {u.role === "admin" ? (
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }} title="Un administrateur global a toujours un accès complet au module Loyers.">
                        Admin (accès global)
                      </span>
                    ) : (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(u.loyers_access)}
                          onChange={() => toggleLoyersAccess(u)}
                        />
                        {u.loyers_access ? "Oui" : "Non"}
                      </label>
                    )}
                  </td>
                  <td style={styles.td}>
                    {u.role === "admin" ? (
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }} title="Un administrateur global a toujours un accès complet au module Chantiers.">
                        Admin (accès global)
                      </span>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          style={{ ...styles.input, padding: "4px 8px", fontSize: 12 }}
                          value={chantierAccess[u.id] || ""}
                          onChange={(e) => changeChantierAccess(u, e.target.value)}
                        >
                          {Object.entries(CHANTIER_ROLES).map(([k, v]) => <option key={k || "none"} value={k}>{v}</option>)}
                        </select>
                        {(chantierAccess[u.id] === "chef_chantier" || chantierAccess[u.id] === "sous_traitant") && (
                          <button type="button" style={styles.ghostBtn} onClick={() => openAssignments(u)}>
                            <Link2 size={13} /> Affectations
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}><span style={localStyles.activeTag(u.active)}>{u.active ? "Actif" : "Désactivé"}</span></td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        style={styles.ghostBtn}
                        onClick={() => toggleRole(u)}
                        disabled={u.id === currentUser.id}
                        title={u.id === currentUser.id ? "Tu ne peux pas changer ton propre rôle" : "Changer le rôle"}
                      >
                        <ShieldCheck size={13} /> {u.role === "admin" ? "Passer employé" : "Passer admin"}
                      </button>
                      <button
                        type="button"
                        style={styles.ghostBtn}
                        onClick={() => toggleActive(u)}
                        disabled={u.id === currentUser.id}
                        title={u.id === currentUser.id ? "Tu ne peux pas désactiver ton propre compte" : "Activer/désactiver"}
                      >
                        {u.active ? "Désactiver" : "Réactiver"}
                      </button>
                      {resetTargetId === u.id ? (
                        <>
                          <input
                            style={{ ...styles.input, width: 130, padding: "6px 8px" }}
                            placeholder="Nouveau mot de passe"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                          />
                          <button type="button" style={styles.ghostBtn} onClick={() => submitReset(u.id)}>Valider</button>
                          <button type="button" style={styles.ghostBtn} onClick={() => { setResetTargetId(null); setResetPassword(""); }}>Annuler</button>
                        </>
                      ) : (
                        <IconBtn onClick={() => { setResetTargetId(u.id); setResetPassword(""); }} title="Réinitialiser le mot de passe">
                          <KeyRound size={13} />
                        </IconBtn>
                      )}
                      <IconBtn onClick={() => removeUser(u)} danger disabled={u.id === currentUser.id} title="Supprimer le compte">
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {assignUser && (
        <AssignmentsModal
          user={assignUser}
          chantierRole={chantierAccess[assignUser.id]}
          chantiers={chantiersList || []}
          onClose={() => setAssignUser(null)}
        />
      )}
    </div>
  );
}

// Ported from suivi-chantiers-web/src/Users.jsx. Style keys were rewritten to
// this app's modal pattern: modalOverlay -> overlay, modalBox -> modal,
// modalHeader -> modalHead, with the body wrapped in modalBody as this app's
// existing modals do.
function AssignmentsModal({ user, chantierRole, chantiers, onClose }) {
  const [assignments, setAssignments] = useState(null);
  const [lotsByChantier, setLotsByChantier] = useState({});
  const [chantierId, setChantierId] = useState("");
  const [lotId, setLotId] = useState("");
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { assignments } = await api.listAssignments(user.id);
      setAssignments(assignments);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [user.id]);

  async function loadLots(id) {
    if (!id || lotsByChantier[id]) return;
    try {
      const { lots } = await api.getChantier(id);
      setLotsByChantier((prev) => ({ ...prev, [id]: lots }));
    } catch {
      // silencieux : la sélection de lot restera juste vide
    }
  }

  async function add() {
    if (!chantierId) return;
    try {
      await api.addAssignment(user.id, Number(chantierId), lotId ? Number(lotId) : null);
      setLotId("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(assignmentId) {
    try {
      await api.removeAssignment(user.id, assignmentId);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const isSousTraitant = chantierRole === "sous_traitant";
  const lots = lotsByChantier[chantierId] || [];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>Affectations — {user.name}</div>
          <IconBtn onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div style={styles.modalBody}>
          {error && <div style={styles.formError}>{error}</div>}

          <div style={{ ...styles.emptyNote, marginBottom: 12 }}>
            {isSousTraitant
              ? "Ce sous-traitant ne verra que le(s) lot(s) précis sélectionné(s) ci-dessous."
              : "Ce chef de chantier verra l'ensemble du chantier sélectionné (tous ses lots)."}
          </div>

          {assignments === null ? (
            <div style={styles.emptyNote}>Chargement...</div>
          ) : assignments.length === 0 ? (
            <div style={{ ...styles.emptyNote, marginBottom: 12 }}>Aucune affectation pour l'instant.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {assignments.map((a) => (
                <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, background: "var(--surface-2)", padding: "7px 10px", borderRadius: 7 }}>
                  <span>{a.chantier_name}{a.lot_name ? ` — ${a.lot_name}` : " (tout le chantier)"}</span>
                  <IconBtn danger onClick={() => remove(a.id)}><Trash2 size={12} /></IconBtn>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...styles.field, flex: 1, minWidth: 160 }}>
              <span style={styles.fieldLabel}>Chantier</span>
              <select
                style={styles.input}
                value={chantierId}
                onChange={(e) => { setChantierId(e.target.value); setLotId(""); loadLots(e.target.value); }}
              >
                <option value="">Choisir un chantier...</option>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {isSousTraitant && (
              <label style={{ ...styles.field, flex: 1, minWidth: 160 }}>
                <span style={styles.fieldLabel}>Lot</span>
                <select style={styles.input} value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={!chantierId}>
                  <option value="">Choisir un lot...</option>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            <button style={styles.primaryBtn} onClick={add} disabled={!chantierId || (isSousTraitant && !lotId)}>
              <Plus size={14} /> Affecter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
