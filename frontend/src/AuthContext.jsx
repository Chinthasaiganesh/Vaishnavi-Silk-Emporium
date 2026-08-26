import { createContext, useContext, useEffect, useState } from "react";
import { api, extendAdminSession, restoreAdminSession } from "./api";
import { broadcastProfileUpdate, clearAdminSession, getAdminToken, getAdminSessionEventType, getStoredAdminUser, setAdminSession } from "./auth";

const AuthContext = createContext(null);

function tokenExpiresAt(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000;
  } catch {
    return 0;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredAdminUser());
  const [checking, setChecking] = useState(true);
  const [expiryWarning, setExpiryWarning] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  async function restore() {
    setChecking(true);
    try {
      const restoredUser = await restoreAdminSession();
      setUser(restoredUser);
      return restoredUser;
    } catch (error) {
      if ([401, 403].includes(error.response?.status)) {
        clearAdminSession({ broadcast: false });
        setUser(null);
      }
      return null;
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    restore();

    const handleExpiredSession = () => {
      clearAdminSession();
      setUser(null);
    };
    const handleStorage = (event) => {
      const eventType = getAdminSessionEventType(event);
      if (eventType === "logout") {
        clearAdminSession({ broadcast: false });
        setUser(null);
      }
      if (eventType === "profile") {
        restore();
      }
    };

    window.addEventListener("admin-session-expired", handleExpiredSession);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("admin-session-expired", handleExpiredSession);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    const expiresAt = tokenExpiresAt(token);
    if (!token || !expiresAt) {
      return undefined;
    }

    const delay = Math.max(expiresAt - Date.now() - 2 * 60 * 1000, 0);
    const warningTimer = window.setTimeout(() => setExpiryWarning(true), delay);
    return () => window.clearTimeout(warningTimer);
  }, [user, sessionVersion]);

  async function login(identifier, password, rememberMe) {
    const response = await api.post("/auth/login", { identifier, password, rememberMe });
    setAdminSession(response.data.token, response.data.user, { persistent: rememberMe });
    setExpiryWarning(false);
    setUser(response.data.user);
    return response.data.user;
  }

  async function register(details) {
    const response = await api.post("/auth/register", details);
    setAdminSession(response.data.token, response.data.user, { persistent: true });
    setUser(response.data.user);
    return response.data.user;
  }

  async function continueSession() {
    try {
      const refreshedUser = await extendAdminSession();
      setUser(refreshedUser);
      setExpiryWarning(false);
      setSessionVersion((version) => version + 1);
      return { success: true };
    } catch (error) {
      if ([401, 403].includes(error.response?.status)) {
        clearAdminSession();
        setUser(null);
      }
      return { success: false, message: "Unable to extend session. Please sign in again." };
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout", {}, { _skipAuthRefresh: true });
    } finally {
      clearAdminSession();
      setExpiryWarning(false);
      setUser(null);
    }
  }

  function updateCurrentUser(updatedUser) {
    setAdminSession(getAdminToken(), updatedUser);
    setUser(updatedUser);
    broadcastProfileUpdate();
  }

  return (
    <AuthContext.Provider value={{ user, checking, expiryWarning, setExpiryWarning, login, register, logout, restore, continueSession, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return auth;
}