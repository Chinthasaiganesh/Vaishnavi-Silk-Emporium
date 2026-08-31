import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { useCart } from "../CartContext";

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

  async function placeOrder() {
    setPlacing(true); setError("");
    try { const validation = await api.post("/checkout/validate", { addressId: Number(addressId) }); if (!validation.data.success) throw new Error("Checkout validation failed."); const response = await api.post("/orders", { addressId: Number(addressId) }, { headers: { "Idempotency-Key": idempotencyKey.current } }); try { await refreshCart(); } catch (refreshError) { console.warn("Order placed, but cart refresh failed", { status: refreshError.response?.status || null, response: refreshError.response?.data || null, message: refreshError.message }); } navigate(`/orders/${response.data.order.OrderId}`, { replace: true }); }
    catch (requestError) { const status = requestError.response?.status; const message = status === 401 ? "Your session has expired. Please log in again." : status === 403 ? "You do not have permission to perform this action." : status >= 500 ? "Order creation failed. Please try again." : requestError.response?.data?.message || (!requestError.response ? "Order service is unavailable. Check the API connection and try again." : requestError.message); console.error("Place Order failed", { status: status || null, response: requestError.response?.data || null, message: requestError.message }); setError(message); setPlacing(false); }
  }

  if (loading) return <main className="container section"><p>Loading checkout...</p></main>;
  if (error && !summary) return <main className="container section"><p className="error-text">{error}</p><Link className="btn btn-outline" to="/cart">Back To Cart</Link></main>;
  if (!summary?.items?.length) return <main className="container section"><section className="cart-empty"><h1>Your cart is empty</h1><p>Add products before starting checkout.</p><Link className="btn btn-primary" to="/products">Continue Shopping</Link></section></main>;

  return <main className="container section checkout-page"><div className="section-head"><div><p className="eyebrow">Secure order review</p><h1>Checkout</h1></div></div>{error && <p className="error-text" role="alert">{error}</p>}<div className="checkout-layout"><section className="checkout-main"><article className="checkout-section"><div className="checkout-section-heading"><h2>Delivery Address</h2><button className="link-btn" onClick={() => setShowForm((visible) => !visible)}>{showForm ? "Cancel" : "Add Address"}</button></div>{addresses.length === 0 && !showForm && <p className="muted">Add a delivery address to continue.</p>}{addresses.length > 0 && <div className="address-list">{addresses.map((address) => <label className={`address-option${String(address.AddressId) === addressId ? " selected" : ""}`} key={address.AddressId}><input type="radio" name="address" value={address.AddressId} checked={String(address.AddressId) === addressId} onChange={(event) => setAddressId(event.target.value)} /><span><strong>{address.FullName}</strong><small>{address.AddressLine1}{address.AddressLine2 ? `, ${address.AddressLine2}` : ""}, {address.City}, {address.State} {address.PostalCode}</small><small>{address.MobileNumber}</small></span></label>)}</div>}{showForm && <form className="address-form" onSubmit={addAddress}>{Object.entries(emptyAddress).filter(([key]) => key !== "isDefault").map(([key]) => <input key={key} required={!["addressLine2", "country"].includes(key)} placeholder={key.replace(/([A-Z])/g, " $1")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}<label className="checkbox-line"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />Use as default address</label><button className="btn btn-outline">Save Address</button></form>}</article><article className="checkout-section"><h2>Order Summary</h2>{summary.items.map((item) => <div className="checkout-item" key={item.cartItemId}><span>{item.productName} × {item.quantity}</span><strong>{formatCurrency(item.subtotal)}</strong></div>)}</article></section><aside className="cart-summary checkout-summary"><h2>Price Summary</h2><div><span>Subtotal</span><strong>{formatCurrency(summary.subtotal)}</strong></div><div><span>Shipping</span><strong>{formatCurrency(summary.shipping)}</strong></div><div><span>Discount</span><strong>{formatCurrency(summary.discount)}</strong></div><div className="cart-total"><span>Grand Total</span><strong>{formatCurrency(summary.grandTotal)}</strong></div><button className="btn btn-primary" disabled={!addressId || placing} onClick={placeOrder}>{placing ? "Placing Order..." : "Place Order"}</button><Link className="btn btn-outline" to="/cart">Back To Cart</Link></aside></div></main>;
}
