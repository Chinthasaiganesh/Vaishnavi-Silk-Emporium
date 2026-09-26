import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { useCart } from "../CartContext";
import { useNotifier } from "../NotifierContext";
import { buildNotification } from "../utils/notificationPresets";
import QRCode from "qrcode";
import { resolveImageUrl } from "../utils/image";
import { buildUpiTransactionNote, getCheckoutOrderNumber, summarizeCheckoutProducts } from "../utils/upi";

const emptyAddress = { fullName: "", mobileNumber: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India", isDefault: false };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { refreshCart } = useCart();
  const { notify, confirm } = useNotifier();
  const [summary, setSummary] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [form, setForm] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [upiPayment, setUpiPayment] = useState(null);
  const [upiReference, setUpiReference] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const placingRef = useRef(false);
  const reservationSessionId = useRef(localStorage.getItem("checkout-reservation-session") || crypto.randomUUID());
  const serverClockOffset = useRef(0);
  const announcedReservation = useRef(false);
  const announcedExpiryWarning = useRef(false);

  function formatReservationTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function applyReservation(payload) {
    if (payload?.serverTime) serverClockOffset.current = new Date(payload.serverTime).getTime() - Date.now();
    setReservation(payload || null);
    return payload;
  }

  async function reserveCheckout(selectedAddressId) {
    const response = await api.post("/checkout/reserve", { addressId: Number(selectedAddressId), sessionId: reservationSessionId.current });
    localStorage.setItem("checkout-reservation-session", reservationSessionId.current);
    return applyReservation(response.data.reservation);
  }

  async function load() {
    setLoading(true);
    try {
      const [summaryResponse, addressResponse] = await Promise.all([api.get("/checkout/summary"), api.get("/addresses")]);
      setSummary(summaryResponse.data);
      const saved = addressResponse.data.addresses || [];
      setAddresses(saved);
      const selectedAddressId = String(saved.find((address) => address.IsDefault)?.AddressId || saved[0]?.AddressId || "");
      setAddressId(selectedAddressId);
      if (selectedAddressId) await reserveCheckout(selectedAddressId);
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load checkout."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!reservation) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reservation]);

  // The reservation clock is owned by the server, so resync whenever this tab regains focus.
  useEffect(() => {
    if (!reservation?.ReservationId) return undefined;
    const reservationId = reservation.ReservationId;
    async function resync() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await api.get(`/checkout/reservations/${reservationId}`);
        applyReservation(response.data.reservation);
      } catch { /* the expiry effect handles an unreachable reservation */ }
    }
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    const poll = window.setInterval(resync, 30000);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
      window.clearInterval(poll);
    };
  }, [reservation?.ReservationId]);

  const remainingSeconds = reservation?.ReservationStatus === "ACTIVE" ? Math.max(0, Math.ceil((new Date(reservation.ExpiresAt).getTime() - (Date.now() + serverClockOffset.current)) / 1000)) : 0;

  useEffect(() => {
    if (!reservation?.ExpiresAt || remainingSeconds <= 0) return;
    if (!announcedReservation.current) {
      announcedReservation.current = true;
      notify(buildNotification("RESERVATION_STARTED", { id: `reservation-started-${reservation.ReservationId}`, countdown: { expiresAt: reservation.ExpiresAt, totalSeconds: reservation.totalSeconds, label: "Reservation time remaining" } }));
      return;
    }
    if (remainingSeconds <= 120 && !announcedExpiryWarning.current) {
      announcedExpiryWarning.current = true;
      notify(buildNotification("RESERVATION_EXPIRING", { id: `reservation-expiring-${reservation.ReservationId}`, countdown: { expiresAt: reservation.ExpiresAt, totalSeconds: reservation.totalSeconds, label: "Reservation time remaining" }, primaryAction: { onClick: () => { if (!upiPayment) startUpiPayment(); } } }));
    }
  }, [reservation?.ExpiresAt, remainingSeconds]);

  useEffect(() => {
    if (!reservation || placing || placingRef.current) return;
    const expired = reservation.ReservationStatus === "EXPIRED"
      || (reservation.ReservationStatus === "ACTIVE" && remainingSeconds <= 0);
    if (!expired) return;
    api.post(`/checkout/reservations/${reservation.ReservationId}/release`).catch(() => undefined);
    localStorage.removeItem("checkout-reservation-session");
    setReservation(null);
    setUpiPayment(null);
    navigate("/cart", { replace: true, state: { notice: "RESERVATION_EXPIRED" } });
  }, [reservation, remainingSeconds, placing, navigate]);

  const reservationTone = remainingSeconds <= 30 ? "critical" : remainingSeconds <= 60 ? "urgent" : remainingSeconds <= 120 ? "warning" : "";
  const reservationWarning = remainingSeconds <= 30 ? "Final moments! Submit your payment proof now or the items will be released." : remainingSeconds <= 60 ? "Less than one minute remaining to complete payment." : remainingSeconds <= 120 ? "Hurry! Your reservation will expire soon." : "";

  function addressToForm(address) {
    return { fullName: address.FullName, mobileNumber: address.MobileNumber, addressLine1: address.AddressLine1, addressLine2: address.AddressLine2 || "", city: address.City, state: address.State, postalCode: address.PostalCode, country: address.Country || "India", isDefault: Boolean(address.IsDefault) };
  }

  function startAddAddress() {
    setEditingAddressId(null);
    setForm(emptyAddress);
    setShowForm((current) => !current);
  }

  function startEditAddress(address) {
    setEditingAddressId(address.AddressId);
    setForm(addressToForm(address));
    setShowForm(true);
    setError("");
  }

  function cancelAddressForm() {
    setEditingAddressId(null);
    setForm(emptyAddress);
    setShowForm(false);
  }

  async function saveAddress(event) {
    event.preventDefault();
    try {
      const response = editingAddressId ? await api.put(`/addresses/${editingAddressId}`, form) : await api.post("/addresses", form);
      const savedAddress = response.data.address;
      setAddresses((current) => editingAddressId ? current.map((address) => address.AddressId === editingAddressId ? savedAddress : { ...address, IsDefault: savedAddress.IsDefault ? 0 : address.IsDefault }) : [savedAddress, ...current]);
      setAddressId(String(savedAddress.AddressId));
      cancelAddressForm();
    }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to save address."); }
  }

  async function removeAddress(address) {
    const confirmed = await confirm({ variant: "warning", icon: "alert", eyebrow: "Delete address", title: "Delete This Address?", message: "This saved delivery address will be removed from your account. You can add it again later.", confirmLabel: "Delete Address", cancelLabel: "Keep Address" });
    if (!confirmed) return;
    try {
      await api.delete(`/addresses/${address.AddressId}`);
      const remaining = addresses.filter((item) => item.AddressId !== address.AddressId);
      setAddresses(remaining);
      if (String(address.AddressId) === addressId) setAddressId(String(remaining[0]?.AddressId || ""));
      if (editingAddressId === address.AddressId) cancelAddressForm();
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to delete address."); }
  }

  async function startUpiPayment() {
    setError("");
    try {
      const activeReservation = await reserveCheckout(addressId);
      const upiId = import.meta.env.VITE_UPI_ID;
      if (!upiId) throw new Error("UPI payment is not configured. Set VITE_UPI_ID in the frontend environment.");
      const amount = activeReservation.items.reduce((total, item) => total + Number(item.UnitPrice) * Number(item.Quantity), 0).toFixed(2);
      const orderNumber = getCheckoutOrderNumber(idempotencyKey.current);
      const transactionNote = buildUpiTransactionNote(orderNumber, activeReservation.items);
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("Vaishnavi Silk Emporium")}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
      const qrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 2 });
      setUpiReference("");
      setUpiPayment({ amount, upiId, qrDataUrl, orderNumber, productSummary: summarizeCheckoutProducts(activeReservation.items) });
    } catch (err) {
      console.error("UPI payment initialization failed", err);
      setError(err.response?.data?.message || err.message || "Payment initialization failed.");
    }
  }

  async function confirmUpiPayment() {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{5,63}$/.test(upiReference.trim())) {
      setError("Enter a valid UPI transaction reference or UTR.");
      return;
    }
    if (!paymentScreenshot) { setError("Upload your payment screenshot before continuing."); return; }
    if (!reservation || remainingSeconds <= 0) { setError("Your reservation has expired. Please start checkout again."); return; }
    placingRef.current = true;
    setPlacing(true); setError("");
    try {
      const formData = new FormData();
      formData.append("addressId", addressId);
      formData.append("paymentMethod", "UPI_MANUAL");
      formData.append("paymentReference", upiReference.trim());
      formData.append("paymentScreenshot", paymentScreenshot);
      const response = await api.post("/orders", formData, { headers: { "Idempotency-Key": idempotencyKey.current, "Checkout-Reservation-Id": reservation.ReservationId } });
      localStorage.removeItem("checkout-reservation-session");
      setReservation(null);
      setUpiPayment(null); setPaymentScreenshot(null);
      try { await refreshCart(); } catch { /* order was created */ }
      const orderReference = response.data.order.OrderNumber || response.data.order.OrderId;
      notify(buildNotification("ORDER_PLACED", { dismissible: false, primaryAction: { label: "View Order", to: `/orders/${response.data.order.OrderId}`, navigateOptions: { replace: true } }, footnote: `Order ID: #${orderReference}` }));
    } catch (requestError) {
      if (requestError.response?.data?.code === "RESERVATION_EXPIRED") {
        localStorage.removeItem("checkout-reservation-session");
        navigate("/cart", { replace: true, state: { notice: "RESERVATION_EXPIRED" } });
        return;
      }
      setError(requestError.response?.data?.message || "Payment proof could not be saved. Please contact support with your UPI reference before paying again.");
    } finally { placingRef.current = false; setPlacing(false); }
  }

  if (loading) return <main className="container section"><p>Loading checkout...</p></main>;
  if (error && !summary) return <main className="container section"><p className="error-text">{error}</p><Link className="btn btn-outline" to="/cart">Back To Cart</Link></main>;
  if (!summary?.items?.length) return <main className="container section"><section className="cart-empty"><h1>Your cart is empty</h1><p>Add products before starting checkout.</p><Link className="btn btn-primary" to="/products">Continue Shopping</Link></section></main>;

  return (
    <main className="container section checkout-page">
      <div className="section-head"><div><p className="eyebrow">Secure order review</p><h1>Checkout</h1></div></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {reservation && <div className={`reservation-timer${reservationTone ? ` ${reservationTone}` : ""}`} role="status" aria-live={remainingSeconds <= 60 ? "assertive" : "polite"}><strong>Items reserved for checkout</strong><span>Your items are reserved for {formatReservationTime(remainingSeconds)} minutes.</span>{reservationWarning && <small>{reservationWarning}</small>}</div>}
      <div className="checkout-layout">
        <section className="checkout-main">
          <article className="checkout-section">
            <div className="checkout-section-heading"><h2>Delivery Address</h2><button className="link-btn" onClick={showForm ? cancelAddressForm : startAddAddress}>{showForm ? "Cancel" : "Add Address"}</button></div>
            {addresses.length === 0 && !showForm && <p className="muted">Add a delivery address to continue.</p>}
            {addresses.length > 0 && <div className="address-list">{addresses.map((address) => <div className={`address-option${String(address.AddressId) === addressId ? " selected" : ""}`} key={address.AddressId}><label className="address-select"><input type="radio" name="address" value={address.AddressId} checked={String(address.AddressId) === addressId} onChange={(event) => setAddressId(event.target.value)} /><span><strong>{address.FullName}</strong><small>{address.AddressLine1}{address.AddressLine2 ? `, ${address.AddressLine2}` : ""}, {address.City}, {address.State} {address.PostalCode}</small><small>{address.MobileNumber}</small></span></label><div className="address-actions"><button type="button" className="link-btn" onClick={() => startEditAddress(address)}>Edit</button><button type="button" className="link-btn danger-link" onClick={() => removeAddress(address)}>Delete</button></div></div>)}</div>}
              {showForm && <form className="address-form" onSubmit={saveAddress}>{Object.entries(emptyAddress).filter(([key]) => key !== "isDefault").map(([key]) => <input key={key} required={!['addressLine2', 'country'].includes(key)} placeholder={key.replace(/([A-Z])/g, " $1")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}<label className="checkbox-line"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />Use as default address</label><button className="btn btn-outline">{editingAddressId ? "Update Address" : "Save Address"}</button></form>}
          </article>
        </section>
        <aside className="checkout-summary-panel">
          <article className="checkout-section checkout-summary-card">
            <div className="checkout-section-heading"><h2>Order Summary</h2><Link className="link-btn" to="/cart">Edit cart</Link></div>
            <div className="checkout-summary-items">{summary.items.map((item) => <div className="checkout-item checkout-item-detailed" key={item.cartItemId}><img className="checkout-item-image" src={resolveImage(item.imageUrl)} alt="" /><div><strong>{item.productName}</strong><span>{item.quantity} × {formatCurrency(item.unitPrice)}</span><small>{item.discountPercentage > 0 ? `${formatCurrency(item.originalPrice)} original · Save ${formatCurrency((item.originalPrice - item.unitPrice) * item.quantity)} · -${item.discountPercentage}% discount` : "Regular price"}</small></div><strong>{formatCurrency(item.subtotal)}</strong></div>)}</div>
            <div className="checkout-price-breakdown"><div><span>Original price</span><strong>{formatCurrency(summary.originalSubtotal ?? summary.items.reduce((total, item) => total + item.originalPrice * item.quantity, 0))}</strong></div><div><span>Discount</span><strong className="checkout-savings">-{formatCurrency(summary.discount)}</strong></div><div><span>Delivery</span><strong>Free</strong></div><div className="checkout-grand-total"><span>Final payable</span><strong>{formatCurrency(summary.grandTotal)}</strong></div></div>
            {Number(summary.discount) > 0 && <div className="order-savings-callout"><strong>You save {formatCurrency(summary.discount)} on this order</strong><span>Discounts are locked in at checkout.</span></div>}
            <div className="checkout-trust"><span aria-hidden="true">✓</span><div><strong>Secure checkout</strong><small>Safe UPI payment and order protection.</small></div></div>
            <button className="btn btn-primary checkout-pay-button" disabled={!addressId || placing} onClick={startUpiPayment}>{placing ? "Processing..." : "Pay securely with UPI QR"}</button>
          </article>
        </aside>
      </div>
      {upiPayment && <div className="payment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upi-payment-title" tabIndex={-1}>
        <section className="payment-modal">
          <button className="link-btn" onClick={() => setUpiPayment(null)}>Close</button>
          <h2 id="upi-payment-title">Pay ₹{upiPayment.amount} by UPI</h2>
          {reservation && <div className={`reservation-timer modal-reservation-timer${reservationTone ? ` ${reservationTone}` : ""}`}><strong>Reserved for {formatReservationTime(remainingSeconds)}</strong><span>{reservationWarning || "Submit payment proof before the timer expires."}</span></div>}
          <p>Scan this QR with any UPI app, complete the payment, then enter the UTR and upload your payment screenshot.</p>
          <img src={upiPayment.qrDataUrl} alt="UPI payment QR code" />
          <dl className="upi-payment-summary">
            <div><dt>Order ID</dt><dd>{upiPayment.orderNumber}</dd></div>
            <div><dt>Product Summary</dt><dd>{upiPayment.productSummary}</dd></div>
            <div><dt>Total Amount</dt><dd>{formatCurrency(upiPayment.amount)}</dd></div>
          </dl>
          <p><strong>{upiPayment.upiId}</strong></p>
          <input value={upiReference} onChange={(event) => setUpiReference(event.target.value)} placeholder="UPI transaction reference / UTR" autoComplete="off" />
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] || null)} />
          <button className="btn btn-primary" disabled={placing} onClick={confirmUpiPayment}>{placing ? "Submitting..." : "Submit Payment Proof"}</button>
          <small>Payment remains pending until an administrator verifies the reference and screenshot.</small>
        </section>
      </div>}
    </main>
  );
}

function resolveImage(url) { return resolveImageUrl(url); }
