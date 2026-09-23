import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { resolveImageUrl } from "../utils/image";

const terminalStatuses = ["CANCELLED", "REFUNDED"];
const fulfillmentRanks = { PENDING: 0, PROCESSING: 1, PACKED: 2, SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5 };

function prettyStatus(status = "") {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
function historyDate(order, status) {
  return order.history?.find((entry) => entry.NewStatus === status)?.ChangedAt || null;
}

function lifecycleEvent(order, type) {
  return [...(order.lifecycle || [])].reverse().find((event) => event.EventType === type);
}

function getTimelineSteps(order) {
  const rank = fulfillmentRanks[order.OrderStatus] ?? 0;
  const paymentVerified = order.PaymentStatus === "VERIFIED";
  const definitions = [
    ["ORDER_PLACED", "Order Placed", true, order.CreatedDate, "Your order was created successfully."],
    ["PAYMENT_SUBMITTED", "Payment Submitted", Boolean(order.PaymentSubmittedAt || order.PaymentReference), order.PaymentSubmittedAt || (order.PaymentReference ? order.CreatedDate : null), "Payment details received for verification."],
    ["PAYMENT_VERIFIED", "Payment Verified", paymentVerified, order.PaymentReviewedAt, "Your payment was verified successfully."],
    ["ORDER_CONFIRMED", "Order Confirmed", paymentVerified && rank >= fulfillmentRanks.PROCESSING, historyDate(order, "PROCESSING") || order.PaymentReviewedAt, "Your order is confirmed."],
    ["PROCESSING", "Processing", rank >= fulfillmentRanks.PROCESSING, historyDate(order, "PROCESSING"), "Your order is being prepared."],
    ["PACKED", "Packed", rank >= fulfillmentRanks.PACKED, historyDate(order, "PACKED"), "Your order is packed and ready to ship."],
    ["SHIPPED", "Shipped", rank >= fulfillmentRanks.SHIPPED, historyDate(order, "SHIPPED"), "Your order is on its way."],
    ["OUT_FOR_DELIVERY", "Out For Delivery", rank >= fulfillmentRanks.OUT_FOR_DELIVERY, historyDate(order, "OUT_FOR_DELIVERY"), "Your order is with the delivery partner."],
    ["DELIVERED", "Delivered", order.OrderStatus === "DELIVERED", historyDate(order, "DELIVERED"), "Your order was delivered."],
  ];
  const steps = definitions.map(([key, label, complete, fallbackDate, description]) => {
    const event = lifecycleEvent(order, key);
    return { key, label, complete: Boolean(event || complete || fallbackDate), date: event?.EventDate || fallbackDate, description: event?.Description || description, failed: key === "PAYMENT_VERIFIED" && order.PaymentStatus === "REJECTED" };
  });
  if (!order.CancelledAt) return steps;

  const event = lifecycleEvent(order, "CANCELLED");
  const actor = order.CancelledByRole === "ADMIN" ? "Admin" : order.CancelledByRole === "CUSTOMER" ? "Customer" : "Unknown actor";
  const cancellationStep = { key: "CANCELLED", label: `Cancelled by ${actor}`, complete: true, cancelled: true, failed: true, date: event?.EventDate || order.CancelledAt, description: order.CancellationReason || event?.Description || "No cancellation reason provided." };
  const cancelledAt = new Date(order.CancelledAt).getTime();
  const completedBeforeCancellation = steps.filter((step) => step.complete && (!step.date || new Date(step.date).getTime() <= cancelledAt));
  return [...completedBeforeCancellation, cancellationStep];
}

function getRefundSteps(order) {
  const definitions = [
    ["REFUND_INITIATED", "Refund Initiated", ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(order.RefundStatus), order.RefundInitiatedAt, "Your refund request has been accepted."],
    ["REFUND_IN_PROGRESS", "Refund Processing", ["PROCESSING", "COMPLETED"].includes(order.RefundStatus), order.RefundProcessingAt, "Your refund is being processed."],
    ["REFUNDED", "Refund Completed", order.RefundStatus === "COMPLETED", order.RefundCompletedAt, "Your refund has been successfully processed."],
  ];
  return definitions.map(([key, label, complete, fallbackDate, description]) => {
    const event = lifecycleEvent(order, key);
    return { key, label, complete: Boolean(event || complete), date: event?.EventDate || fallbackDate, description: event?.Description || description };
  });
}
function refundLabel(order) {
  if (order.PaymentMethod === "COD") return "Not applicable";
  if (order.RefundStatus === "PENDING" && order.PaymentStatus !== "VERIFIED") return "Awaiting payment verification";
  if (order.RefundStatus === "PENDING") return "Refund pending";
  if (order.RefundStatus === "PROCESSING") return "Refund processing";
  if (order.RefundStatus === "COMPLETED") return "Refund completed";
  if (order.RefundStatus === "FAILED") return "Refund needs review";
  if (
    order.RefundStatus === "NOT_APPLICABLE" &&
    order.PaymentStatus === "VERIFIED" &&
    ["PENDING", "PROCESSING", "PACKED"].includes(order.OrderStatus)
  )
    return "Refund available on cancellation";
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
  const refundSteps = getRefundSteps(order);
  const firstIncompleteIndex = timelineSteps.findIndex((step) => !step.complete);
  const currentIndex = isTerminal ? -1 : firstIncompleteIndex === -1 ? timelineSteps.length - 1 : firstIncompleteIndex;
  const completedCount = timelineSteps.filter((step) => step.complete).length;
  const progressScale =
    timelineSteps.length > 1
      ? Math.max(completedCount - 1, 0) / (timelineSteps.length - 1)
      : 0;
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
          <div>
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
        <div className="order-timeline-track">
          <span className="timeline-rail" aria-hidden="true" />
          <motion.span
            className="timeline-progress"
            aria-hidden="true"
            initial={reducedMotion ? false : { "--timeline-progress-scale": 0 }}
            animate={{
              "--timeline-progress-scale": progressScale,
            }}
            transition={{ duration: reducedMotion ? 0 : 0.75, ease: "easeOut" }}
          />
          {timelineSteps.map((step, index) => {
            const complete = step.complete;
            const current = !isTerminal && index === currentIndex;
            const deliveredCurrent = current && step.key === "DELIVERED";
            return (
              <motion.div
                className={`timeline-step${complete ? " complete" : ""}${current ? " current" : ""}${step.failed ? " failed" : ""}${deliveredCurrent ? " delivered-current" : ""}`}
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
                  {complete || deliveredCurrent ? (
                    <motion.b
                      initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
                      animate={
                        reducedMotion ? undefined : { scale: 1, opacity: 1 }
                      }
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 18,
                        delay: index * 0.07 + 0.12,
                      }}
                    >
                      {step.cancelled ? "×" : "✓"}
                    </motion.b>
                  ) : current ? (
                    <i />
                  ) : null}
                </motion.span>
                <strong>{step.label}</strong>
                <small>
                  {step.failed ? "Verification failed" : step.date ? new Date(step.date).toLocaleString() : step.complete ? "Completed · Date unavailable" : current ? "Current step" : "Upcoming"}
                </small>
                <span className="timeline-description">{step.description}</span>
              </motion.div>
            );
          })}
        </div>
      </motion.section>
      {order.CancelledAt && <section className="lifecycle-detail cancellation-detail" aria-labelledby="cancellation-title"><div><p className="eyebrow">Order closed</p><h2 id="cancellation-title">Order Cancelled</h2></div><dl><dt>Cancelled By</dt><dd>{order.CancelledByRole === "ADMIN" ? "Admin" : order.CancelledByRole === "CUSTOMER" ? "Customer" : "Not recorded"}</dd><dt>Cancellation Reason</dt><dd>{order.CancellationReason || "No reason provided"}</dd><dt>Cancellation Date</dt><dd>{new Date(order.CancelledAt).toLocaleString()}</dd></dl></section>}
      {order.RefundStatus !== "NOT_APPLICABLE" && <section className="refund-timeline" aria-labelledby="refund-timeline-title"><div className="order-timeline-head"><div><p className="eyebrow">Money movement</p><h2 id="refund-timeline-title">Refund Timeline</h2><p>Current status: {refundLabel(order)}</p></div>{order.RefundReference && <span className="refund-reference">Reference: {order.RefundReference}</span>}</div>{order.RefundStatus === "PENDING" && order.PaymentStatus !== "VERIFIED" && <p className="refund-verification-note">Your refund case is recorded. Processing will start as soon as the submitted payment is verified.</p>}<div className="refund-steps">{refundSteps.map((step) => <article className={`refund-step${step.complete ? " complete" : ""}`} key={step.key}><span aria-hidden="true">{step.complete ? "✓" : ""}</span><div><strong>{step.label}</strong><small>{step.date ? new Date(step.date).toLocaleString() : step.complete ? "Completed · Date unavailable" : "Upcoming"}</small><p>{step.description}</p></div></article>)}</div>{order.RefundStatus === "FAILED" && <p className="error-text">Refund processing needs additional review. Please contact support if no update is provided.</p>}</section>}
      {order.PaymentStatus === "REJECTED" && (
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
