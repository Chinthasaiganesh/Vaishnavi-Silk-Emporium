import { createContext, useCallback, useContext, useMemo, useState } from "react";
import NotificationModal from "./components/NotificationModal";

const NotifierContext = createContext(null);

export function useNotifier() {
  const context = useContext(NotifierContext);
  if (!context) throw new Error("useNotifier must be used within NotifierProvider.");
  return context;
}

export function NotifierProvider({ children }) {
  const [queue, setQueue] = useState([]);

  const dismiss = useCallback((id) => setQueue((current) => current.filter((item) => item.id !== id)), []);

  const notify = useCallback((options) => {
    const id = options.id || crypto.randomUUID();
    setQueue((current) => (current.some((item) => item.id === id) ? current : [...current, { ...options, id }]));
    return id;
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setQueue((current) => [...current, { variant: "warning", icon: "alert", ...options, id: crypto.randomUUID(), resolve, dismissible: false }]);
  }), []);

  const value = useMemo(() => ({ notify, confirm, dismiss }), [notify, confirm, dismiss]);

  return (
    <NotifierContext.Provider value={value}>
      {children}
      <NotificationModal notification={queue[0] || null} onClose={dismiss} />
    </NotifierContext.Provider>
  );
}
