import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getRecentlyViewed } from "../customerData";
import { useState } from "react";
import { useEffect } from "react";
import { api } from "../api";
import RatingBadge from "../components/RatingBadge";
import { formatCurrency } from "../utils/currency";

export default function CustomerFeaturePage({ type }) {
  const { checking, user } = useAuth();
  const [items, setItems] = useState(() => user && type !== "wishlist" ? getRecentlyViewed(user.userId) : []);
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (type !== "notifications" || user?.role !== "USER") return undefined;
    api.get("/notifications").then((response) => setNotifications(response.data.notifications || [])).catch(() => setNotifications([]));
  }, [type, user]);
  useEffect(() => {
    if (type !== "wishlist" || user?.role !== "USER") return undefined;
    api.get("/wishlists").then((response) => setItems(response.data.products || [])).catch(() => setItems([]));
  }, [type, user]);
  if (checking) return <main className="container section">Restoring your session...</main>;
  if (user?.role !== "USER") return <Navigate to="/" replace />;
  const title = type === "wishlist" ? "My Wishlist" : "Recently Viewed";
  if (type === "orders") return <main className="container section customer-empty"><h1>Order History</h1><p>No orders available.</p></main>;
  if (type === "notifications") return <main className="container section"><h1>Notifications</h1>{notifications.length === 0 ? <div className="customer-empty"><p>No notifications yet. Subscribe to an out-of-stock product to receive an alert when it is available.</p></div> : <section className="notification-list">{notifications.map((notification) => <article className={notification.isRead ? "notification-item" : "notification-item unread"} key={notification.notificationId}><div><h3>{notification.title}</h3><p>{notification.message}</p>{notification.productName && <strong>{notification.productName}</strong>}<small>{new Date(notification.createdDate).toLocaleString()}</small></div><div className="notification-actions">{notification.productId && <Link to={`/products/${notification.productId}`}>View Product</Link>}{!notification.isRead && <button onClick={async () => { await api.put(`/notifications/${notification.notificationId}/read`); setNotifications(notifications.map((item) => item.notificationId === notification.notificationId ? { ...item, isRead: true } : item)); }}>Mark as read</button>}</div></article>)}</section>}</main>;
  return <main className="container section"><h1>{title}</h1>{items.length === 0 ? <div className="customer-empty"><p>{type === "wishlist" ? "Save favorite products to see them here." : "Products you view will appear here."}</p><Link className="btn btn-primary" to="/products">Explore Products</Link></div> : <div className="customer-product-grid">{items.map((product) => <article className="customer-product" key={product.productId}><img src={product.imageUrl} alt={product.productName} /><h3>{product.productName}</h3><RatingBadge rating={product.rating} /><p>{formatCurrency(product.price)}</p>{product.viewedAt && <small>Viewed {new Date(product.viewedAt).toLocaleDateString()}</small>}<Link to={`/products/${product.productId}`}>View Details</Link>{type === "wishlist" && <button onClick={async () => { await api.delete(`/wishlists/${product.productId}`); setItems(items.filter((item) => item.productId !== product.productId)); }}>Remove</button>}</article>)}</div>}</main>;
}