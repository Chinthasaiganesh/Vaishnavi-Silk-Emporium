import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import Avatar from "./Avatar";
import { api } from "../api";
import { useLanguage } from "../LanguageContext";
import { useCart } from "../CartContext";

export default function Header() {
  const navigate = useNavigate();
  const { checking, logout, user } = useAuth();
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const displayName = user?.displayName || user?.fullName || user?.username;
  const { language, setLanguage, t } = useLanguage();
  const { cartCount } = useCart();
  const [previousCartCount, setPreviousCartCount] = useState(cartCount);
  const [cartBump, setCartBump] = useState(false);

  useEffect(() => {
    if (cartCount !== previousCartCount) {
      setCartBump(true);
      const timer = window.setTimeout(() => setCartBump(false), 500);
      setPreviousCartCount(cartCount);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [cartCount, previousCartCount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  useEffect(() => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get("/products/public", { params: { q: term } });
        if (active) setSuggestions((response.data.products || []).slice(0, 5));
      } catch {
        if (active) setSuggestions([]);
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [term]);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  useEffect(() => {
    if (user?.role !== "USER") return undefined;
    let active = true;
    async function loadNotificationCount() {
      try {
        const response = await api.get("/notifications");
        if (active) setUnreadNotifications(response.data.unreadCount || 0);
      } catch {
        if (active) setUnreadNotifications(0);
      }
    }
    loadNotificationCount();
    const interval = window.setInterval(loadNotificationCount, 5000);
    function handleNotificationChange(event) {
      if (typeof event.detail?.unreadCount === "number") setUnreadNotifications(event.detail.unreadCount);
      else loadNotificationCount();
    }
    window.addEventListener("notifications:changed", handleNotificationChange);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("notifications:changed", handleNotificationChange); };
  }, [user]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo" to="/">
          <img className="brand-logo" src="/brand/vaishnavi-vs-monogram.png" alt="Vaishnavi Silk Emporium" />
          <span className="brand-copy"><strong>Vaishnavi Silk Emporium</strong><small>Where Tradition Meets Elegance</small></span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/" end>{t("home")}</NavLink>
          <NavLink to="/collections" end>Collections</NavLink>
          <NavLink to="/categories" end>Categories</NavLink>
        </nav>

        <div className="header-actions">
          <form className="header-search" onSubmit={handleSubmit}>
            <input
              type="search"
              placeholder="Search for Silk Sarees, Banarasi, Kanchipuram, Bridal Collections..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search sarees by fabric, colour, occasion, or collection"
            />
            {suggestions.length > 0 && <div className="search-suggestions">{suggestions.map((product) => <Link key={product.productId} to={`/products/${product.productId}`} onClick={() => { setTerm(""); setSuggestions([]); }}><img src={resolveImage(product.imageUrl)} alt="" /><span><strong>{product.productName}</strong><small>{product.category} | {product.fabric}</small></span></Link>)}</div>}
          </form>
          <label className="language-select" aria-label={t("language")}>
            <span>Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">{t("english")}</option>
              <option value="te">{t("telugu")}</option>
            </select>
          </label>
          <Link className={`cart-link${cartBump ? " cart-link-bump" : ""}`} to="/cart" aria-label={`Cart with ${cartCount} items`}><span aria-hidden="true">Cart</span>{cartCount > 0 && <strong>{cartCount}</strong>}</Link>
          {!checking && !user && (
            <Link className="btn btn-outline" to="/login">{t("signIn")}</Link>
          )}
          {!checking && user?.role === "USER" && (
            <div className="account-menu">
              <Link className="notification-bell" to="/notifications" aria-label={t("notifications")}>Bell{unreadNotifications > 0 && <span>{unreadNotifications}</span>}</Link>
              <button
                className="account-trigger"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <Avatar user={user} size="small" />
                <span>{displayName}</span>
              </button>
              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-dropdown-user">
                    <Avatar user={user} />
                    <span>{displayName}</span>
                  </div>
                  <Link to="/profile" onClick={() => setProfileOpen(false)}>{t("profile")}</Link>
                  <Link to="/orders" onClick={() => setProfileOpen(false)}>My Orders</Link>
                  <Link to="/wishlist" onClick={() => setProfileOpen(false)}>{t("wishlist")}</Link>
                  <Link to="/notifications" onClick={() => setProfileOpen(false)}>{t("notifications")}</Link>
                  <Link to="/settings/account" onClick={() => setProfileOpen(false)}>{t("settings")}</Link>
                  <Link to="/settings/security" onClick={() => setProfileOpen(false)}>{t("password")}</Link>
                  <button onClick={handleLogout}>{t("logout")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function resolveImage(url) {
  if (!url) return "https://images.unsplash.com/photo-1610189020380-dc0d7a3e743d?auto=format&fit=crop&w=200&q=80";
  if (url.startsWith("http")) return url;
  return `${(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api")).replace("/api", "")}${url}`;
}
