import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, KeyRound } from "lucide-react";
import { api } from "./api";
import { styles, IconBtn } from "./theme.jsx";

const localStyles = {
  roleTag: (role) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    fontWeight: 600,
    color: role === "admin" ? "#14171B" : "var(--text)",
    background: role === "admin" ? "var(--accent)" : "var(--surface-2)",
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

  async function load() {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
    if (!resetPassword || resetPassword.length < 6) {
      setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
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
              placeholder="6 caractères min."
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
    </div>
  );
}
