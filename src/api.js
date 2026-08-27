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

export const api = {
  login: (username, password) => request("POST", "/api/login", { username, password }),
  logout: () => request("POST", "/api/logout"),
  me: () => request("GET", "/api/me"),

  getPortfolio: () => request("GET", "/api/portfolio"),
  savePortfolio: (data) => request("PUT", "/api/portfolio", data),

  listUsers: () => request("GET", "/api/users"),
  createUser: (user) => request("POST", "/api/users", user),
  updateUser: (id, patch) => request("PATCH", `/api/users/${id}`, patch),
  deleteUser: (id) => request("DELETE", `/api/users/${id}`),
};
