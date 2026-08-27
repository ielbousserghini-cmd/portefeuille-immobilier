import { useState } from "react";
import { api } from "./api";

const styles = {
  screen: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    padding: 16,
  },
  card: {
    width: 360,
    maxWidth: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "32px 28px",
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 9,
    background: "var(--accent)",
    color: "#14171B",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 16,
    marginBottom: 18,
  },
  title: { fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, marginBottom: 4 },
  subtitle: { fontSize: 13, color: "var(--text-dim)", marginBottom: 22 },
  field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: "var(--text-dim)" },
  input: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 11px",
    color: "var(--text)",
    fontSize: 13.5,
    fontFamily: "var(--font-body)",
    width: "100%",
  },
  error: {
    background: "var(--bad-dim)",
    color: "#F3E4DE",
    fontSize: 12.5,
    padding: "8px 10px",
    borderRadius: 6,
    marginBottom: 14,
  },
  submit: {
    width: "100%",
    background: "var(--accent)",
    color: "#14171B",
    border: "none",
    borderRadius: 8,
    padding: "11px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
  },
};

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Renseigne ton identifiant et ton mot de passe.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user } = await api.login(username.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.screen}>
      <form style={styles.card} onSubmit={submit}>
        <div style={styles.brandMark}>PF</div>
        <div style={styles.title}>Portefeuille</div>
        <div style={styles.subtitle}>Connecte-toi pour accéder à la gestion locative.</div>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.field}>
          <span style={styles.fieldLabel}>Identifiant</span>
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Mot de passe</span>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button type="submit" style={{ ...styles.submit, opacity: loading ? 0.7 : 1 }} disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
