const accessTokenKey = "auth_access_token";
const userKey = "auth_user";
const persistenceKey = "auth_persistent";
const sessionEventKey = "admin_session_event";

export function getAdminToken() {
  return sessionStorage.getItem(accessTokenKey) || localStorage.getItem(accessTokenKey);
}

export function getStoredAdminUser() {
  const serializedUser = sessionStorage.getItem(userKey) || localStorage.getItem(userKey);
  return serializedUser ? JSON.parse(serializedUser) : null;
}

export function isPersistentSession() {
  return localStorage.getItem(persistenceKey) === "true";
}

export function setAdminSession(token, user, { persistent = isPersistentSession() } = {}) {
  const storage = persistent ? localStorage : sessionStorage;
  const otherStorage = persistent ? sessionStorage : localStorage;
  storage.setItem(accessTokenKey, token);
  storage.setItem(userKey, JSON.stringify(user));
  otherStorage.removeItem(accessTokenKey);
  otherStorage.removeItem(userKey);
  if (persistent) localStorage.setItem(persistenceKey, "true");
  else localStorage.removeItem(persistenceKey);
  localStorage.setItem(sessionEventKey, JSON.stringify({ type: "login", at: Date.now() }));
}

export function clearAdminSession({ broadcast = true } = {}) {
  sessionStorage.removeItem(accessTokenKey);
  sessionStorage.removeItem(userKey);
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(userKey);
  localStorage.removeItem(persistenceKey);
  if (broadcast) {
    localStorage.setItem(sessionEventKey, JSON.stringify({ type: "logout", at: Date.now() }));
  }
}

export function broadcastProfileUpdate() {
  localStorage.setItem(sessionEventKey, JSON.stringify({ type: "profile", at: Date.now() }));
}

export function getAdminSessionEventType(event) {
  return event.key === sessionEventKey ? JSON.parse(event.newValue || "{}").type : null;
}
