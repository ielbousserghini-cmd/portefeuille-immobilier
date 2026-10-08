// Petit client HTTP pour parler au backend. `credentials: "include"` est
// indispensable : c'est ce qui fait que le navigateur envoie/reçoit le cookie
// de session sur chaque requête.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Réponse sans corps JSON (rare, ex. erreur réseau brute) : on laisse
    // data à null, le message générique ci-dessous prendra le relais.
  }

  if (!res.ok) {
    const message = data?.error || `Erreur ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Variante pour l'envoi de fichiers (import Excel IA, analyse de contrat) :
// pas de Content-Type manuel, le navigateur gère le boundary multipart.
async function uploadRequest(url, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, { method: "POST", credentials: "include", body: formData });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // idem request() ci-dessus
  }

  if (!res.ok) {
    const message = data?.error || `Erreur ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (username, password) => request("POST", "/api/login", { username, password }),
  logout: () => request("POST", "/api/logout"),
  me: () => request("GET", "/api/me"),

  getPortfolio: () => request("GET", "/api/portfolio"),
  savePortfolio: (data) => request("PUT", "/api/portfolio", data),
  // entries: [{ unitId, period: "YYYY-MM", paid: true|false, amount }]
  setPayments: (entries) => request("POST", "/api/portfolio/payments", { entries }),

  listUsers: () => request("GET", "/api/users"),
  createUser: (user) => request("POST", "/api/users", user),
  updateUser: (id, patch) => request("PATCH", `/api/users/${id}`, patch),
  deleteUser: (id) => request("DELETE", `/api/users/${id}`),

  // --- Accès au module Chantiers (admin global uniquement) ---
  getModuleAccess: (userId) => request("GET", `/api/users/${userId}/module-access`),
  setModuleAccess: (userId, module, role) => request("PUT", `/api/users/${userId}/module-access`, { module, role }),

  // --- Affectations (quel utilisateur voit quel chantier/lot) ---
  listAssignments: (userId) => request("GET", `/api/users/${userId}/assignments`),
  addAssignment: (userId, chantierId, lotId) => request("POST", `/api/users/${userId}/assignments`, { chantierId, lotId }),
  removeAssignment: (userId, assignmentId) => request("DELETE", `/api/users/${userId}/assignments/${assignmentId}`),

  // --- Module Suivi chantiers ---
  listChantiers: () => request("GET", "/api/chantiers"),
  createChantier: (data) => request("POST", "/api/chantiers", data),
  getChantier: (id) => request("GET", `/api/chantiers/${id}`),
  updateChantier: (id, patch) => request("PATCH", `/api/chantiers/${id}`, patch),
  deleteChantier: (id) => request("DELETE", `/api/chantiers/${id}`),

  addLot: (chantierId, data) => request("POST", `/api/chantiers/${chantierId}/lots`, data),
  updateLot: (lotId, patch) => request("PATCH", `/api/chantiers/lots/${lotId}`, patch),
  deleteLot: (lotId) => request("DELETE", `/api/chantiers/lots/${lotId}`),

  listAvancement: (lotId) => request("GET", `/api/lots/${lotId}/avancement`),
  addAvancement: (lotId, data) => request("POST", `/api/lots/${lotId}/avancement`, data),

  listBudget: (chantierId) => request("GET", `/api/chantiers/${chantierId}/budget`),
  addBudgetLine: (chantierId, data) => request("POST", `/api/chantiers/${chantierId}/budget`, data),
  updateBudgetLine: (lineId, patch) => request("PATCH", `/api/budget/${lineId}`, patch),
  deleteBudgetLine: (lineId) => request("DELETE", `/api/budget/${lineId}`),

  listPlanning: (chantierId) => request("GET", `/api/chantiers/${chantierId}/planning`),
  addPlanningTask: (chantierId, data) => request("POST", `/api/chantiers/${chantierId}/planning`, data),
  updatePlanningTask: (taskId, patch) => request("PATCH", `/api/planning/${taskId}`, patch),
  deletePlanningTask: (taskId) => request("DELETE", `/api/planning/${taskId}`),

  listDocuments: (chantierId) => request("GET", `/api/chantiers/${chantierId}/documents`),
  signDocumentUpload: (chantierId, lotId, extension) => request("POST", `/api/chantiers/${chantierId}/documents/signature`, { lotId: lotId || null, extension }),
  addDocument: (data) => request("POST", "/api/documents", data),
  deleteDocument: (docId) => request("DELETE", `/api/documents/${docId}`),

  // --- Fonctionnalités IA (module Loyers) ---
  // withProperty : l'IA déduit aussi le bien (nom, ville, adresse, type).
  aiFileImport: (file, { withProperty = false } = {}) =>
    uploadRequest(`/api/ai/file-import${withProperty ? "?withProperty=1" : ""}`, file),
  aiContractAnalyze: (file) => uploadRequest("/api/ai/contract-analyze", file),
  checkAlertsNow: () => request("POST", "/api/alerts/check-now"),

  // --- Assistant (agents) et notifications push ---
  assistantInsights: () => request("GET", "/api/assistant/insights"),
  assistantRunNow: () => request("POST", "/api/assistant/run-daily?force=1"),
  assistantReports: () => request("GET", "/api/assistant/reports"),
  emailSettings: () => request("GET", "/api/assistant/email-settings"),
  saveEmailSettings: (settings) => request("PUT", "/api/assistant/email-settings", settings),
  sendEmailReport: () => request("POST", "/api/assistant/email-send"),
  pushPublicKey: () => request("GET", "/api/push/public-key"),
  pushSubscribe: (subscription) => request("POST", "/api/push/subscribe", { subscription }),
  pushStatus: (endpoint) => request("POST", "/api/push/status", { endpoint }),
  pushPrefs: (endpoint, prefs) => request("PUT", "/api/push/prefs", { endpoint, prefs }),
  pushUnsubscribe: (endpoint) => request("POST", "/api/push/unsubscribe", { endpoint }),
  pushTest: () => request("POST", "/api/push/test"),
};
