import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";

export default function AdminSettingsPage() {
  const { user, updateCurrentUser } = useAuth();
  const [store, setStore] = useState({ storeName: "", tagline: "", email: "", phone: "", address: "", businessDescription: "", language: user?.preferences?.language || "English", theme: user?.preferences?.darkMode ? "Dark" : "Light", inventoryAlerts: true });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/settings/store").then((response) => {
      const settings = response.data.settings;
      setStore((current) => ({ ...current, ...settings }));
    }).catch((requestError) => setError(requestError.response?.data?.message || "Unable to load store settings.")).finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const response = await api.put("/settings/store", { storeName: store.storeName, tagline: store.tagline, email: store.email, phone: store.phone, address: store.address, businessDescription: store.businessDescription });
      setStore((current) => ({ ...current, ...response.data.settings }));
      const preferences = { ...(user.preferences || {}), language: store.language, darkMode: store.theme === "Dark", inventoryAlerts: store.inventoryAlerts };
      updateCurrentUser({ ...user, preferences });
      setMessage(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.errors?.[0]?.message || requestError.response?.data?.message || "Unable to save store settings.");
    }
  }

  if (loading) return <main className="container section">Loading store settings...</main>;
  return <main className="container section admin-layout"><div className="admin-head"><div><p className="eyebrow">Configuration</p><h1>Admin Settings</h1></div></div><form className="admin-form" onSubmit={save}><h2>Store Information</h2><div className="form-grid"><input value={store.storeName} onChange={(event) => setStore({ ...store, storeName: event.target.value })} placeholder="Store Name" required /><input value={store.tagline} onChange={(event) => setStore({ ...store, tagline: event.target.value })} placeholder="Tagline" required /><input type="email" value={store.email} onChange={(event) => setStore({ ...store, email: event.target.value })} placeholder="Store Email" required /><input value={store.phone} onChange={(event) => setStore({ ...store, phone: event.target.value })} placeholder="Contact Number" required /></div><textarea value={store.address} onChange={(event) => setStore({ ...store, address: event.target.value })} placeholder="Store Address" required /><textarea value={store.businessDescription} onChange={(event) => setStore({ ...store, businessDescription: event.target.value })} placeholder="Business Description" /><h2>Preferences</h2><div className="form-grid"><select value={store.language} onChange={(event) => setStore({ ...store, language: event.target.value })}><option>English</option><option>Telugu</option></select><select value={store.theme} onChange={(event) => setStore({ ...store, theme: event.target.value })}><option>Light</option><option>Dark</option></select></div><label className="checkbox-line"><input type="checkbox" checked={store.inventoryAlerts} onChange={(event) => setStore({ ...store, inventoryAlerts: event.target.checked })} />Receive inventory and product availability alerts</label><div className="form-actions"><button className="btn btn-primary">Save Changes</button></div>{message && <p className="success-text">{message}</p>}{error && <p className="error-text">{error}</p>}</form></main>;
}