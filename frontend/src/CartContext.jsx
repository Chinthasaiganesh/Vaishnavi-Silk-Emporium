import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiBaseUrl } from "./api";
import { useAuth } from "./AuthContext";
import { formatCurrency } from "./utils/currency";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [], totals: { itemCount: 0, subtotal: 0, grandTotal: 0 } });
  const [notice, setNotice] = useState(null);
  const [miniCart, setMiniCart] = useState(null);
  const [flyingProduct, setFlyingProduct] = useState(null);

  useEffect(() => {
    let active = true;
    if (user?.role !== "USER") {
      setCart({ items: [], totals: { itemCount: 0, subtotal: 0, grandTotal: 0 } });
      return undefined;
    }
    api.get("/cart").then((response) => { if (active) setCart(response.data); }).catch(() => { if (active) setNotice({ type: "error", text: "Unable to load your cart." }); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!miniCart) return undefined;
    const timer = window.setTimeout(() => setMiniCart(null), 5200);
    return () => window.clearTimeout(timer);
  }, [miniCart]);

  function showGuestPrompt() {
    setNotice({ type: "guest", text: "Please sign in to add products to your cart." });
  }

  async function addToCart(productId, quantity = 1, product = null, sourceRect = null, targetRect = null) {
    if (user?.role !== "USER") { console.info("Cart add blocked for guest user", { productId, quantity }); showGuestPrompt(); return false; }
    const requestUrl = `${apiBaseUrl}/cart/items`;
    console.info("Cart add requested", { requestUrl, method: "POST", userId: user.userId, productId, quantity });
    try {
      const response = await api.post("/cart/items", { productId, quantity });
      console.info("Cart add succeeded", { requestUrl, method: "POST", status: response.status, userId: user.userId, productId, quantity, response: response.data });
      const addedItem = response.data.items.find((item) => item.productId === productId);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const flightDuration = reduceMotion ? 0 : 500;

      if (sourceRect) {
        setFlyingProduct({ imageUrl: product?.imageUrl || addedItem?.imageUrl, sourceRect, targetRect });
        await wait(flightDuration);
        setFlyingProduct(null);
      }

      setCart(response.data);
      await wait(reduceMotion ? 0 : 120);
      setMiniCart(addedItem || product);
      await wait(reduceMotion ? 0 : 140);
      setNotice({ type: "success", text: response.data.message });
      return true;
    } catch (error) {
      const status = error.response?.status;
      const requestId = error.response?.headers?.["x-request-id"];
      const serverMessage = error.response?.data?.message;
      console.error("Cart add failed", { requestUrl, method: "POST", userId: user.userId, productId, quantity, status: status || null, response: error.response?.data || null, requestId: requestId || null, error: error.message });
      setNotice({ type: "error", text: serverMessage || (status ? `Cart API failed (HTTP ${status}) at ${requestUrl}.` : `Cart API unavailable at ${requestUrl}.`) });
      return false;
    }
  }

  async function updateQuantity(cartItemId, quantity) {
    try { const response = await api.put(`/cart/items/${cartItemId}`, { quantity }); setCart(response.data); setNotice({ type: "success", text: response.data.message }); }
    catch (error) { setNotice({ type: "error", text: error.response?.data?.message || "Unable to update cart quantity." }); }
  }

  async function removeItem(cartItemId) {
    try { const response = await api.delete(`/cart/items/${cartItemId}`); setCart(response.data); setNotice({ type: "success", text: response.data.message }); }
    catch (error) { setNotice({ type: "error", text: error.response?.data?.message || "Unable to remove item." }); }
  }

  async function clearCart() {
    try { const response = await api.delete("/cart"); setCart(response.data); setNotice({ type: "success", text: response.data.message }); }
    catch (error) { setNotice({ type: "error", text: error.response?.data?.message || "Unable to clear cart." }); }
  }

  return <CartContext.Provider value={{ cart, cartCount: cart.totals.itemCount, addToCart, updateQuantity, removeItem, clearCart }}>
    {children}
    {flyingProduct && <img className="flying-cart-product" src={resolveImage(flyingProduct.imageUrl)} style={{ left: flyingProduct.sourceRect.left, top: flyingProduct.sourceRect.top, width: flyingProduct.sourceRect.width, height: flyingProduct.sourceRect.height, "--cart-left": `${flyingProduct.targetRect?.left || window.innerWidth - 64}px`, "--cart-top": `${flyingProduct.targetRect?.top || 16}px` }} alt="" aria-hidden="true" />}
    {notice && <div className={`cart-toast cart-toast-${notice.type}`} role="status"><span className="cart-toast-icon" aria-hidden="true">{notice.type === "success" ? "✓" : "!"}</span><span>{notice.text}</span>{notice.type === "guest" && <><button onClick={() => navigate("/login")}>Sign In</button><button onClick={() => navigate("/login?mode=register")}>Register</button></>}</div>}
    {miniCart && <aside className="mini-cart" aria-label="Recently added item"><div className="mini-cart-heading"><strong>Added to Cart</strong><button aria-label="Close mini cart" onClick={() => setMiniCart(null)}>×</button></div><div className="mini-cart-item"><img src={resolveImage(miniCart.imageUrl)} alt="" /><div><strong>{miniCart.productName}</strong><span>{miniCart.quantity || 1} × {formatCurrency(miniCart.unitPrice || miniCart.price || 0)}</span></div></div><div className="mini-cart-actions"><button className="btn btn-primary" onClick={() => { setMiniCart(null); navigate("/cart"); }}>View Cart</button><button className="btn btn-outline" onClick={() => setMiniCart(null)}>Continue Shopping</button></div></aside>}
  </CartContext.Provider>;
}

function resolveImage(url) {
  if (!url) return "https://images.unsplash.com/photo-1610189020380-dc0d7a3e743d?auto=format&fit=crop&w=500&q=80";
  if (url.startsWith("http")) return url;
  return `${(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api")).replace("/api", "")}${url}`;
}

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider.");
  return context;
}