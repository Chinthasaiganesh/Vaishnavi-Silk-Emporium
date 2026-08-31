import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";

const statuses = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const terminalStatuses = ["CANCELLED", "REFUNDED"];

function prettyStatus(status = "") { return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()); }

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => { api.get(`/orders/${id}`).then((response) => setOrder(response.data.order)).catch((requestError) => setError(requestError.response?.data?.message || "Unable to load order.")); }, [id]);
  if (error) return <main className="container section"><p className="error-text">{error}</p><Link className="btn btn-outline" to="/orders">View Orders</Link></main>;
  if (!order) return <main className="container section"><p>Loading order...</p></main>;
  const canCancel = ["PENDING", "PROCESSING", "PACKED"].includes(order.OrderStatus);
  const isTerminal = terminalStatuses.includes(order.OrderStatus);
  const currentIndex = isTerminal ? 0 : Math.max(statuses.indexOf(order.OrderStatus), 0);
  const progressScale = statuses.length > 1 ? currentIndex / (statuses.length - 1) : 0;
  async function cancelOrder() {
    setCancelling(true); setError(""); setMessage("");
    try { const response = await api.post(`/orders/${order.OrderId}/cancel`, { reason: cancelReason }); setOrder(response.data.order); setMessage(`${response.data.message}. ${response.data.refundMessage}`); setShowCancel(false); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to cancel order."); }
    finally { setCancelling(false); }
  }

  return <main className="container section order-detail"><div className="section-head"><div><p className="eyebrow">Order confirmation</p><h1>{order.OrderStatus === "PENDING" ? "Order Placed Successfully" : "Order Details"}</h1><p>{order.OrderNumber}</p></div>{canCancel && <button className="btn cancel-order-trigger" onClick={() => setShowCancel(true)}>Cancel Order</button>}</div>{message && <p className="success-text">{message}</p>}{error && <p className="error-text">{error}</p>}<div className="order-detail-grid"><section className="checkout-section"><h2>Items</h2>{order.items.map((item) => <div className="checkout-item" key={item.OrderItemId}><span>{item.ProductName} × {item.Quantity}</span><strong>{formatCurrency(item.LineTotal)}</strong></div>)}<div className="order-address"><h2>Delivery Address</h2><p>{order.FullName}<br />{order.AddressLine1}{order.AddressLine2 ? `, ${order.AddressLine2}` : ""}<br />{order.City}, {order.State} {order.PostalCode}<br />{order.MobileNumber}</p></div></section><aside className="cart-summary"><h2>Order Total</h2><div><span>Payment</span><strong>{order.PaymentMethod || "COD"}</strong></div><div><span>Refund</span><strong>{order.RefundStatus || "NOT_APPLICABLE"}</strong></div><div><span>Subtotal</span><strong>{formatCurrency(order.SubTotal)}</strong></div><div><span>Shipping</span><strong>{formatCurrency(order.ShippingAmount || 0)}</strong></div><div><span>Discount</span><strong>{formatCurrency(order.DiscountAmount || 0)}</strong></div><div className="cart-total"><span>Grand Total</span><strong>{formatCurrency(order.GrandTotal)}</strong></div><Link className="btn btn-outline" to="/orders">View Orders</Link><Link className="btn btn-primary" to="/products">Continue Shopping</Link></aside></div><motion.section className={`order-timeline enhanced${isTerminal ? " terminal" : ""}${order.OrderStatus === "DELIVERED" ? " delivered" : ""}`} aria-label="Order status timeline" initial={reducedMotion ? false : { opacity: 0, y: 18 }} animate={reducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><div className="order-timeline-head"><div><h2>Status Timeline</h2><p>{isTerminal ? `Order ${prettyStatus(order.OrderStatus)}` : `Current status: ${prettyStatus(order.OrderStatus)}`}</p></div></div>{isTerminal && <p className="terminal-status-note">This order is no longer moving through fulfillment.</p>}<div className="order-timeline-track"><span className="timeline-rail" aria-hidden="true" /><motion.span className="timeline-progress" aria-hidden="true" initial={reducedMotion ? false : { "--timeline-progress-scale": 0 }} animate={{ "--timeline-progress-scale": isTerminal ? 0 : progressScale }} transition={{ duration: reducedMotion ? 0 : 0.75, ease: "easeOut" }} />{statuses.map((status, index) => { const complete = !isTerminal && index < currentIndex; const current = !isTerminal && index === currentIndex; const deliveredCurrent = current && status === "DELIVERED"; return <motion.div className={`timeline-step${complete ? " complete" : ""}${current ? " current" : ""}${deliveredCurrent ? " delivered-current" : ""}`} key={status} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }} animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, delay: reducedMotion ? 0 : index * 0.07 }}><motion.span className="timeline-marker" aria-hidden="true" whileHover={reducedMotion ? undefined : { scale: 1.08 }}>{complete || deliveredCurrent ? <motion.b initial={reducedMotion ? false : { scale: 0, opacity: 0 }} animate={reducedMotion ? undefined : { scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18, delay: index * 0.07 + 0.12 }}>✓</motion.b> : current ? <i /> : null}</motion.span><strong>{prettyStatus(status)}</strong><small>{current ? "Current step" : complete ? "Completed" : "Upcoming"}</small></motion.div>; })}</div></motion.section>{showCancel && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title"><h2 id="cancel-order-title">Cancel Order?</h2><p>Are you sure you want to cancel this order? This action cannot be undone.</p><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Cancellation reason (optional)" /><div className="form-actions"><button className="btn btn-outline" onClick={() => setShowCancel(false)}>No, Keep Order</button><button className="btn cancel-order-trigger" disabled={cancelling} onClick={cancelOrder}>{cancelling ? "Cancelling..." : "Yes, Cancel Order"}</button></div></section></div>}</main>;
}
