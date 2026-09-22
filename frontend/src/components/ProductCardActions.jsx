import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useCart } from "../CartContext";
import AddToCartButton from "./AddToCartButton";

export function NotifyWhenAvailableButton({ product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subscribing, setSubscribing] = useState(false);

  async function notifyWhenAvailable() {
    if (user?.role !== "USER") {
      navigate("/login");
      return;
    }
    setSubscribing(true);
    try {
      await api.post(`/notifications/subscriptions/${product.productId}`);
    } catch {
      // The product detail page remains the fallback notification flow.
    } finally {
      setSubscribing(false);
    }
  }

  return <button className="notify-action" onClick={notifyWhenAvailable} disabled={subscribing}>{subscribing ? "Saving..." : "Notify When Available"}</button>;
}

export default function ProductCardActions({ product, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const { cart } = useCart();
  const inCart = cart.items.some((item) => item.productId === product.productId);

  useEffect(() => {
    let active = true;
    if (user?.role !== "USER") return undefined;
    api.get(`/wishlists/${product.productId}`).then((response) => {
      if (active) setSaved(response.data.saved);
    }).catch(() => {});
    return () => { active = false; };
  }, [product.productId, user?.userId]);

  async function toggleWishlist() {
    if (user?.role !== "USER") {
      navigate("/login");
      return;
    }
    try {
      const response = saved
        ? await api.delete(`/wishlists/${product.productId}`)
        : await api.post(`/wishlists/${product.productId}`);
      setSaved(response.data.saved);
      setNotice(response.data.message);
      window.setTimeout(() => setNotice(""), 2200);
    } catch (error) {
      setNotice(error.response?.data?.message || "Unable to update wishlist.");
    }
  }

  return <div className={`product-card-actions${compact ? " product-card-actions-compact" : ""}`}>
    <button className={saved ? "wishlist-action wishlist-action-saved" : "wishlist-action"} onClick={toggleWishlist} aria-pressed={saved}>{saved ? "♥ Saved to Wishlist" : "♡ Save to Wishlist"}</button>
    <AddToCartButton product={product} inCart={inCart} />
    {notice && <span className="product-action-notice" role="status">{notice}</span>}
  </div>;
}
