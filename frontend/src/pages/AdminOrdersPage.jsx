import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { resolveImageUrl } from "../utils/image";

function prettyStatus(status = "") {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [allowedTransitions, setAllowedTransitions] = useState([]);
  const [cancellationReason, setCancellationReason] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [page, setPage] = useState(1);
  const detailRef = useRef(null);
  const pageSize = 8;

  async function load() {
    setError("");
    try {
      const response = await api.get("/admin/orders", { params: { q: query, status } });
      setOrders(response.data.orders || []);
      setStatuses(response.data.statuses || []);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load orders.");
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedOrder) return;
    const frame = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedOrder]);

  const pagedOrders = useMemo(() => orders.slice((page - 1) * pageSize, page * pageSize), [orders, page]);
  const pageCount = Math.max(Math.ceil(orders.length / pageSize), 1);

  async function viewOrder(orderId) {
    try {
      const response = await api.get(`/admin/orders/${orderId}`);
      setSelectedOrder(response.data.order);
      setRejectionReason("");
      setCancellationReason("");
      setRefundReference(response.data.order.RefundReference || "");
      setAllowedTransitions(response.data.allowedTransitions || []);
      setStatuses(response.data.statuses || statuses);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load order details.");
    }
  }

  async function updateStatus(nextStatus) {
    if (!selectedOrder) return;
    try {
      const response = await api.patch(`/admin/orders/${selectedOrder.OrderId}/status`, { status: nextStatus });
      setSelectedOrder(response.data.order);
      setAllowedTransitions(response.data.allowedTransitions || []);
      setMessage(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update order status.");
    }
  }

  async function cancelSelectedOrder() {
    if (!selectedOrder || cancellationReason.trim().length < 3) {
      setError("Enter a cancellation reason before cancelling the order.");
      return;
    }
    try {
      setError("");
      const response = await api.post(`/admin/orders/${selectedOrder.OrderId}/cancel`, { reason: cancellationReason.trim() });
      setSelectedOrder(response.data.order);
      setAllowedTransitions([]);
      setCancellationReason("");
      setMessage(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to cancel order.");
    }
  }

  async function updateRefund(refundStatus) {
    if (!selectedOrder) return;
    try {
      setError("");
      const response = await api.patch(`/admin/orders/${selectedOrder.OrderId}/refund`, { refundStatus, refundReference: refundReference.trim() || undefined });
      setSelectedOrder(response.data.order);
      setAllowedTransitions(response.data.allowedTransitions || []);
      setMessage(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update refund status.");
    }
  }

  async function updatePayment(paymentStatus) {
    if (!selectedOrder) return;
    if (paymentStatus === "REJECTED" && rejectionReason.trim().length < 3) {
      setError("Enter a rejection reason before rejecting the payment.");
      return;
    }
    try {
      setError("");
      const response = await api.patch(`/admin/orders/${selectedOrder.OrderId}/payment`, { paymentStatus, rejectionReason: paymentStatus === "REJECTED" ? rejectionReason.trim() : undefined });
      setSelectedOrder(response.data.order);
      setRejectionReason("");
      setMessage(response.data.message);
      await load();
    } catch (requestError) { setError(requestError.response?.data?.message || `Unable to update payment status${requestError.response?.data?.requestId ? ` (request ${requestError.response.data.requestId})` : ""}.`); }
  }

  return (
    <main className="container section admin-layout">
      <div className="admin-head"><div><p className="eyebrow">Fulfillment</p><h1>Order Management</h1></div></div>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="admin-table-wrap">
        <div className="order-admin-toolbar">
          <input className="admin-search" placeholder="Search order, customer, email" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option value={item} key={item}>{prettyStatus(item)}</option>)}
          </select>
          <button className="btn btn-outline" onClick={load}>Apply</button>
        </div>

        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => (
                <tr key={order.OrderId}>
                  <td data-label="Order ID">{order.OrderNumber}</td>
                  <td data-label="Customer">{order.FullName || order.Username}<br /><small>{order.Email}</small></td>
                  <td data-label="Date">{new Date(order.CreatedDate).toLocaleDateString()}</td>
                  <td data-label="Items">{order.ItemCount}</td>
                  <td data-label="Amount"><span className="order-amount"><strong>{formatCurrency(order.GrandTotal)}</strong>{Number(order.DiscountAmount) > 0 && <small>Saved {formatCurrency(order.DiscountAmount)}</small>}</span></td>
                  <td data-label="Payment">{order.PaymentMethod || "COD"}</td>
                  <td data-label="Status"><span className="order-status-badge">{prettyStatus(order.OrderStatus)}</span></td>
                  <td data-label="Actions"><button className="link-btn" onClick={() => viewOrder(order.OrderId)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-row"><button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn btn-outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </section>

      {selectedOrder && (
        <section ref={detailRef} tabIndex="-1" className="admin-table-wrap order-admin-detail" aria-label={`Details for ${selectedOrder.OrderNumber}`}>
          <div className="checkout-section-heading"><h2>{selectedOrder.OrderNumber}</h2><button className="link-btn" onClick={() => setSelectedOrder(null)}>Close</button></div>
          {Number(selectedOrder.DiscountAmount) > 0 && <p className="order-savings-callout"><strong>Customer saved {formatCurrency(selectedOrder.DiscountAmount)}</strong></p>}
          <div className="order-admin-grid">
            <article>
              <h3>Customer</h3>
              <p>{selectedOrder.CustomerName || selectedOrder.Username}<br />{selectedOrder.Email}<br />{selectedOrder.CustomerMobile}</p>
              <h3>Shipping Address</h3>
              <p>{selectedOrder.FullName}<br />{selectedOrder.AddressLine1}{selectedOrder.AddressLine2 ? `, ${selectedOrder.AddressLine2}` : ""}<br />{selectedOrder.City}, {selectedOrder.State} {selectedOrder.PostalCode}<br />{selectedOrder.Country}</p>
            </article>
            <article>
              <h3>Payment</h3>
              <p>Status: <strong>{prettyStatus(selectedOrder.PaymentStatus || "PENDING")}</strong><br />UTR: {selectedOrder.PaymentReference || "Not provided"}</p>
              {selectedOrder.PaymentScreenshotUrl && <p><a href={selectedOrder.PaymentScreenshotUrl} target="_blank" rel="noreferrer">Open payment screenshot</a></p>}
              {selectedOrder.PaymentStatus === "PENDING" && <div className="payment-review-actions"><label htmlFor="payment-rejection-reason">Rejection reason</label><textarea id="payment-rejection-reason" maxLength="500" rows="3" placeholder="Required when rejecting payment" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /><div><button className="btn btn-primary" onClick={() => updatePayment("VERIFIED")}>Verify Payment</button><button className="btn btn-outline" disabled={rejectionReason.trim().length < 3} onClick={() => updatePayment("REJECTED")}>Reject Payment</button></div></div>}
              {selectedOrder.PaymentStatus === "REJECTED" && <p className="error-text"><strong>Rejection reason:</strong> {selectedOrder.PaymentRejectionReason}</p>}
              <h3>Status</h3>
              <p><strong>{prettyStatus(selectedOrder.OrderStatus)}</strong></p>
              {allowedTransitions.length > 0 && <div className="admin-lifecycle-actions"><label htmlFor="next-order-status">Next fulfillment status</label><select id="next-order-status" value="" onChange={(event) => event.target.value && updateStatus(event.target.value)}><option value="">Select next status</option>{allowedTransitions.map((item) => <option value={item} key={item}>{prettyStatus(item)}</option>)}</select></div>}
              {["PENDING", "PROCESSING", "PACKED"].includes(selectedOrder.OrderStatus) && <div className="admin-lifecycle-actions"><label htmlFor="admin-cancellation-reason">Cancellation reason</label><textarea id="admin-cancellation-reason" maxLength="300" rows="3" placeholder="Required for admin cancellation" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /><button className="btn btn-outline" disabled={cancellationReason.trim().length < 3} onClick={cancelSelectedOrder}>Cancel Order</button></div>}
              {selectedOrder.RefundStatus !== "NOT_APPLICABLE" && <div className="admin-lifecycle-actions"><h3>Refund</h3><p>Status: <strong>{prettyStatus(selectedOrder.RefundStatus)}</strong></p>{selectedOrder.PaymentStatus !== "VERIFIED" ? <p className="muted">Refund case created. Verify the submitted payment before processing the refund.</p> : <><label htmlFor="refund-reference">Refund reference</label><input id="refund-reference" maxLength="120" placeholder="Bank or gateway reference" value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /><div>{selectedOrder.RefundStatus === "PENDING" && <><button className="btn btn-primary" onClick={() => updateRefund("PROCESSING")}>Start Processing</button><button className="btn btn-outline" onClick={() => updateRefund("FAILED")}>Mark Issue</button></>}{selectedOrder.RefundStatus === "PROCESSING" && <><button className="btn btn-primary" onClick={() => updateRefund("COMPLETED")}>Complete Refund</button><button className="btn btn-outline" onClick={() => updateRefund("FAILED")}>Mark Issue</button></>}{selectedOrder.RefundStatus === "FAILED" && <button className="btn btn-primary" onClick={() => updateRefund("PROCESSING")}>Retry Refund</button>}</div></>}</div>}
              <h3>Timeline</h3>
              <div className="admin-status-history">{(selectedOrder.lifecycle || []).map((entry) => <p key={entry.LifecycleEventId}><strong>{entry.Title}</strong><span>{new Date(entry.EventDate).toLocaleString()} · {entry.ActorRole ? prettyStatus(entry.ActorRole) : "System"}</span><small>{entry.Description}</small></p>)}</div>
            </article>
          </div>

          <h3>Products</h3>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>
              </thead>
              <tbody>
                {(selectedOrder.items || []).map((it) => (
                  <tr key={it.OrderItemId || it.orderItemId || it.ProductId || it.productId || it.id}>
                    <td data-label="Product"><span className="order-product-cell"><img className="order-item-image" src={resolveImage(it.ImageUrl)} alt="" />{it.ProductName ?? it.productName ?? it.name ?? "Unknown product"}</span></td>
                    <td data-label="Qty">{it.Quantity ?? it.quantity ?? it.qty ?? 0}</td>
                    <td data-label="Price"><span className="order-item-pricing"><strong>{formatCurrency(it.DiscountedPrice || it.ProductPrice || it.price || it.unitPrice || 0)}</strong><small>{formatCurrency(it.OriginalPrice || it.ProductPrice || 0)} original · Save {formatCurrency(it.SavingsAmount || 0)} ({Number(it.DiscountPercentage || 0).toFixed(0)}%)</small></span></td>
                    <td data-label="Subtotal">{formatCurrency(it.LineTotal ?? ((it.Quantity ?? it.quantity ?? it.qty ?? 0) * (it.ProductPrice ?? it.price ?? it.unitPrice ?? 0)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function resolveImage(url) { return resolveImageUrl(url); }
