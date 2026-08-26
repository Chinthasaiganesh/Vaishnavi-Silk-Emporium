import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../AuthContext";
import Avatar from "./Avatar";

const adminLinks = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/settings", label: "Settings" }
];

export default function AdminLayout() {
  const { continueSession, expiryWarning, user, logout } = useAuth();
  const navigate = useNavigate();
  const [sessionMessage, setSessionMessage] = useState("");

  async function handleLogout() {
    if (!window.confirm("Log out of the admin portal?")) {
      return;
    }
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <NavLink className="logo admin-logo" to="/admin/dashboard">
          <img className="brand-logo" src="/brand/vaishnavi-vs-monogram.png" alt="Vaishnavi Silk Emporium" />
          <span className="brand-copy"><strong>Vaishnavi Silk Emporium</strong><small>Store Management</small></span>
        </NavLink>
        <div className="admin-profile" aria-label="Admin profile">
          <span>Welcome, {user?.displayName || user?.username}</span>
          <Avatar user={user} size="small" />
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <div className="admin-workspace">
        <nav className="admin-navigation" aria-label="Admin navigation">
          {adminLinks.map((link) => (
            <NavLink key={link.to} to={link.to}>{link.label}</NavLink>
          ))}
        </nav>
        <section className="admin-content">
          {expiryWarning && <section className="session-warning" role="alert"><p>Your secure session will expire soon.</p><button className="btn btn-primary" onClick={async () => { const result = await continueSession(); setSessionMessage(result.success ? "Session extended successfully." : result.message); }}>Continue Session</button></section>}
          {sessionMessage && <p className={sessionMessage.startsWith("Session") ? "success-text" : "error-text"}>{sessionMessage}</p>}
          <Outlet />
        </section>
      </div>
    </div>
  );
}