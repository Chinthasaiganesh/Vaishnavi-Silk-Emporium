import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useCart } from "../CartContext";
import AddToCartButton from "./AddToCartButton";

export default function ProductCardActions({ product, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [subscribing, setSubscribing] = useState(false);
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

  async function notifyWhenAvailable() {
    if (user?.role !== "USER") {
      navigate("/login");
      return;
    }
    setSubscribing(true);
    try {
      const response = await api.post(`/notifications/subscriptions/${product.productId}`);
      setNotice(response.data.message);
    } catch (error) {
      setNotice(error.response?.data?.message || "Unable to save notification request.");
    } finally {
      setSubscribing(false);
    }
  }

  return <div className={`product-card-actions${compact ? " product-card-actions-compact" : ""}`}>
    <button className={saved ? "wishlist-action wishlist-action-saved" : "wishlist-action"} onClick={toggleWishlist} aria-pressed={saved}>{saved ? "♥ Saved to Wishlist" : "♡ Save to Wishlist"}</button>
    <AddToCartButton product={product} inCart={inCart} />
    {product.quantity <= 0 && <button className="notify-action" onClick={notifyWhenAvailable} disabled={subscribing}>{subscribing ? "Saving..." : "Notify Me When Available"}</button>}
    {notice && <span className="product-action-notice" role="status">{notice}</span>}
  </div>;
}
