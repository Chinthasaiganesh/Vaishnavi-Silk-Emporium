import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import Avatar from "./Avatar";
import { api } from "../api";
import { useLanguage } from "../LanguageContext";
import { useCart } from "../CartContext";

let notificationAudioContext;

function getNotificationAudioContext() {
  if (notificationAudioContext) return notificationAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  notificationAudioContext = new AudioContextClass();
  return notificationAudioContext;
}

async function unlockNotificationAudio() {
  const audioContext = getNotificationAudioContext();
  if (audioContext?.state === "suspended") await audioContext.resume();
}

async function playNotificationSound() {
  if (window.localStorage.getItem("deviceNotificationsAudio") !== "enabled") return;
  const audioContext = getNotificationAudioContext();
  if (!audioContext) return;
  if (audioContext.state === "suspended") await audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.18);
  oscillator.addEventListener("ended", () => audioContext.close(), { once: true });
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checking, logout, user } = useAuth();
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const previousUnreadNotifications = useRef(null);
  const displayName = user?.displayName || user?.fullName || user?.username;
  const { language, setLanguage, t } = useLanguage();
  const { cartCount } = useCart();
  const [previousCartCount, setPreviousCartCount] = useState(cartCount);
  const [cartBump, setCartBump] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    if (cartCount !== previousCartCount) {
      setCartBump(true);
      const timer = window.setTimeout(() => setCartBump(false), 500);
      setPreviousCartCount(cartCount);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [cartCount, previousCartCount]);

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event) {
      if (!mobileNavOpen) return;
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = navRef.current?.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])') || [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    if (mobileNavOpen) {
      const timer = window.setTimeout(() => navRef.current?.querySelector('a,button')?.focus(), 40);
      document.addEventListener("keydown", onKey);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("keydown", onKey);
      };
    }

    return undefined;
  }, [mobileNavOpen]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

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
    const unlock = () => { unlockNotificationAudio().catch(() => undefined); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("notifications:audio-enabled", unlock);
    let active = true;
    async function loadNotificationCount() {
      try {
        const response = await api.get("/notifications");
        const unreadCount = response.data.unreadCount || 0;
        if (active && previousUnreadNotifications.current !== null && unreadCount > previousUnreadNotifications.current) {
          const newNotifications = (response.data.notifications || []).filter((notification) => !notification.isRead).slice(0, unreadCount - previousUnreadNotifications.current);
          for (const notification of newNotifications.reverse()) {
            if ("Notification" in window && Notification.permission === "granted") {
              try { new Notification(notification.title, { body: notification.message, silent: false }); } catch (error) { console.warn("Device notification could not be displayed.", error); }
            }
            playNotificationSound().catch((error) => console.warn("Notification sound could not be played.", error));
          }
        }
        previousUnreadNotifications.current = unreadCount;
        if (active) setUnreadNotifications(unreadCount);
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
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("notifications:changed", handleNotificationChange); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); window.removeEventListener("notifications:audio-enabled", unlock); };
  }, [user]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo" to="/">
          <img className="brand-logo" src="/brand/vaishnavi-vs-monogram.png" alt="Vaishnavi Silk Emporium" />
          <span className="brand-copy"><strong>Vaishnavi Silk Emporium</strong><small>Where Tradition Meets Elegance</small></span>
        </Link>

        <button className="mobile-menu-toggle" type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-controls="primary-navigation" aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}>
          {mobileNavOpen ? "Close" : "Menu"}
        </button>

        {mobileNavOpen && <button type="button" className="nav-drawer-backdrop" aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} />}

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

        <nav ref={navRef} className={`nav-links${mobileNavOpen ? " mobile-nav-open" : ""}`} id="primary-navigation">
          {mobileNavOpen && (
            <>
              <div className="nav-drawer-header">
                <p className="nav-drawer-eyebrow">Browse</p>
                <strong>Find what you need fast</strong>
                <span>Quick access to home, collections, and categories.</span>
              </div>
            </>
          )}
          <NavLink to="/" end onClick={() => setMobileNavOpen(false)}>{t("home")}</NavLink>
          <NavLink to="/collections" end onClick={() => setMobileNavOpen(false)}>Collections</NavLink>
          <NavLink to="/categories" end onClick={() => setMobileNavOpen(false)}>Categories</NavLink>
        </nav>

        <div className="header-actions">
          <label className="language-select" aria-label={t("language")}>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">{t("english")}</option>
              <option value="te">{t("telugu")}</option>
            </select>
          </label>
          <Link className={`cart-link${cartBump ? " cart-link-bump" : ""}`} to="/cart" aria-label={`Cart with ${cartCount} items`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20.5 8H6" /><circle cx="9" cy="19" r="1.2" /><circle cx="18" cy="19" r="1.2" /></svg>
            {cartCount > 0 && <strong>{cartCount}</strong>}
          </Link>
          {!checking && !user && (
            <Link className="btn btn-outline" to="/login">{t("signIn")}</Link>
          )}
          {!checking && user?.role === "USER" && (
            <>
              <Link className="notification-bell" to="/notifications" aria-label={t("notifications")}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
                {unreadNotifications > 0 && <span>{unreadNotifications}</span>}
              </Link>
              <div className="account-menu">
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
            </>
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
