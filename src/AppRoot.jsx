import { useEffect, useState } from "react";
import { api } from "./api";
import { Building2 } from "lucide-react";
import { fontImport, styles } from "./theme.jsx";
import Login from "./Login.jsx";
import ExtranetShell from "./ExtranetShell.jsx";

const loadingStyle = {
  minHeight: "100vh",
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  color: "var(--text-dim)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
};

export default function AppRoot() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setUser(user);
      } catch {
        setUser(null);
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <>
      <style>{fontImport}</style>
      {!checked ? (
        <div style={loadingStyle}>
          <div style={{ ...styles.brandMark, width: 40, height: 40, borderRadius: 11, animation: "pf-pulse 1.4s ease-in-out infinite" }}>
            <Building2 size={19} strokeWidth={2} />
          </div>
          Chargement…
        </div>
      ) : user ? (
        <ExtranetShell currentUser={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </>
  );
}
