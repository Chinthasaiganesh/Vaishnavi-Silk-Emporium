import { useState } from "react";
import { useCart } from "../CartContext";
import { useNavigate } from "react-router-dom";
import { useNotifier } from "../NotifierContext";
import { buildNotification } from "../utils/notificationPresets";

export default function AddToCartButton({ product, inCart = false, className = "btn btn-primary", mode = "cart", notifyState = "idle", onNotify, onUnavailable }) {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const { notify } = useNotifier();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const outOfStock = Number(product.availableQuantity ?? 0) <= 0;

  async function handleAdd() {
    if (mode === "notify") {
      if (notifyState === "idle") await onNotify?.();
      return;
    }
    if (inCart) {
      navigate("/cart");
      return;
    }
    setAdding(true);
    const image = document.querySelector(`[data-cart-product="${product.productId}"]`);
    const cart = document.querySelector(".cart-link");
    const result = await addToCart(product.productId, 1, product, image?.getBoundingClientRect(), cart?.getBoundingClientRect());
    setAdding(false);
    if (result?.code === "TEMPORARILY_RESERVED") {
      onUnavailable?.();
      notify(buildNotification("ITEM_UNAVAILABLE", {
        title: "Temporarily Unavailable",
        message: `${product.productName} is reserved while another customer completes checkout. Please try again shortly.`,
        primaryAction: { label: "Got it" }
      }));
      return;
    }
    if (result === true) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    }
  }

  const notifySuccess = mode === "notify" && notifyState === "subscribed";
  const notifyLoading = mode === "notify" && notifyState === "loading";
  const completedState = inCart || notifySuccess;
  return <button className={`${completedState ? "in-cart-button" : className} add-to-cart-button${added ? " add-to-cart-added" : ""}`} disabled={mode === "notify" ? notifyLoading || notifySuccess : ((!inCart && outOfStock) || adding || added)} onClick={handleAdd} aria-live="polite" aria-pressed={notifySuccess}>{notifyLoading ? <><span className="button-spinner" aria-hidden="true" /><span className="cart-button-label">Registering...</span><span className="cart-button-label-compact">Registering</span></> : notifySuccess ? <><span className="cart-button-label">✓ You'll Be Notified</span><span className="cart-button-label-compact">✓ Notified</span></> : mode === "notify" ? <><span className="cart-button-label">Notify Me When Available</span><span className="cart-button-label-compact">Notify Me</span></> : adding ? <><span className="button-spinner" aria-hidden="true" /><span className="cart-button-label">Adding...</span><span className="cart-button-label-compact">Adding</span></> : inCart ? (added ? <><span className="cart-button-label">✓ Added</span><span className="cart-button-label-compact">Added</span></> : <><span className="cart-button-label">✓ In Cart</span><span className="cart-button-label-compact">In Cart</span></>) : <><span className="cart-button-label">Add to Cart</span><span className="cart-button-label-compact">Add to Cart</span></>}</button>;
}