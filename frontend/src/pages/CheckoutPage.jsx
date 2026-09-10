import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { useCart } from "../CartContext";
import QRCode from "qrcode";

const emptyAddress = { fullName: "", mobileNumber: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India", isDefault: false };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { refreshCart } = useCart();
  const [summary, setSummary] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [form, setForm] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [upiPayment, setUpiPayment] = useState(null);
  const [upiReference, setUpiReference] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  async function load() {
    setLoading(true);
    try {
      const [summaryResponse, addressResponse] = await Promise.all([api.get("/checkout/summary"), api.get("/addresses")]);
      setSummary(summaryResponse.data);
      const saved = addressResponse.data.addresses || [];
      setAddresses(saved);
      setAddressId(String(saved.find((address) => address.IsDefault)?.AddressId || saved[0]?.AddressId || ""));
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load checkout."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addAddress(event) {
    event.preventDefault();
    try { const response = await api.post("/addresses", form); setAddresses((current) => [response.data.address, ...current]); setAddressId(String(response.data.address.AddressId)); setShowForm(false); setForm(emptyAddress); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to save address."); }
  }

  async function startUpiPayment() {
    setError("");
    try {
      const validation = await api.post("/checkout/validate", { addressId: Number(addressId) });
      if (!validation.data.success) throw new Error("Checkout validation failed.");
      const upiId = import.meta.env.VITE_UPI_ID;
      if (!upiId) throw new Error("UPI payment is not configured. Set VITE_UPI_ID in the frontend environment.");
      const amount = Number(validation.data.grandTotal ?? validation.data.subtotal ?? 0).toFixed(2);
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("Vaishnavi Silk Emporium")}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Order ${idempotencyKey.current}`)}`;
      const qrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 2 });
      setUpiReference("");
      setUpiPayment({ amount, upiId, qrDataUrl });
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
    setPlacing(true); setError("");
    try {
      const formData = new FormData();
      formData.append("addressId", addressId);
      formData.append("paymentMethod", "UPI_MANUAL");
      formData.append("paymentReference", upiReference.trim());
      formData.append("paymentScreenshot", paymentScreenshot);
      const response = await api.post("/orders", formData, { headers: { "Idempotency-Key": idempotencyKey.current } });
      try { await refreshCart(); } catch { /* order was created */ }
      setUpiPayment(null); setPaymentScreenshot(null);
      navigate(`/orders/${response.data.order.OrderId}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create the order after payment.");
    } finally { setPlacing(false); }
  }

  if (loading) return <main className="container section"><p>Loading checkout...</p></main>;
  if (error && !summary) return <main className="container section"><p className="error-text">{error}</p><Link className="btn btn-outline" to="/cart">Back To Cart</Link></main>;
  if (!summary?.items?.length) return <main className="container section"><section className="cart-empty"><h1>Your cart is empty</h1><p>Add products before starting checkout.</p><Link className="btn btn-primary" to="/products">Continue Shopping</Link></section></main>;

  return (
    <main className="container section checkout-page">
      <div className="section-head"><div><p className="eyebrow">Secure order review</p><h1>Checkout</h1></div></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="checkout-layout">
        <section className="checkout-main">
          <article className="checkout-section">
            <div className="checkout-section-heading"><h2>Delivery Address</h2><button className="link-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add Address"}</button></div>
            {addresses.length === 0 && !showForm && <p className="muted">Add a delivery address to continue.</p>}
            {addresses.length > 0 && <div className="address-list">{addresses.map((address) => <label className={`address-option${String(address.AddressId) === addressId ? " selected" : ""}`} key={address.AddressId}><input type="radio" name="address" value={address.AddressId} checked={String(address.AddressId) === addressId} onChange={(event) => setAddressId(event.target.value)} /><span><strong>{address.FullName}</strong><small>{address.AddressLine1}{address.AddressLine2 ? `, ${address.AddressLine2}` : ""}, {address.City}, {address.State} {address.PostalCode}</small><small>{address.MobileNumber}</small></span></label>)}</div>}
            {showForm && <form className="address-form" onSubmit={addAddress}>{Object.entries(emptyAddress).filter(([key]) => key !== "isDefault").map(([key]) => <input key={key} required={!["addressLine2", "country"].includes(key)} placeholder={key.replace(/([A-Z])/g, " $1")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}<label className="checkbox-line"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />Use as default address</label><button className="btn btn-outline">Save Address</button></form>}
          </article>
          <article className="checkout-section">
            <h2>Order Summary</h2>
            {summary.items.map((item) => <div className="checkout-item" key={item.cartItemId}><span>{item.productName} × {item.quantity}</span><strong>{formatCurrency(item.subtotal)}</strong></div>)}
            <div className="cart-total"><span>Grand Total</span><strong>{formatCurrency(summary.grandTotal)}</strong></div>
            <div className="checkout-actions">
              <button className="btn btn-primary" disabled={!addressId || placing} onClick={startUpiPayment}>{placing ? "Processing..." : "Pay with UPI QR"}</button>
            </div>
          </article>
        </section>
      </div>
      {upiPayment && <div className="payment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upi-payment-title"><section className="payment-modal"><button className="link-btn" onClick={() => setUpiPayment(null)}>Close</button><h2 id="upi-payment-title">Pay ₹{upiPayment.amount} by UPI</h2><p>Scan this QR with any UPI app, complete the payment, then enter the UTR and upload your payment screenshot.</p><img src={upiPayment.qrDataUrl} alt="UPI payment QR code" /><p><strong>{upiPayment.upiId}</strong></p><input value={upiReference} onChange={(event) => setUpiReference(event.target.value)} placeholder="UPI transaction reference / UTR" autoComplete="off" /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] || null)} /><button className="btn btn-primary" disabled={placing} onClick={confirmUpiPayment}>{placing ? "Submitting..." : "Submit Payment Proof"}</button><small>Payment remains pending until an administrator verifies the reference and screenshot.</small></section></div>}
    </main>
  );
}
