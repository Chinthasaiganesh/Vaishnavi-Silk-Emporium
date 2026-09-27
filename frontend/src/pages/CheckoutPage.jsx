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
import PaymentSessionNotice from "../components/PaymentSessionNotice";

const emptyAddress = { fullName: "", mobileNumber: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India", isDefault: false };
const paymentCacheKey = (reservationId) => `checkout-payment-${reservationId}`;
const checkoutSessionStates = { none: "NO_ACTIVE_SESSION", active: "ACTIVE_SESSION", expired: "EXPIRED_SESSION" };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { refreshCart, releasePaymentSession } = useCart();
  const { notify, confirm } = useNotifier();
  const [summary, setSummary] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [deliveryMobile, setDeliveryMobile] = useState("");
  const [form, setForm] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [sessionState, setSessionState] = useState(checkoutSessionStates.none);
  const [restoredSession, setRestoredSession] = useState(false);
  const [, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [upiPayment, setUpiPayment] = useState(null);
  const [upiReference, setUpiReference] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const reservationSessionId = useRef(localStorage.getItem("checkout-reservation-session") || "");
  const idempotencyKey = useRef(crypto.randomUUID());
  const placingRef = useRef(false);
  const serverClockOffset = useRef(0);
  const announcedReservation = useRef(false);
  const announcedExpiryWarning = useRef(false);

  function formatReservationTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function applyReservation(payload) {
    if (payload?.serverTime) serverClockOffset.current = new Date(payload.serverTime).getTime() - Date.now();
    if (payload?.ReservationId) {
      idempotencyKey.current = payload.ReservationId;
      localStorage.setItem("checkout-reservation-id", payload.ReservationId);
    }
    if (payload?.ReservationSessionId) {
      reservationSessionId.current = payload.ReservationSessionId;
      localStorage.setItem("checkout-reservation-session", payload.ReservationSessionId);
    }
    const stillActive = payload?.ReservationStatus === "ACTIVE"
      && new Date(payload.ExpiresAt).getTime() > (Date.now() + serverClockOffset.current);
    const expired = payload?.ReservationStatus === "EXPIRED"
      || (payload?.ReservationStatus === "ACTIVE" && !stillActive);
    setSessionState(stillActive ? checkoutSessionStates.active : expired ? checkoutSessionStates.expired : checkoutSessionStates.none);
    setRestoredSession((current) => stillActive ? current || restored : false);
    setReservation(payload || null);
    return payload;
  }

  async function reserveCheckout(selectedAddressId) {
    if (!reservationSessionId.current) reservationSessionId.current = crypto.randomUUID();
    const response = await api.post("/checkout/reserve", { addressId: Number(selectedAddressId), sessionId: reservationSessionId.current });
    return applyReservation(response.data.reservation);
  }

  async function load() {
    setLoading(true);
    try {
      const [summaryResponse, addressResponse, cartResponse] = await Promise.all([api.get("/checkout/summary"), api.get("/addresses"), api.get("/cart")]);
      setSummary(summaryResponse.data);
      const saved = addressResponse.data.addresses || [];
      setAddresses(saved);
      const selectedAddressId = String(saved.find((address) => address.IsDefault)?.AddressId || saved[0]?.AddressId || "");
      setAddressId(selectedAddressId);
      const knownReservationId = cartResponse.data.activePaymentSession?.ReservationId
        || localStorage.getItem("checkout-reservation-id");
      if (knownReservationId) {
        try {
          const response = await api.get(`/checkout/reservations/${knownReservationId}`);
          const knownReservation = applyReservation(response.data.reservation, true);
          const deliveryAddressId = String(knownReservation?.AddressId || selectedAddressId);
          if (deliveryAddressId) setAddressId(deliveryAddressId);
          setDeliveryMobile(saved.find((address) => String(address.AddressId) === deliveryAddressId)?.MobileNumber || "");
          if (knownReservation?.ReservationStatus === "ACTIVE" && knownReservation.remainingSeconds > 0) {
            const cachedPayment = sessionStorage.getItem(paymentCacheKey(knownReservation.ReservationId));
            if (cachedPayment) {
              try {
                const savedPayment = JSON.parse(cachedPayment);
                if (savedPayment.reservationId === knownReservation.ReservationId) setUpiPayment(savedPayment);
                else sessionStorage.removeItem(paymentCacheKey(knownReservation.ReservationId));
              } catch {
                sessionStorage.removeItem(paymentCacheKey(knownReservation.ReservationId));
              }
            }
          } else {
            sessionStorage.removeItem(paymentCacheKey(knownReservation.ReservationId));
          }
        } catch (requestError) {
          if (requestError.response?.status !== 404) throw requestError;
          localStorage.removeItem("checkout-reservation-id");
          localStorage.removeItem("checkout-reservation-session");
        }
      } else {
        setDeliveryMobile(saved.find((address) => String(address.AddressId) === selectedAddressId)?.MobileNumber || "");
      }
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load checkout."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (sessionState !== checkoutSessionStates.active || !reservation) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reservation?.ReservationId, sessionState]);

  // The reservation clock is owned by the server, so resync whenever this tab regains focus.
  useEffect(() => {
    if (sessionState !== checkoutSessionStates.active || !reservation?.ReservationId) return undefined;
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
  }, [reservation?.ReservationId, sessionState]);

  const remainingSeconds = reservation?.ReservationStatus === "ACTIVE" ? Math.max(0, Math.ceil((new Date(reservation.ExpiresAt).getTime() - (Date.now() + serverClockOffset.current)) / 1000)) : 0;
  const hasActivePaymentSession = sessionState === checkoutSessionStates.active
    && reservation?.ReservationStatus === "ACTIVE"
    && remainingSeconds > 0;

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
    if (!reservation || placing || placingRef.current || reservation.ReservationStatus !== "ACTIVE") return;
    const expired = reservation.ReservationStatus === "EXPIRED"
      || (reservation.ReservationStatus === "ACTIVE" && remainingSeconds <= 0);
    if (!expired) return;
    setReservation((current) => current ? { ...current, ReservationStatus: "EXPIRED" } : current);
    setSessionState(checkoutSessionStates.expired);
    sessionStorage.removeItem(paymentCacheKey(reservation.ReservationId));
    setUpiPayment(null);
    api.get(`/checkout/reservations/${reservation.ReservationId}`).then((response) => applyReservation(response.data.reservation)).catch(() => undefined);
  }, [reservation, remainingSeconds, placing]);

  const reservationTone = remainingSeconds <= 30 ? "critical" : remainingSeconds <= 60 ? "urgent" : remainingSeconds <= 120 ? "warning" : "";
  const reservationWarning = remainingSeconds <= 30 ? "Final moments! Submit your payment proof now or the items will be released." : remainingSeconds <= 60 ? "Less than one minute remaining to complete payment." : remainingSeconds <= 120 ? "Hurry! Your reservation will expire soon." : "";

  function addressToForm(address) {
    return { fullName: address.FullName, mobileNumber: address.MobileNumber, addressLine1: address.AddressLine1, addressLine2: address.AddressLine2 || "", city: address.City, state: address.State, postalCode: address.PostalCode, country: address.Country || "India", isDefault: Boolean(address.IsDefault) };
  }

  async function saveDeliveryMobile() {
    const selectedAddress = addresses.find((address) => String(address.AddressId) === addressId);
    if (!selectedAddress) throw new Error("Select a delivery address before continuing.");
    const mobileNumber = deliveryMobile.trim();
    if (!/^[0-9+() -]{7,20}$/.test(mobileNumber)) throw new Error("Enter a valid delivery mobile number.");
    if (mobileNumber === selectedAddress.MobileNumber) return;
    const response = await api.put(`/addresses/${selectedAddress.AddressId}`, { ...addressToForm(selectedAddress), mobileNumber });
    setAddresses((current) => current.map((address) => address.AddressId === selectedAddress.AddressId ? response.data.address : address));
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
      setDeliveryMobile(savedAddress.MobileNumber);
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
      if (String(address.AddressId) === addressId) {
        setAddressId(String(remaining[0]?.AddressId || ""));
        setDeliveryMobile(remaining[0]?.MobileNumber || "");
      }
      if (editingAddressId === address.AddressId) cancelAddressForm();
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to delete address."); }
  }

  async function startUpiPayment() {
    setError("");
    try {
      await saveDeliveryMobile();
      const reservationIsActive = hasActivePaymentSession
        && new Date(reservation.ExpiresAt).getTime() > Date.now() + serverClockOffset.current;
      if (!reservationIsActive) {
        reservationSessionId.current = crypto.randomUUID();
        announcedReservation.current = false;
        announcedExpiryWarning.current = false;
        setRestoredSession(false);
        localStorage.removeItem("checkout-reservation-id");
        localStorage.setItem("checkout-reservation-session", reservationSessionId.current);
      }
      const activeReservation = reservationIsActive ? reservation : await reserveCheckout(addressId);
      if (upiPayment?.reservationId === activeReservation.ReservationId) return;
      const cachedPayment = sessionStorage.getItem(paymentCacheKey(activeReservation.ReservationId));
      if (cachedPayment) {
        const savedPayment = JSON.parse(cachedPayment);
        if (savedPayment.reservationId === activeReservation.ReservationId) {
          setUpiPayment(savedPayment);
          return;
        }
      }
      const upiId = import.meta.env.VITE_UPI_ID;
      if (!upiId) throw new Error("UPI payment is not configured. Set VITE_UPI_ID in the frontend environment.");
      const amount = activeReservation.items.reduce((total, item) => total + Number(item.UnitPrice) * Number(item.Quantity), 0).toFixed(2);
      idempotencyKey.current = activeReservation.ReservationId;
      const orderNumber = getCheckoutOrderNumber(activeReservation.ReservationId);
      const transactionNote = buildUpiTransactionNote(orderNumber, activeReservation.items);
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("Vaishnavi Silk Emporium")}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
      const qrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 2 });
      setUpiReference("");
      const payment = { amount, upiId, qrDataUrl, orderNumber, productSummary: summarizeCheckoutProducts(activeReservation.items), reservationId: activeReservation.ReservationId };
      sessionStorage.setItem(paymentCacheKey(activeReservation.ReservationId), JSON.stringify(payment));
      setUpiPayment(payment);
    } catch (err) {
      console.error("UPI payment initialization failed.", { statusCode: err.response?.status || null, diagnosticCode: err.response?.data?.diagnosticCode || err.response?.data?.code || null });
      setError(err.response?.data?.message || err.message || "Payment initialization failed.");
    }
  }

  async function cancelPaymentSession() {
    if (!reservation?.ReservationId) return;
    const confirmed = await confirm({ variant: "warning", icon: "alert", eyebrow: "Payment in progress", title: "Cancel Payment Session?", message: "Your reserved items will be released and the QR will no longer match checkout. Do not cancel if you have already sent the payment.", confirmLabel: "Cancel Session", cancelLabel: "Continue Payment" });
    if (!confirmed) return;
    try {
      await releasePaymentSession(reservation.ReservationId);
      setSessionState(checkoutSessionStates.none);
      setRestoredSession(false);
      setReservation(null);
      setUpiPayment(null);
      setPaymentScreenshot(null);
      navigate("/cart", { replace: true, state: { notice: "PAYMENT_SESSION_CANCELLED" } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to cancel the payment session.");
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
      await saveDeliveryMobile();
      const formData = new FormData();
      formData.append("addressId", addressId);
      formData.append("paymentMethod", "UPI_MANUAL");
      formData.append("paymentReference", upiReference.trim());
      formData.append("paymentScreenshot", paymentScreenshot);
      const response = await api.post("/orders", formData, { headers: { "Idempotency-Key": idempotencyKey.current, "Checkout-Reservation-Id": reservation.ReservationId } });
      localStorage.removeItem("checkout-reservation-session");
      localStorage.removeItem("checkout-reservation-id");
      sessionStorage.removeItem(paymentCacheKey(reservation.ReservationId));
      setSessionState(checkoutSessionStates.none);
      setReservation(null);
      setUpiPayment(null); setPaymentScreenshot(null);
      try { await refreshCart(); } catch { /* order was created */ }
      const orderReference = response.data.order.OrderNumber || response.data.order.OrderId;
      notify(buildNotification("ORDER_PLACED", { dismissible: false, primaryAction: { label: "View Order", to: `/orders/${response.data.order.OrderId}`, navigateOptions: { replace: true } }, footnote: `Order ID: #${orderReference}` }));
    } catch (requestError) {
      if (["RESERVATION_EXPIRED"].includes(requestError.response?.data?.code || requestError.response?.data?.diagnosticCode)) {
        sessionStorage.removeItem(paymentCacheKey(reservation.ReservationId));
        setReservation((current) => current ? { ...current, ReservationStatus: "EXPIRED" } : current);
        setSessionState(checkoutSessionStates.expired);
        setUpiPayment(null);
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
      {hasActivePaymentSession && <PaymentSessionNotice session={reservation} title={restoredSession ? "Active Payment Session Found" : "Payment Session Active"} description={restoredSession ? "You have an ongoing payment session." : "Your items are reserved for this checkout."} warning={reservationWarning} onContinue={startUpiPayment} onCancel={cancelPaymentSession} />}
      {sessionState === checkoutSessionStates.expired && <div className="reservation-timer warning" role="status"><strong>Payment Session Expired</strong><span>The reserved items have been released. Start a new payment session to continue.</span></div>}
      <div className="checkout-layout">
        <section className="checkout-main">
          <article className="checkout-section">
            <div className="checkout-section-heading"><h2>Delivery Address</h2><button className="link-btn" disabled={reservation?.ReservationStatus === "ACTIVE" && !showForm} onClick={showForm ? cancelAddressForm : startAddAddress}>{showForm ? "Cancel" : "Add Address"}</button></div>
            {addresses.length === 0 && !showForm && <p className="muted">Add a delivery address to continue.</p>}
            {addresses.length > 0 && <div className="address-list">{addresses.map((address) => <div className={`address-option${String(address.AddressId) === addressId ? " selected" : ""}`} key={address.AddressId}><label className="address-select"><input type="radio" name="address" value={address.AddressId} checked={String(address.AddressId) === addressId} disabled={reservation?.ReservationStatus === "ACTIVE" && String(address.AddressId) !== String(reservation.AddressId)} onChange={() => { setAddressId(String(address.AddressId)); setDeliveryMobile(address.MobileNumber || ""); }} /><span><strong>{address.FullName}</strong><small>{address.AddressLine1}{address.AddressLine2 ? `, ${address.AddressLine2}` : ""}, {address.City}, {address.State} {address.PostalCode}</small><small>{address.MobileNumber}</small></span></label><div className="address-actions"><button type="button" className="link-btn" disabled={reservation?.ReservationStatus === "ACTIVE" && String(address.AddressId) !== String(reservation.AddressId)} onClick={() => startEditAddress(address)}>Edit</button><button type="button" className="link-btn danger-link" disabled={reservation?.ReservationStatus === "ACTIVE"} onClick={() => removeAddress(address)}>Delete</button></div></div>)}</div>}
            {addresses.length > 0 && !showForm && <label className="address-form">Delivery mobile number<input type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} value={deliveryMobile} onChange={(event) => setDeliveryMobile(event.target.value)} /></label>}
              {showForm && <form className="address-form" onSubmit={saveAddress}>{Object.entries(emptyAddress).filter(([key]) => key !== "isDefault" && key !== "mobileNumber").map(([key]) => <input key={key} required={!['addressLine2', 'country'].includes(key)} placeholder={key.replace(/([A-Z])/g, " $1")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}<label>Delivery mobile number<input type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} value={form.mobileNumber} onChange={(event) => setForm({ ...form, mobileNumber: event.target.value })} /></label><label className="checkbox-line"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />Use as default address</label><button className="btn btn-outline">{editingAddressId ? "Update Address" : "Save Address"}</button></form>}
          </article>
        </section>
        <aside className="checkout-summary-panel">
          <article className="checkout-section checkout-summary-card">
            <div className="checkout-section-heading"><h2>Order Summary</h2><Link className="link-btn" to="/cart">Edit cart</Link></div>
            <div className="checkout-summary-items">{summary.items.map((item) => <div className="checkout-item checkout-item-detailed" key={item.cartItemId}><img className="checkout-item-image" src={resolveImage(item.imageUrl)} alt="" /><div><strong>{item.productName}</strong><span>{item.quantity} × {formatCurrency(item.unitPrice)}</span><small>{item.discountPercentage > 0 ? `${formatCurrency(item.originalPrice)} original · Save ${formatCurrency((item.originalPrice - item.unitPrice) * item.quantity)} · -${item.discountPercentage}% discount` : "Regular price"}</small></div><strong>{formatCurrency(item.subtotal)}</strong></div>)}</div>
            <div className="checkout-price-breakdown"><div><span>Original price</span><strong>{formatCurrency(summary.originalSubtotal ?? summary.items.reduce((total, item) => total + item.originalPrice * item.quantity, 0))}</strong></div><div><span>Discount</span><strong className="checkout-savings">-{formatCurrency(summary.discount)}</strong></div><div><span>Delivery</span><strong>Free</strong></div><div className="checkout-grand-total"><span>Final payable</span><strong>{formatCurrency(summary.grandTotal)}</strong></div></div>
            {Number(summary.discount) > 0 && <div className="order-savings-callout"><strong>You save {formatCurrency(summary.discount)} on this order</strong><span>Discounts are locked in at checkout.</span></div>}
            <div className="checkout-trust"><span aria-hidden="true">✓</span><div><strong>Secure checkout</strong><small>Safe UPI payment and order protection.</small></div></div>
            {!hasActivePaymentSession && <button className="btn btn-primary checkout-pay-button" disabled={!addressId || placing} onClick={startUpiPayment}>{placing ? "Processing..." : sessionState === checkoutSessionStates.expired ? "Start New Payment Session" : "Start Payment"}</button>}
          </article>
        </aside>
      </div>
      {upiPayment && <div className="payment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upi-payment-title" tabIndex={-1}>
        <section className="payment-modal">
          <button className="link-btn" onClick={() => setUpiPayment(null)}>Close</button>
          <h2 id="upi-payment-title">Pay ₹{upiPayment.amount} by UPI</h2>
          {hasActivePaymentSession && <div className={`reservation-timer modal-reservation-timer${reservationTone ? ` ${reservationTone}` : ""}`}><strong>Reserved for {formatReservationTime(remainingSeconds)}</strong><span>{reservationWarning || "Submit payment proof before the timer expires."}</span></div>}
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
