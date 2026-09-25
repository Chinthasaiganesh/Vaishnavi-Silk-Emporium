import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "../api";
import { useNotifier } from "../NotifierContext";
import { buildNotification } from "../utils/notificationPresets";
import { formatCurrency } from "../utils/currency";
import { resolveImageUrl } from "../utils/image";

const terminalStatuses = ["CANCELLED", "REFUNDED"];

function prettyStatus(status = "") {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
function getTimelineSteps(order) {
  const lifecycle = (order.lifecycle || []).map((event) => ({
    key: `lifecycle-${event.LifecycleEventId}`,
    type: event.EventType,
    label: event.Title || prettyStatus(event.EventType),
    date: event.EventDate,
    description: event.Description || "",
    actorRole: event.ActorRole
  }));
  const recordedTypes = new Set(lifecycle.map((event) => event.type));
  const fallbackEvents = [];
  const addFallback = (type, label, date, description) => {
    if (date && !recordedTypes.has(type)) fallbackEvents.push({ key: `legacy-${type}`, type, label, date, description });
  };

  addFallback("ORDER_PLACED", "Order Placed", order.CreatedDate, "Your order was created successfully.");
  addFallback("PAYMENT_SUBMITTED", "Payment Submitted", order.PaymentSubmittedAt, "Payment details received for verification.");
  if (order.PaymentStatus === "VERIFIED") addFallback("PAYMENT_VERIFIED", "Payment Verified", order.PaymentReviewedAt, "Your payment was verified successfully.");
  if (order.PaymentStatus === "REJECTED") addFallback("PAYMENT_REJECTED", "Payment Verification Failed", order.PaymentReviewedAt, order.PaymentRejectionReason || "Payment verification failed.");

  const statusDetails = {
    PROCESSING: ["Processing", "Your order is being prepared."],
    PACKED: ["Packed", "Your order is packed and ready to ship."],
    SHIPPED: ["Shipped", "Your order is on its way."],
    OUT_FOR_DELIVERY: ["Out For Delivery", "Your order is with the delivery partner."],
    DELIVERED: ["Delivered", "Your order was delivered."],
    CANCELLED: ["Order Cancelled", order.CancellationReason || "The order was cancelled."],
    REFUNDED: ["Refund Completed", "Your refund was completed."]
  };
  for (const entry of order.history || []) {
    const details = statusDetails[entry.NewStatus];
    if (details) addFallback(entry.NewStatus, details[0], entry.ChangedAt, details[1]);
  }
  addFallback("REFUND_INITIATED", "Refund Initiated", order.RefundInitiatedAt, "Your refund case was opened.");
  addFallback("REFUND_IN_PROGRESS", "Refund Processing", order.RefundProcessingAt, "Your refund is being processed.");
  addFallback("REFUNDED", "Refund Completed", order.RefundCompletedAt, "Your refund was completed.");

  return [...lifecycle, ...fallbackEvents]
    .sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
    .map((event) => {
      const cancelled = event.type === "CANCELLED";
      const failed = cancelled || event.type === "PAYMENT_REJECTED" || event.type === "REFUND_FAILED";
      const actor = event.actorRole === "ADMIN" ? "Admin" : event.actorRole === "CUSTOMER" ? "Customer" : "";
      return {
        ...event,
        label: cancelled && actor ? `Cancelled by ${actor}` : event.label,
        description: cancelled ? order.CancellationReason || event.description : event.description,
        complete: true,
        cancelled,
        failed
      };
    });
}
function refundLabel(order) {
  if (order.PaymentMethod === "COD") return "Not applicable";
  if (order.RefundStatus === "PENDING" && order.PaymentStatus !== "VERIFIED") return "Awaiting payment verification";
  if (order.RefundStatus === "PENDING") return "Refund pending";
  if (order.RefundStatus === "PROCESSING") return "Refund processing";
  if (order.RefundStatus === "COMPLETED") return "Refund completed";
  if (order.RefundStatus === "FAILED") return "Refund needs review";
  if (order.RefundStatus === "NOT_APPLICABLE" && ["PENDING", "PROCESSING", "PACKED"].includes(order.OrderStatus)) {
    if (order.PaymentStatus === "VERIFIED") return "Refund available on cancellation";
    // Payment submitted but not yet reviewed by admin: refund becomes applicable once verified.
    if (order.PaymentStatus === "PENDING") return "Applicable after payment verification";
  }
  return "Not applicable";
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const reducedMotion = useReducedMotion();
  const { notify } = useNotifier();
  useEffect(() => {
    api
      .get(`/orders/${id}`)
      .then((response) => setOrder(response.data.order))
      .catch((requestError) =>
        setError(
          requestError.response?.data?.message || "Unable to load order.",
        ),
      );
  }, [id]);
  useEffect(() => {
    if (!order) return;
    const preset = order.PaymentStatus === "VERIFIED" ? "PAYMENT_APPROVED"
      : order.PaymentStatus === "REJECTED" && order.OrderStatus !== "CANCELLED" ? "PAYMENT_REJECTED"
        : order.OrderStatus === "SHIPPED" ? "ORDER_SHIPPED"
          : order.OrderStatus === "PACKED" ? "ORDER_PACKED"
            : null;
    if (!preset) return;
    // Announce each status transition once per browser session rather than on every visit.
    const storageKey = `order-notice-${order.OrderId}`;
    const signature = `${order.PaymentStatus}:${order.OrderStatus}`;
    if (window.sessionStorage.getItem(storageKey) === signature) return;
    window.sessionStorage.setItem(storageKey, signature);
    notify(buildNotification(preset, {
      detail: preset === "PAYMENT_REJECTED" && order.PaymentRejectionReason ? `Reason: ${order.PaymentRejectionReason}` : undefined,
      primaryAction: preset === "PAYMENT_REJECTED"
        ? { onClick: () => document.getElementById("payment-reference")?.focus() }
        : { label: "Got it" }
    }));
  }, [order?.OrderId, order?.PaymentStatus, order?.OrderStatus, notify]);
  if (error)
    return (
      <main className="container section">
        <p className="error-text">{error}</p>
        <Link className="btn btn-outline" to="/orders">
          View Orders
        </Link>
      </main>
    );
  if (!order)
    return (
      <main className="container section">
        <p>Loading order...</p>
      </main>
    );
  const canCancel = ["PENDING", "PROCESSING", "PACKED"].includes(
    order.OrderStatus,
  );
  const isTerminal = terminalStatuses.includes(order.OrderStatus);
  const timelineSteps = getTimelineSteps(order);
  async function cancelOrder() {
    setCancelling(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/orders/${order.OrderId}/cancel`, {
        reason: cancelReason,
      });
      setOrder(response.data.order);
      setMessage(`${response.data.message}. ${response.data.refundMessage}`);
      setShowCancel(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Unable to cancel order.",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function resubmitPayment(event) {
    event.preventDefault();
    if (!paymentScreenshot) {
      setError("Upload your payment screenshot before submitting.");
      return;
    }
    setSubmittingPayment(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("paymentReference", paymentReference.trim());
      formData.append("paymentScreenshot", paymentScreenshot);
      const response = await api.post(`/orders/${order.OrderId}/payment-proof`, formData);
      setOrder(response.data.order);
      setPaymentReference("");
      setPaymentScreenshot(null);
      setMessage(response.data.message);
      notify(buildNotification("PAYMENT_SUBMITTED", { primaryAction: { label: "Got it" } }));
      window.dispatchEvent(new CustomEvent("notifications:changed"));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to submit payment proof.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  return (
    <main className="container section order-detail">
      <div className="section-head">
        <div>
          <p className="eyebrow">Order confirmation</p>
          <h1>
            {order.OrderStatus === "PENDING"
              ? "Order Placed Successfully"
              : "Order Details"}
          </h1>
          <p>{order.OrderNumber}</p>
        </div>
        {canCancel && (
          <button
            className="btn cancel-order-trigger"
            onClick={() => setShowCancel(true)}
          >
            Cancel Order
          </button>
        )}
      </div>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="order-detail-grid">
        <section className="checkout-section">
          <h2>Items</h2>
          {(order.items || []).map((item) => (
            <div className="checkout-item" key={item.OrderItemId}>
              <img className="order-item-image" src={resolveImage(item.ImageUrl)} alt="" /><span className="order-item-pricing"><strong>{item.ProductName} × {item.Quantity}</strong><small>{formatCurrency(item.OriginalPrice || item.ProductPrice)} original · {formatCurrency(item.DiscountedPrice || item.ProductPrice)} selling price · Save {formatCurrency(item.SavingsAmount || 0)} ({Number(item.DiscountPercentage || 0).toFixed(0)}%)</small></span>
              <strong>{formatCurrency(item.LineTotal)}</strong>
            </div>
          ))}
          <div className="order-address">
            <h2>Delivery Address</h2>
            <p>
              {order.FullName}
              <br />
              {order.AddressLine1}
              {order.AddressLine2 ? `, ${order.AddressLine2}` : ""}
              <br />
              {order.City}, {order.State} {order.PostalCode}
              <br />
              {order.MobileNumber}
            </p>
          </div>
        </section>
        <aside className="cart-summary">
          <h2>Order Total</h2>
          <div>
            <span>Payment</span>
            <strong>{order.PaymentStatus === "PENDING" ? "Under Review" : prettyStatus(order.PaymentStatus)}</strong>
          </div>
          {order.PaymentStatus === "REJECTED" && <div className="payment-status-rejected"><span>Reason</span><strong>{order.PaymentRejectionReason}</strong></div>}
          <div className="refund-summary-row">
            <span>Refund</span>
            <strong>{refundLabel(order)}</strong>
          </div>
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(order.SubTotal)}</strong>
          </div>
          <div>
            <span>Shipping</span>
            <strong>{formatCurrency(order.ShippingAmount || 0)}</strong>
          </div>
          <div>
            <span>Discount</span>
            <strong>{formatCurrency(order.DiscountAmount || 0)}</strong>
          </div>
          <div className="cart-total">
            <span>Grand Total</span>
            <strong>{formatCurrency(order.GrandTotal)}</strong>
          </div>
          {Number(order.DiscountAmount) > 0 && <div className="order-savings-callout"><strong>You saved {formatCurrency(order.DiscountAmount)}</strong><span>Discount captured at checkout</span></div>}
          <Link className="btn btn-outline" to="/orders">
            View Orders
          </Link>
          <Link className="btn btn-primary" to="/products">
            Continue Shopping
          </Link>
        </aside>
      </div>
      <motion.section
        className={`order-timeline enhanced${isTerminal ? " terminal" : ""}${order.OrderStatus === "DELIVERED" ? " delivered" : ""}`}
        aria-label="Order status timeline"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="order-timeline-head">
          <div>
            <h2>Status Timeline</h2>
            <p>
              {isTerminal
                ? `Order ${prettyStatus(order.OrderStatus)}`
                : order.PaymentStatus === "REJECTED"
                  ? "Current status: Payment Verification Failed"
                  : order.PaymentStatus === "PENDING"
                    ? "Current status: Payment Under Review"
                    : `Current status: ${prettyStatus(order.OrderStatus)}`}
            </p>
          </div>
        </div>
        {isTerminal && (
          <p className="terminal-status-note">
            This order is no longer moving through fulfillment.
          </p>
        )}
        <div className="order-timeline-track" style={{ "--timeline-columns": timelineSteps.length }}>
          {timelineSteps.map((step, index) => {
            const latest = index === timelineSteps.length - 1;
            return (
              <motion.div
                className={`timeline-step complete${latest ? " latest" : ""}${step.failed ? " failed" : ""}`}
                key={step.key}
                initial={
                  reducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }
                }
                animate={
                  reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
                }
                transition={{
                  duration: 0.3,
                  delay: reducedMotion ? 0 : index * 0.07,
                }}
              >
                <motion.span
                  className="timeline-marker"
                  aria-hidden="true"
                  whileHover={reducedMotion ? undefined : { scale: 1.08 }}
                >
                  <motion.b
                    initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
                    animate={reducedMotion ? undefined : { scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 18, delay: index * 0.07 + 0.12 }}
                  >
                    {step.cancelled ? "×" : "✓"}
                  </motion.b>
                </motion.span>
                <strong>{step.label}</strong>
                <small>{new Date(step.date).toLocaleString()}</small>
                <span className="timeline-description">{step.description}</span>
              </motion.div>
            );
          })}
        </div>
      </motion.section>
      {order.CancelledAt && <section className="lifecycle-detail cancellation-detail" aria-labelledby="cancellation-title"><div><p className="eyebrow">Order closed</p><h2 id="cancellation-title">Order Cancelled</h2></div><dl><dt>Cancelled By</dt><dd>{order.CancelledByRole === "ADMIN" ? "Admin" : order.CancelledByRole === "CUSTOMER" ? "Customer" : "Not recorded"}</dd><dt>Cancellation Reason</dt><dd>{order.CancellationReason || "No reason provided"}</dd><dt>Cancellation Date</dt><dd>{new Date(order.CancelledAt).toLocaleString()}</dd></dl></section>}
      {order.RefundStatus !== "NOT_APPLICABLE" && <section className="lifecycle-detail refund-detail" aria-labelledby="refund-detail-title"><div><p className="eyebrow">Money movement</p><h2 id="refund-detail-title">Refund Details</h2></div><dl><dt>Current Status</dt><dd>{refundLabel(order)}</dd>{order.RefundReference && <><dt>Refund Reference</dt><dd>{order.RefundReference}</dd></>}{order.RefundStatus === "PENDING" && order.PaymentStatus !== "VERIFIED" && <><dt>Next Action</dt><dd>Processing will start after the submitted payment is verified.</dd></>}</dl></section>}
      {order.PaymentStatus === "REJECTED" && order.OrderStatus !== "CANCELLED" && (
        <section className="checkout-section payment-resubmission" aria-labelledby="payment-resubmission-title">
          <p className="eyebrow">Action required</p>
          <h2 id="payment-resubmission-title">Payment Verification Failed</h2>
          <p><strong>Reason:</strong> {order.PaymentRejectionReason}</p>
          <p>Please re-submit your payment details or contact support.</p>
          <form onSubmit={resubmitPayment}>
            <label htmlFor="payment-reference">UPI transaction reference / UTR</label>
            <input id="payment-reference" required pattern="[A-Za-z0-9][A-Za-z0-9._/-]{5,63}" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
            <label htmlFor="payment-screenshot">Payment screenshot</label>
            <input id="payment-screenshot" required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] || null)} />
            <button className="btn btn-primary" disabled={submittingPayment}>{submittingPayment ? "Submitting..." : "Re-submit Payment Details"}</button>
          </form>
        </section>
      )}
      {showCancel && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
          >
            <h2 id="cancel-order-title">Cancel Order?</h2>
            <p>
              Are you sure you want to cancel this order? This action cannot be
              undone.
            </p>
            <textarea
              required
              minLength="3"
              maxLength="300"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Cancellation reason"
            />
            <div className="form-actions">
              <button
                className="btn btn-outline"
                onClick={() => setShowCancel(false)}
              >
                No, Keep Order
              </button>
              <button
                className="btn cancel-order-trigger"
                disabled={cancelling || cancelReason.trim().length < 3}
                onClick={cancelOrder}
              >
                {cancelling ? "Cancelling..." : "Yes, Cancel Order"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function resolveImage(url) { return resolveImageUrl(url); }
