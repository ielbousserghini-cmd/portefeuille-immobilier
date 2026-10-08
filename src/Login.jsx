import { useState } from "react";
import { Building2, User, Lock, Eye, EyeOff, ArrowRight, Wallet, HardHat, Percent, AlertCircle } from "lucide-react";
import { api } from "./api";
import { useTheme } from "./theme.jsx";

const loginCss = `
.login-screen { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); background: var(--bg); color: var(--text); font-family: var(--font-body); }
.login-hero { position: relative; overflow: hidden; background: #0E1012; color: #ECEAE5; padding: 40px 48px; display: flex; flex-direction: column; justify-content: space-between; isolation: isolate; }
.login-hero::before { content: ""; position: absolute; inset: 0; z-index: -1;
  background-image: linear-gradient(rgba(212,175,106,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,106,0.07) 1px, transparent 1px);
  background-size: 44px 44px; mask-image: radial-gradient(ellipse 80% 70% at 70% 40%, #000 30%, transparent 75%); -webkit-mask-image: radial-gradient(ellipse 80% 70% at 70% 40%, #000 30%, transparent 75%); }
.login-hero::after { content: ""; position: absolute; z-index: -1; width: 620px; height: 620px; right: -180px; top: -160px; border-radius: 50%;
  background: radial-gradient(circle, rgba(212,175,106,0.22), transparent 62%); filter: blur(10px); }
.login-skyline { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; z-index: -1; opacity: 0.75;
  mask-image: linear-gradient(to top, #000 25%, transparent 100%); -webkit-mask-image: linear-gradient(to top, #000 25%, transparent 100%); }
.login-panel { display: flex; align-items: center; justify-content: center; padding: 32px 20px; position: relative; }
.login-form { width: 100%; max-width: 380px; animation: pf-rise .35s var(--ease); }
.login-feature { display: flex; gap: 12px; align-items: flex-start; }
.login-mobile-brand { display: none; }
.login-input-wrap { position: relative; display: flex; align-items: center; }
.login-input-wrap > svg { position: absolute; left: 12px; color: var(--text-faint); pointer-events: none; }
.login-input-wrap:focus-within > svg { color: var(--accent); }
@media (max-width: 900px) {
  .login-screen { grid-template-columns: 1fr; }
  .login-hero { display: none; }
  .login-mobile-brand { display: flex; }
}
`;

const s = {
  heroBrand: { display: "flex", alignItems: "center", gap: 11 },
  brandMark: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(140deg, #E2C17F 0%, #B8904A 55%, #8C6A2B 100%)", color: "#1A150B", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" },
  heroTitle: { fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.035em", margin: "0 0 16px", maxWidth: 480 },
  heroSub: { fontSize: 15, lineHeight: 1.6, color: "#A7ACB2", maxWidth: 440, margin: 0 },
  featureIcon: { width: 32, height: 32, borderRadius: 9, background: "rgba(212,175,106,0.12)", border: "1px solid rgba(212,175,106,0.22)", color: "#D4AF6A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featureTitle: { fontSize: 13.5, fontWeight: 600, color: "#ECEAE5" },
  featureSub: { fontSize: 12.5, color: "#8F959C", marginTop: 2 },
  title: { fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 6px" },
  subtitle: { fontSize: 14, color: "var(--text-dim)", margin: "0 0 28px", lineHeight: 1.5 },
  field: { display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: 500 },
  input: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 40px 11px 38px", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-body)", width: "100%", boxShadow: "var(--shadow-sm)" },
  eyeBtn: { position: "absolute", right: 6, width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  error: { display: "flex", gap: 9, alignItems: "flex-start", background: "var(--bad-dim)", color: "var(--bad-text)", fontSize: 13, lineHeight: 1.45, padding: "10px 12px", borderRadius: 10, marginBottom: 18, animation: "pf-pop .2s var(--ease)" },
  submit: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--primary)", color: "var(--on-primary)", border: "1px solid var(--primary)", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, fontFamily: "var(--font-body)" },
  footNote: { fontSize: 12.5, color: "var(--text-dim)", marginTop: 22, lineHeight: 1.55, textAlign: "center" },
  mobileBrand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 36 },
};

const FEATURES = [
  { icon: Wallet, title: "Suivi des loyers", sub: "Encaissements, impayés, quittances et relances." },
  { icon: HardHat, title: "Suivi des chantiers", sub: "Avancement par lot, planning, budget et photos." },
  { icon: Percent, title: "Fiscalité & rendement", sub: "Rendement par bien et synthèse fiscale annuelle." },
];

// Silhouette d'immeubles stylisée, purement décorative.
function Skyline() {
  const bars = [
    [0, 62, 120], [68, 44, 180], [118, 70, 240], [194, 52, 150], [252, 84, 300],
    [342, 48, 200], [396, 76, 260], [478, 56, 170], [540, 90, 330], [636, 60, 210], [702, 80, 280],
  ];
  return (
    <svg className="login-skyline" viewBox="0 0 782 340" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D4AF6A" stopOpacity="0.16" />
          <stop offset="1" stopColor="#D4AF6A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {bars.map(([x, w, h], i) => (
        <g key={i}>
          <rect x={x} y={340 - h} width={w} height={h} fill="url(#sky-fill)" stroke="rgba(212,175,106,0.28)" strokeWidth="1" />
          {Array.from({ length: Math.floor(h / 26) }).map((_, r) => (
            <line key={r} x1={x + 8} x2={x + w - 8} y1={340 - h + 18 + r * 26} y2={340 - h + 18 + r * 26} stroke="rgba(212,175,106,0.12)" strokeWidth="1" strokeDasharray="4 6" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function Login({ onLogin }) {
  useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-screen">
      <style>{loginCss}</style>

      <aside className="login-hero">
        <div style={s.heroBrand}>
          <div style={s.brandMark}><Building2 size={18} strokeWidth={2} /></div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Extranet</div>
            <div style={{ fontSize: 12, color: "#8F959C" }}>Groupe immobilier</div>
          </div>
        </div>

        <div style={{ marginBottom: "18vh" }}>
          <h1 style={s.heroTitle}>Votre patrimoine, piloté avec précision.</h1>
          <p style={s.heroSub}>
            Un espace unique pour suivre les loyers, l'avancement des chantiers et la performance de chaque bien du portefeuille.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 36 }}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="login-feature">
                  <div style={s.featureIcon}><Icon size={16} strokeWidth={1.75} /></div>
                  <div>
                    <div style={s.featureTitle}>{f.title}</div>
                    <div style={s.featureSub}>{f.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#646A71" }}>© {new Date().getFullYear()} Groupe immobilier · Accès réservé aux collaborateurs</div>
        <Skyline />
      </aside>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mobile-brand" style={s.mobileBrand}>
            <div style={s.brandMark}><Building2 size={18} strokeWidth={2} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Extranet</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Groupe immobilier</div>
            </div>
          </div>
          <h2 style={s.title}>Connexion</h2>
          <p style={s.subtitle}>Connecte-toi pour accéder à ton espace.</p>

          {error && (
            <div style={s.error} role="alert">
              <AlertCircle size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <label style={s.field}>
            <span style={s.fieldLabel}>Identifiant</span>
            <div className="login-input-wrap">
              <User size={16} strokeWidth={1.75} />
              <input
                style={s.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="ton.identifiant"
              />
            </div>
          </label>
          <label style={s.field}>
            <span style={s.fieldLabel}>Mot de passe</span>
            <div className="login-input-wrap">
              <Lock size={16} strokeWidth={1.75} />
              <input
                style={s.input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                style={s.eyeBtn}
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </div>
          </label>

          <button type="submit" style={{ ...s.submit, opacity: loading ? 0.75 : 1 }} disabled={loading}>
            {loading ? (<><span className="spinner" /> Connexion…</>) : (<>Se connecter <ArrowRight size={16} strokeWidth={2} /></>)}
          </button>

          <p style={s.footNote}>
            Pas encore de compte ? Demande à un administrateur de t'en créer un.
          </p>
        </form>
      </section>
    </div>
  );
}
