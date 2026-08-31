import { useState, useMemo } from "react";
import { Building2, Wallet, HardHat, Users as UsersIcon, LogOut } from "lucide-react";
import { fontImport, styles } from "./theme.jsx";
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
export default function ExtranetShell({ currentUser, onLogout }) {
  const isLoyersAdmin = currentUser.role === "admin";
  const hasLoyersAccess = isLoyersAdmin || Boolean(currentUser.loyersAccess);
  const hasChantiersAccess = Boolean(currentUser.chantierRole);

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
      />
      <main className="main-content" style={styles.main}>
        {section === "loyers" && hasLoyersAccess && <LoyersModule currentUser={currentUser} />}
        {section === "chantiers" && hasChantiersAccess && <ChantiersModule currentUser={currentUser} />}
        {section === "utilisateurs" && isLoyersAdmin && <UsersPage currentUser={currentUser} />}
      </main>
    </div>
  );
}

function Sidebar({ section, setSection, currentUser, isLoyersAdmin, hasLoyersAccess, hasChantiersAccess, onLogout }) {
  const items = [
    ...(hasLoyersAccess ? [{ id: "loyers", label: "Suivi loyers", icon: Wallet }] : []),
    ...(hasChantiersAccess ? [{ id: "chantiers", label: "Suivi chantiers", icon: HardHat }] : []),
    ...(isLoyersAdmin ? [{ id: "utilisateurs", label: "Utilisateurs", icon: UsersIcon }] : []),
  ];

  return (
    <nav className="sidebar-nav" style={styles.sidebar}>
      <div className="brand-block" style={styles.brand}>
        <div style={styles.brandMark}><Building2 size={17} strokeWidth={1.9} /></div>
        <div style={styles.brandText}>
          <div style={styles.brandTitle}>Extranet</div>
          <div style={styles.brandSub}>Groupe immobilier</div>
        </div>
      </div>
      <div className="nav-list" style={styles.navList}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = section === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setSection(it.id)}
              title={it.label}
              style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
            >
              <Icon size={17} strokeWidth={1.75} />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
      <div className="account-block" style={styles.accountBlock}>
        <div style={styles.accountInfo}>
          <div style={styles.accountName}>{currentUser.name}</div>
          <div style={styles.accountRole}>{isLoyersAdmin ? "Administrateur" : "Employé"}</div>
        </div>
        <button style={styles.backupBtn} onClick={onLogout} title="Se déconnecter">
          <LogOut size={15} strokeWidth={1.75} />
          <span>Déconnexion</span>
        </button>
      </div>
    </nav>
  );
}
