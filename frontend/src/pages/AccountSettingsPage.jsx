import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import Avatar from "../components/Avatar";
import { useTheme } from "../ThemeContext";
import { useLanguage } from "../LanguageContext";

function settingsFromUser(user) {
  const preferences = user?.preferences || {};
  return {
    fullName: user?.fullName || "",
    displayName: user?.displayName || user?.fullName || user?.username || "",
    email: user?.email || "",
    mobileNumber: user?.mobileNumber || "",
    avatar: null,
    removeAvatar: false,
    darkMode: Boolean(preferences.darkMode),
    emailNotifications: preferences.emailNotifications ?? true,
    recommendations: preferences.recommendations ?? true,
    language: preferences.language || "English"
  };
}

export default function AccountSettingsPage() {
  const { checking, updateCurrentUser, user } = useAuth();
  const [form, setForm] = useState(settingsFromUser(null));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const { setTheme } = useTheme();
  const { setLanguage } = useLanguage();

  useEffect(() => {
    if (user) {
      setForm(settingsFromUser(user));
    }
  }, [user]);

  if (checking) return <main className="container section">Restoring your session...</main>;
  if (user?.role !== "USER") return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const payload = new FormData();
    ["fullName", "displayName", "email", "mobileNumber"].forEach((field) => payload.append(field, form[field]));
    payload.append("removeAvatar", String(form.removeAvatar));
    payload.append("preferences", JSON.stringify({ darkMode: form.darkMode, emailNotifications: form.emailNotifications, recommendations: form.recommendations, language: form.language }));
    if (form.avatar) payload.append("avatar", form.avatar);
    try {
      const response = await api.put("/auth/settings", payload);
      updateCurrentUser(response.data.user);
      setTheme(response.data.user.preferences?.darkMode ? "dark" : "light");
      setLanguage(response.data.user.preferences?.language === "Telugu" ? "te" : "en");
      setNotice(response.data.user.preferences?.darkMode ? "Dark Mode enabled successfully." : "Account settings saved.");
    } catch (error) {
      setError(error.response?.data?.errors?.[0]?.message || error.response?.data?.message || "Unable to save settings.");
    }
  }

  async function selectAvatar(file) {
    setError("");
    setPreviewUrl("");
    if (!file) {
      setForm({ ...form, avatar: null });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, JPEG, and WEBP formats are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5 MB limit.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (image.width < 100 || image.height < 100) {
        setError("Image dimensions must be at least 100 x 100 pixels.");
        return;
      }
      setPreviewUrl(URL.createObjectURL(file));
      setForm({ ...form, avatar: file, removeAvatar: false });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("Profile image could not be loaded.");
    };
    image.src = objectUrl;
  }

  function cancelChanges() {
    setForm(settingsFromUser(user));
    setPreviewUrl("");
    setNotice("");
    setError("");
    setTheme(user.preferences?.darkMode ? "dark" : "light");
  }

  return <main className="container section settings-page"><h1>Account Settings</h1><form className="profile-card settings-form" onSubmit={submit}>
    <label>Display Name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
    <label>Full Name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
    <label>Email Address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
    <label>Mobile Number<input value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} /></label>
    <div className="avatar-upload-preview">{previewUrl ? <img className="avatar avatar-large" src={previewUrl} alt="Selected profile preview" onError={() => setError("Profile image could not be loaded.")} /> : <Avatar user={user} size="large" />}<span>JPG, PNG, or WEBP. Maximum 5 MB. Minimum 100 x 100 pixels.</span></div>
    <label>Profile Picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => selectAvatar(e.target.files?.[0])} /></label>
    {user.avatarUrl && <label className="checkbox-line"><input type="checkbox" checked={form.removeAvatar} onChange={(e) => { setForm({ ...form, removeAvatar: e.target.checked, avatar: null }); setPreviewUrl(""); }} />Remove profile picture</label>}
    <fieldset><legend>Preferences</legend><label className="checkbox-line"><input type="checkbox" checked={form.darkMode} onChange={(e) => { const darkMode = e.target.checked; setForm({ ...form, darkMode }); setTheme(darkMode ? "dark" : "light"); }} />Dark mode</label><label className="checkbox-line"><input type="checkbox" checked={form.emailNotifications} onChange={(e) => setForm({ ...form, emailNotifications: e.target.checked })} />Email notifications</label><label className="checkbox-line"><input type="checkbox" checked={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.checked })} />Product recommendations</label><label>Language<select value={form.language} onChange={(e) => { const language = e.target.value; setForm({ ...form, language }); setLanguage(language === "Telugu" ? "te" : "en"); }}><option>English</option><option>Telugu</option></select></label></fieldset>
    <div className="form-actions"><button className="btn btn-primary" type="submit">Save Changes</button><button className="btn btn-outline" type="button" onClick={cancelChanges}>Cancel Changes</button></div>{notice && <p className="success-text">{notice}</p>}{error && <p className="error-text" role="alert">{error}</p>}
  </form></main>;
}