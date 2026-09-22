import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import Avatar from "./Avatar";

const adminLinks = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/product-audit", label: "Product Audit" },
  { to: "/admin/settings", label: "Settings" }
];

export default function AdminLayout() {
  const { continueSession, expiryWarning, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionMessage, setSessionMessage] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("adminSidebarCollapsed") === "true");
  const navRef = useRef(null);
  const mainRef = useRef(null);

  async function handleLogout() {
    if (!window.confirm("Log out of the admin portal?")) {
      return;
    }
    await logout();
    navigate("/", { replace: true });
  }

  // focus management for mobile drawer
  useEffect(() => {
    function onKey(e) {
      if (!mobileNavOpen) return;
      if (e.key === "Escape") setMobileNavOpen(false);
      if (e.key === "Tab") {
        const focusable = navRef.current?.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])') || [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    if (mobileNavOpen) {
      const timer = setTimeout(() => { const firstLink = navRef.current?.querySelector('a,button'); firstLink?.focus(); }, 60);
      document.addEventListener('keydown', onKey);
      return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
    }
    return undefined;
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useBodyLock(mobileNavOpen);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem("adminSidebarCollapsed", String(next));
      return next;
    });
  }

  return (
    <div className={`admin-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="admin-header">
        <button
          className="admin-mobile-toggle"
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls="admin-navigation"
          aria-label={mobileNavOpen ? "Close admin navigation menu" : "Open admin navigation menu"}
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          {mobileNavOpen ? "Close" : "Menu"}
        </button>
        <button className="admin-sidebar-toggle" type="button" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-controls="admin-navigation" aria-label={sidebarCollapsed ? "Expand admin navigation" : "Collapse admin navigation"}>
          <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
        </button>
        <NavLink className="logo admin-logo" to="/admin/dashboard">
          <img className="brand-logo" src="/brand/vaishnavi-vs-monogram.png" alt="Vaishnavi Silk Emporium" />
          <span className="brand-copy"><strong>Vaishnavi Silk Emporium</strong><small>Where Tradition Meets Elegance</small></span>
        </NavLink>
        <div className="admin-profile" aria-label="Admin profile">
          <span>Welcome, {user?.displayName || user?.username}</span>
          <Avatar user={user} size="small" />
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <div className="admin-workspace">
        {mobileNavOpen && (
          <button
            type="button"
            className="admin-drawer-backdrop"
            aria-label="Close admin navigation overlay"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <nav
          id="admin-navigation"
          ref={navRef}
          className={`admin-navigation${mobileNavOpen ? " mobile-open" : ""}`}
          aria-label="Admin navigation"
          aria-hidden={false}
        >
          <div className="admin-navigation-header">
            <p className="admin-navigation-eyebrow">Admin Console</p>
            <strong>Manage the storefront</strong>
            <span>Catalog, inventory, orders, and reporting in one place.</span>
          </div>
          {adminLinks.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMobileNavOpen(false)} title={sidebarCollapsed ? link.label : undefined}>
              <span className="admin-nav-icon" aria-hidden="true">{link.label.slice(0, 1)}</span>
              <span className="admin-nav-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <section ref={mainRef} className="admin-content" aria-hidden={mobileNavOpen}>
          {expiryWarning && <section className="session-warning" role="alert"><p>Your secure session will expire soon.</p><button className="btn btn-primary" onClick={async () => { const result = await continueSession(); setSessionMessage(result.success ? "Session extended successfully." : result.message); }}>Continue Session</button></section>}
          {sessionMessage && <p className={sessionMessage.startsWith("Session") ? "success-text" : "error-text"}>{sessionMessage}</p>}
          <Outlet />
        </section>
      </div>
    </div>
  );
}

function useBodyLock(isLocked) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (isLocked) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isLocked]);
}