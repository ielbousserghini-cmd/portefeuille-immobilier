const { pool } = require("./db");

// Résout le rôle "Chantiers" d'un utilisateur. Contrairement au module
// suivi-chantiers-web original, ce rôle ne vit plus dans users.role (cette
// colonne ne contient plus que 'admin'/'employe', partagée avec le module
// Loyers) : il vit dans la table module_access, une ligne par utilisateur
// "employe" ayant reçu un accès au module Chantiers.
//
// Un admin global (users.role = 'admin') a toujours un accès admin complet
// au module Chantiers, sans avoir besoin d'une ligne dans module_access.
// Renvoie null si l'utilisateur n'a aucun accès au module.
async function getChantierRole(user) {
  if (user.role === "admin") return "admin"; // admin global = admin chantiers, toujours
  const { rows } = await pool.query(
    "SELECT role FROM module_access WHERE user_id = $1 AND module = 'chantiers'",
    [user.id]
  );
  return rows[0]?.role || null; // null = aucun accès au module Chantiers
}

// Renvoie la liste des chantier_id auxquels un utilisateur a accès.
// admin / direction : tous les chantiers (accès global, direction en lecture seule).
// chef_chantier / sous_traitant : uniquement les chantiers où ils ont une affectation.
// null (pas d'accès au module) : aucun chantier.
async function getAccessibleChantierIds(user) {
  const role = await getChantierRole(user);
  if (role === null) return [];
  if (role === "admin" || role === "direction") {
    const { rows } = await pool.query("SELECT id FROM chantiers");
    return rows.map((r) => r.id);
  }
  const { rows } = await pool.query(
    "SELECT DISTINCT chantier_id FROM assignments WHERE user_id = $1",
    [user.id]
  );
  return rows.map((r) => r.chantier_id);
}

// Renvoie la liste des lot_id auxquels un utilisateur a accès pour un chantier
// donné. null = accès à tous les lots du chantier (admin, direction, chef de
// chantier affecté au chantier entier). [] = aucun accès (y compris pas
// d'accès au module Chantiers du tout).
async function getAccessibleLotIds(user, chantierId) {
  const role = await getChantierRole(user);
  if (role === null) return [];
  if (role === "admin" || role === "direction") return null;

  const { rows } = await pool.query(
    "SELECT lot_id FROM assignments WHERE user_id = $1 AND chantier_id = $2",
    [user.id, chantierId]
  );
  if (rows.length === 0) return []; // pas affecté à ce chantier du tout
  if (rows.some((r) => r.lot_id === null)) return null; // affecté à tout le chantier (chef de chantier)
  return rows.map((r) => r.lot_id); // affecté à des lots précis (sous-traitant)
}

async function canAccessChantier(user, chantierId) {
  const ids = await getAccessibleChantierIds(user);
  return ids.includes(Number(chantierId));
}

// Peut modifier l'avancement / déposer des documents sur ce chantier.
async function canWriteOnChantier(user) {
  const role = await getChantierRole(user);
  return role === "admin" || role === "chef_chantier" || role === "sous_traitant";
}

// Seul admin et chef de chantier peuvent gérer le planning ; sous-traitant en lecture seule.
async function canWritePlanning(user) {
  const role = await getChantierRole(user);
  return role === "admin" || role === "chef_chantier";
}

// Seul admin peut créer/modifier le budget ; direction et chef de chantier le consultent.
async function canWriteBudget(user) {
  const role = await getChantierRole(user);
  return role === "admin";
}

async function canSeeBudget(user) {
  const role = await getChantierRole(user);
  return role !== null && role !== "sous_traitant";
}

module.exports = {
  getChantierRole,
  getAccessibleChantierIds,
  getAccessibleLotIds,
  canAccessChantier,
  canWriteOnChantier,
  canWritePlanning,
  canWriteBudget,
  canSeeBudget,
};
