import { Link, Navigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { getRecentlyViewed } from "../customerData";
import { api } from "../api";
import RatingBadge from "../components/RatingBadge";
import { formatCurrency } from "../utils/currency";

function formatRelativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Just now";
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return "Just now";
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  const [unit, seconds] = units.find(([, unitSeconds]) => elapsedSeconds >= unitSeconds) || ["minute", 60];
  const amount = Math.floor(elapsedSeconds / seconds);
  return `${amount} ${unit}${amount > 1 ? "s" : ""} ago`;
}

function getNotificationIcon(type) {
  if (type === "ORDER_STATUS") return "Order";
  if (type === "BACK_IN_STOCK" || type === "INVENTORY") return "Stock";
  return "Note";
}

function getNotificationTarget(notification) {
  if (notification.orderId) return { to: `/orders/${notification.orderId}`, label: "View Order" };
  if (notification.productId) return { to: `/products/${notification.productId}`, label: "View Product" };
  return null;
}

export default function CustomerFeaturePage({ type }) {
  const { checking, user } = useAuth();
  const [items, setItems] = useState(() => user && type !== "wishlist" ? getRecentlyViewed(user.userId) : []);
  const [notifications, setNotifications] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState("");
  const [activeNotificationId, setActiveNotificationId] = useState(null);
  const [canHover, setCanHover] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (type !== "notifications" || user?.role !== "USER") return undefined;
    api.get("/notifications").then((response) => setNotifications(response.data.notifications || [])).catch(() => setNotifications([]));
  }, [type, user]);

  useEffect(() => {
    if (type !== "wishlist" || user?.role !== "USER") return undefined;
    api.get("/wishlists").then((response) => setItems(response.data.products || [])).catch(() => setItems([]));
  }, [type, user]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCanHover(mediaQuery.matches);
    function handleChange(event) { setCanHover(event.matches); }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  if (checking) return <main className="container section">Restoring your session...</main>;
  if (user?.role !== "USER") return <Navigate to="/" replace />;

  async function markAsRead(notificationId) {
    setBusyId(notificationId);
    try {
      const response = await api.patch(`/notifications/${notificationId}/read`);
      setNotifications((current) => current.map((item) => item.notificationId === notificationId ? { ...item, isRead: true, readDate: new Date().toISOString() } : item));
      window.dispatchEvent(new CustomEvent("notifications:changed", { detail: { unreadCount: response.data.unreadCount || 0 } }));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNotification(notificationId) {
    const notification = notifications.find((item) => item.notificationId === notificationId);
    if (!notification?.isRead) return;
    setBusyId(notificationId);
    try {
      const response = await api.delete(`/notifications/${notificationId}`);
      setNotifications((current) => current.filter((item) => item.notificationId !== notificationId));
      window.dispatchEvent(new CustomEvent("notifications:changed", { detail: { unreadCount: response.data.unreadCount || 0 } }));
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBulkBusy("read");
    try {
      const response = await api.patch("/notifications/read-all");
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.isRead ? item : { ...item, isRead: true, readDate: readAt }));
      window.dispatchEvent(new CustomEvent("notifications:changed", { detail: { unreadCount: response.data.unreadCount || 0 } }));
    } finally {
      setBulkBusy("");
    }
  }

  async function clearRead() {
    setBulkBusy("clear");
    try {
      const response = await api.delete("/notifications/read");
      setNotifications((current) => current.filter((item) => !item.isRead));
      window.dispatchEvent(new CustomEvent("notifications:changed", { detail: { unreadCount: response.data.unreadCount || 0 } }));
    } finally {
      setBulkBusy("");
    }
  }

  if (type === "notifications") {
    const unreadCount = notifications.filter((notification) => !notification.isRead).length;
    const readCount = notifications.length - unreadCount;
    return (
      <main className="container section notification-center">
        <div className="notification-toolbar">
          <div>
            <p className="eyebrow">Customer alerts</p>
            <h1>Notifications</h1>
            <p>{unreadCount ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up"}</p>
          </div>
          <div className="notification-bulk-actions">
            <button className="btn btn-outline" disabled={!unreadCount || bulkBusy === "read"} onClick={markAllRead}>Mark All Read</button>
            <button className="btn btn-primary" disabled={!readCount || bulkBusy === "clear"} onClick={clearRead}>Clear Read Notifications</button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <motion.div className="customer-empty" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}>
            <p>No notifications yet. Subscribe to an out-of-stock product to receive an alert when it is available.</p>
          </motion.div>
        ) : (
          <motion.section className="notification-list" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: reducedMotion ? 0 : 0.05 } } }}>
            <AnimatePresence initial={false}>
              {notifications.map((notification) => {
                const target = getNotificationTarget(notification);
                return (
                  <motion.article
                    layout
                    className={notification.isRead ? "notification-item" : "notification-item unread"}
                    key={notification.notificationId}
                    variants={{ hidden: { opacity: 0, y: 16, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1 } }}
                    initial={reducedMotion ? false : "hidden"}
                    animate={reducedMotion ? undefined : "show"}
                    exit={reducedMotion ? undefined : { opacity: 0, x: 80, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                    whileHover={reducedMotion ? undefined : { y: -3, scale: 1.01 }}
                    onMouseEnter={() => setActiveNotificationId(notification.notificationId)}
                    onMouseLeave={() => setActiveNotificationId(null)}
                    onFocus={() => setActiveNotificationId(notification.notificationId)}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveNotificationId(null); }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                  >
                    <div className="notification-icon" aria-hidden="true">{getNotificationIcon(notification.type)}</div>
                    <div className="notification-copy">
                      <div className="notification-title-row">
                        <h3>{notification.title}</h3>
                        <span className={notification.isRead ? "read-pill" : "unread-pill"}>{notification.isRead ? "✓ Read" : "● Unread"}</span>
                      </div>
                      <p>{notification.message}</p>
                      {notification.productName && <strong>{notification.productName}</strong>}
                      <small>{formatRelativeTime(notification.createdDate)}</small>
                    </div>
                    <motion.div className="notification-actions" animate={reducedMotion || !canHover || activeNotificationId === notification.notificationId ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.22 }}>
                      {target && <Link to={target.to}>{target.label}</Link>}
                      {notification.isRead ? <button disabled={busyId === notification.notificationId} onClick={() => deleteNotification(notification.notificationId)}>Delete</button> : <button disabled={busyId === notification.notificationId} onClick={() => markAsRead(notification.notificationId)}>Mark as Read</button>}
                    </motion.div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.section>
        )}
      </main>
    );
  }

  const title = type === "wishlist" ? "My Wishlist" : "Recently Viewed";
  return <main className="container section"><h1>{title}</h1>{items.length === 0 ? <div className="customer-empty"><p>{type === "wishlist" ? "Save favorite products to see them here." : "Products you view will appear here."}</p><Link className="btn btn-primary" to="/products">Explore Products</Link></div> : <div className="customer-product-grid">{items.map((product) => <article className="customer-product" key={product.productId}><img src={product.imageUrl} alt={product.productName} /><h3>{product.productName}</h3><RatingBadge rating={product.rating} /><p>{formatCurrency(product.price)}</p>{product.viewedAt && <small>Viewed {new Date(product.viewedAt).toLocaleDateString()}</small>}<Link to={`/products/${product.productId}`}>View Details</Link>{type === "wishlist" && <button onClick={async () => { await api.delete(`/wishlists/${product.productId}`); setItems(items.filter((item) => item.productId !== product.productId)); }}>Remove</button>}</article>)}</div>}</main>;
}
