import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useCart } from "../CartContext";
import { useNotifier } from "../NotifierContext";
import { buildNotification } from "../utils/notificationPresets";
import { formatCurrency } from "../utils/currency";
import ProductPrice from "../components/ProductPrice";
import PaymentSessionNotice from "../components/PaymentSessionNotice";
import { resolveImageUrl } from "../utils/image";

function money(value) {
  return formatCurrency(value);
}

export default function CartPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify, confirm } = useNotifier();
  const { cart, updateQuantity, removeItem, clearCart, releasePaymentSession } = useCart();
  const [cancelingSession, setCancelingSession] = useState(false);
  const { items, totals, activePaymentSession } = cart;
  const paymentLocked = Boolean(activePaymentSession);

  useEffect(() => {
    const { notice, message } = location.state || {};
    if (!notice && !message) return;
    notify(notice
      ? buildNotification(notice, { id: `cart-notice-${notice}`, primaryAction: { label: "Return to Cart" } })
      : { id: "cart-notice-message", variant: "info", icon: "info", title: "Update", message, primaryAction: { label: "Got it" } });
    window.history.replaceState({}, document.title);
  }, [location, notify]);

  async function cancelPaymentSession() {
    const confirmed = await confirm({
      variant: "warning",
      icon: "alert",
      eyebrow: "Payment in progress",
      title: "Cancel Payment Session?",
      message: "Your reserved items will be released and you can make changes to your cart. Do not cancel if you have already sent the payment.",
      confirmLabel: "Cancel Session",
      cancelLabel: "Continue Payment"
    });
    if (!confirmed) return;

    setCancelingSession(true);
    try {
      await releasePaymentSession(activePaymentSession.ReservationId);
      notify(buildNotification("PAYMENT_SESSION_CANCELLED", { id: `payment-session-cancelled-${activePaymentSession.ReservationId}` }));
    } catch (error) {
      notify({ variant: "error", icon: "declined", title: "Unable to Cancel Session", message: error.response?.data?.message || "Please try again." });
    } finally {
      setCancelingSession(false);
    }
  }

  return (
    <main className={`container section cart-page${paymentLocked ? " payment-session-lock-active" : ""}`}>
      {paymentLocked && <PaymentSessionNotice session={activePaymentSession} onContinue={() => navigate("/checkout")} onCancel={cancelPaymentSession} canceling={cancelingSession} />}
      <div className="section-head">
        <div><p className="eyebrow">Your selection</p><h1>Shopping Cart</h1></div>
        {items.length > 0 && !paymentLocked && <button className="btn btn-outline" onClick={clearCart}>Clear Cart</button>}
      </div>
      {items.length === 0 ? (
        <section className="cart-empty">
          <div className="cart-empty-icon" aria-hidden="true">Cart</div>
          <h2>Your cart is empty</h2>
          <p>Explore our beautiful saree collections.</p>
          <Link className="btn btn-primary" to="/products">Continue Shopping</Link>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-items" aria-disabled={paymentLocked}>
            {items.map((item) => (
              <article className="cart-item" key={item.cartItemId}>
                <img src={resolveImage(item.imageUrl)} alt={item.productName} />
                <div className="cart-item-info">
                  <p className="pill">{item.category}</p>
                  <h2>{item.productName}</h2>
                  <ProductPrice product={{ price: item.unitPrice, originalPrice: item.originalPrice, discountedPrice: item.discountedPrice, discountPercentage: item.discountPercentage }} />
                  <p className="cart-stock">{item.availableStock} available</p>
                </div>
                <div className="cart-item-actions">
                  <div className="quantity-stepper">
                    <button aria-label={`Decrease ${item.productName} quantity`} disabled={paymentLocked || item.quantity <= 1} onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}>-</button>
                    <span>{item.quantity}</span>
                    <button aria-label={`Increase ${item.productName} quantity`} disabled={paymentLocked || item.quantity >= item.availableStock} onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}>+</button>
                  </div>
                  <strong>{money(item.subtotal)}</strong>
                  <button className="link-btn" disabled={paymentLocked} onClick={() => removeItem(item.cartItemId)}>Remove</button>
                </div>
              </article>
            ))}
          </section>
          <aside className="cart-summary">
            <h2>Order Summary</h2>
            <div><span>Items</span><strong>{totals.itemCount}</strong></div>
            <div><span>Original price</span><strong>{money(totals.originalSubtotal ?? totals.subtotal)}</strong></div>
            <div><span>Discount</span><strong className="checkout-savings">-{money(totals.discount || 0)}</strong></div>
            <div className="cart-total"><span>Grand Total</span><strong>{money(totals.grandTotal)}</strong></div>
            {Number(totals.discount) > 0 && <div className="order-savings-callout"><strong>You save {money(totals.discount)}</strong></div>}
            {paymentLocked
              ? <button className="btn btn-primary" onClick={() => navigate("/checkout")}>Continue Payment</button>
              : <Link className="btn btn-primary" to="/checkout">Proceed to Checkout</Link>}
          </aside>
        </div>
      )}
    </main>
  );
}

function resolveImage(url) {
  return resolveImageUrl(url);
}