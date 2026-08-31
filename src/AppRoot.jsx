import { useEffect, useState } from "react";
import { api } from "./api";
import { fontImport } from "./theme.jsx";
import Login from "./Login.jsx";
import ExtranetShell from "./ExtranetShell.jsx";

const loadingStyle = {
  minHeight: "100vh",
  background: "var(--bg, #14171B)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#8B9096",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
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
        <div style={loadingStyle}>Chargement…</div>
      ) : user ? (
        <ExtranetShell currentUser={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </>
  );
}
