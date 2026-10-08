import { useState, useMemo } from "react";
import { Building2, Wallet, HardHat, Users as UsersIcon, LogOut, Moon, Sun, ChevronRight } from "lucide-react";
import { fontImport, styles, initials, useTheme } from "./theme.jsx";
import LoyersModule from "./LoyersModule.jsx";
import ChantiersModule from "./ChantiersModule.jsx";
import UsersPage from "./Users.jsx";

// Point d'entrée unique de l'extranet : une seule Sidebar, un seul bouton de
// déconnexion, un seul bloc compte — partagés par les deux modules ("Suivi
// loyers" et "Suivi chantiers") et par la page Utilisateurs.
//
// currentUser.chantierRole et currentUser.loyersAccess sont renvoyés par
// /api/me et /api/login (voir server/routes/auth.js) : ce sont les accès de
// cet utilisateur à chacun des deux modules, résolus côté serveur
// (access.getChantierRole / access.hasLoyersAccess) — tous les deux
// indépendants l'un de l'autre et de currentUser.role (admin/employe global).
// Un admin global a toujours accès aux deux. Un employé peut n'avoir accès
// qu'à un seul des deux modules (par ex. un chef de chantier sans accès
// Loyers), et dans ce cas la section correspondante n'apparaît simplement pas
// dans la Sidebar (pas d'état "accès refusé" affiché).
const SECTION_LABELS = {
  loyers: "Suivi loyers",
  chantiers: "Suivi chantiers",
  utilisateurs: "Utilisateurs",
};

export default function ExtranetShell({ currentUser, onLogout }) {
  const isLoyersAdmin = currentUser.role === "admin";
  const hasLoyersAccess = isLoyersAdmin || Boolean(currentUser.loyersAccess);
  const hasChantiersAccess = Boolean(currentUser.chantierRole);
  const [theme, toggleTheme] = useTheme();

  // Démarre sur le premier module auquel ce compte a effectivement accès,
  // pour ne jamais atterrir sur un écran vide si, par ex., un chef de
  // chantier sans accès Loyers se connecte.
  const defaultSection = useMemo(() => {
    if (hasLoyersAccess) return "loyers";
    if (hasChantiersAccess) return "chantiers";
    if (isLoyersAdmin) return "utilisateurs";
    return "loyers";
  }, [hasLoyersAccess, hasChantiersAccess, isLoyersAdmin]);

  const [section, setSection] = useState(defaultSection);

  return (
    <div className="app-shell" style={styles.app}>
      <style>{fontImport}</style>
      <Sidebar
        section={section}
        setSection={setSection}
        currentUser={currentUser}
        isLoyersAdmin={isLoyersAdmin}
        hasLoyersAccess={hasLoyersAccess}
        hasChantiersAccess={hasChantiersAccess}
        onLogout={onLogout}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <main className="main-content" style={styles.main}>
        <Topbar section={section} />
        {section === "loyers" && hasLoyersAccess && <LoyersModule currentUser={currentUser} />}
        {section === "chantiers" && hasChantiersAccess && <ChantiersModule currentUser={currentUser} />}
        {section === "utilisateurs" && isLoyersAdmin && <UsersPage currentUser={currentUser} />}
      </main>
    </div>
  );
}

function Topbar({ section }) {
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="topbar" style={styles.topbar}>
      <div style={styles.crumbs}>
        <span>Extranet</span>
        <ChevronRight size={14} strokeWidth={1.75} color="var(--text-faint)" />
        <span style={styles.crumbCurrent}>{SECTION_LABELS[section]}</span>
      </div>
      <div style={styles.topbarRight}>
        <span style={{ textTransform: "capitalize" }}>{today}</span>
      </div>
    </div>
  );
}

function Sidebar({ section, setSection, currentUser, isLoyersAdmin, hasLoyersAccess, hasChantiersAccess, onLogout, theme, toggleTheme }) {
  const groups = [
    {
      label: "Modules",
      items: [
        ...(hasLoyersAccess ? [{ id: "loyers", label: SECTION_LABELS.loyers, icon: Wallet }] : []),
        ...(hasChantiersAccess ? [{ id: "chantiers", label: SECTION_LABELS.chantiers, icon: HardHat }] : []),
      ],
    },
    {
      label: "Administration",
      items: isLoyersAdmin ? [{ id: "utilisateurs", label: SECTION_LABELS.utilisateurs, icon: UsersIcon }] : [],
    },
  ].filter((g) => g.items.length);

  return (
    <nav className="sidebar-nav" style={styles.sidebar}>
      <div className="brand-block" style={styles.brand}>
        <div style={styles.brandMark}><Building2 size={17} strokeWidth={2} /></div>
        <div className="brand-text" style={styles.brandText}>
          <div style={styles.brandTitle}>Extranet</div>
          <div style={styles.brandSub}>Groupe immobilier</div>
        </div>
      </div>
      <div className="nav-list" style={styles.navList}>
        {groups.map((g) => (
          <div key={g.label} className="nav-group" style={styles.navGroup}>
            <div className="nav-section-label" style={styles.navSectionLabel}>{g.label}</div>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = section === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => setSection(it.id)}
                  title={it.label}
                  aria-current={active ? "page" : undefined}
                  className={active ? "nav-item is-active" : "nav-item"}
                  style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
                >
                  <Icon size={17} strokeWidth={1.75} color={active ? "var(--accent)" : "currentColor"} />
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="account-block" style={styles.accountBlock}>
        <div className="account-avatar" style={styles.avatar}>{initials(currentUser.name)}</div>
        <div className="account-info" style={styles.accountInfo}>
          <div style={styles.accountName}>{currentUser.name}</div>
          <div style={styles.accountRole}>{isLoyersAdmin ? "Administrateur" : "Employé"}</div>
        </div>
        <button
          className="icon-btn"
          style={{ ...styles.iconBtn, border: "none", background: "transparent" }}
          onClick={toggleTheme}
          title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
          aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
        >
          {theme === "dark" ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
        </button>
        <button
          className="icon-btn icon-btn-danger"
          style={{ ...styles.iconBtn, border: "none", background: "transparent" }}
          onClick={onLogout}
          title="Se déconnecter"
          aria-label="Se déconnecter"
        >
          <LogOut size={15} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
