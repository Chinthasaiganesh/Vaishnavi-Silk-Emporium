import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function SecurityPage() {
  const { checking, user } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [notice, setNotice] = useState("");
  if (checking) return <main className="container section">Restoring your session...</main>;
  if (user?.role !== "USER") return <Navigate to="/" replace />;
  const strength = form.newPassword.length >= 14 ? "Strong" : form.newPassword.length >= 10 ? "Good" : "Use 10+ characters";
  async function submit(event) { event.preventDefault(); setNotice(""); try { const response = await api.put("/auth/password", form); setNotice(response.data.message); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); } catch (error) { setNotice(error.response?.data?.errors?.[0]?.message || error.response?.data?.message || "Unable to update password."); } }
  return <main className="container section settings-page"><h1>Change Password</h1><form className="profile-card security-form" onSubmit={submit}><label>Current Password<input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label><label>New Password<input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} minLength={10} required /></label><p className="password-strength">Password strength: <strong>{strength}</strong></p><label>Confirm New Password<input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} minLength={10} required /></label><div className="form-actions"><button className="btn btn-primary" type="submit">Update Password</button><button className="btn btn-outline" type="button" onClick={() => setForm({ currentPassword: "", newPassword: "", confirmPassword: "" })}>Reset Form</button></div>{notice && <p className="success-text">{notice}</p>}</form></main>;
}