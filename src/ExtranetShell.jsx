import { useState } from "react";
import { Building2, Wallet, HardHat, Users as UsersIcon, LogOut } from "lucide-react";
import { fontImport, styles } from "./theme.jsx";
import LoyersModule from "./LoyersModule.jsx";
import ChantiersModule from "./ChantiersModule.jsx";
import UsersPage from "./Users.jsx";

// Point d'entrée unique de l'extranet : une seule Sidebar, un seul bouton de
// déconnexion, un seul bloc compte — partagés par les deux modules ("Suivi
// loyers" et "Suivi chantiers") et par la page Utilisateurs.
//
// currentUser.chantierRole est renvoyé par /api/me et /api/login (voir
// server/routes/auth.js) : c'est le rôle de cet utilisateur au sein du module
// Chantiers (admin/direction/chef_chantier/sous_traitant), résolu côté
// serveur via access.getChantierRole — indépendamment de currentUser.role qui
// reste le rôle global Loyers (admin/employe). Un admin global a toujours
// chantierRole === "admin". Un employé sans accès a chantierRole === null,
// et dans ce cas la section "Suivi chantiers" n'apparaît simplement pas dans
// la Sidebar (pas d'état "accès refusé" affiché, cohérent avec la façon dont
// les restrictions du module Loyers sont déjà invisibles pour un employé).
export default function ExtranetShell({ currentUser, onLogout }) {
  const isLoyersAdmin = currentUser.role === "admin";
  const hasChantiersAccess = Boolean(currentUser.chantierRole);

  const [section, setSection] = useState("loyers");

  return (
    <div className="app-shell" style={styles.app}>
      <style>{fontImport}</style>
      <Sidebar
        section={section}
        setSection={setSection}
        currentUser={currentUser}
        isLoyersAdmin={isLoyersAdmin}
        hasChantiersAccess={hasChantiersAccess}
        onLogout={onLogout}
      />
      <main className="main-content" style={styles.main}>
        {section === "loyers" && <LoyersModule currentUser={currentUser} />}
        {section === "chantiers" && hasChantiersAccess && <ChantiersModule currentUser={currentUser} />}
        {section === "utilisateurs" && isLoyersAdmin && <UsersPage currentUser={currentUser} />}
      </main>
    </div>
  );
}

function Sidebar({ section, setSection, currentUser, isLoyersAdmin, hasChantiersAccess, onLogout }) {
  const items = [
    { id: "loyers", label: "Suivi loyers", icon: Wallet },
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
