import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";

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
      setMessage(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update order status.");
    }
  }

  async function updatePayment(paymentStatus) {
    if (!selectedOrder) return;
    try {
      const response = await api.patch(`/admin/orders/${selectedOrder.OrderId}/payment`, { paymentStatus });
      setSelectedOrder(response.data.order);
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
                  <td data-label="Amount">{formatCurrency(order.GrandTotal)}</td>
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
              {selectedOrder.PaymentStatus === "PENDING" && <div><button className="btn btn-primary" onClick={() => updatePayment("VERIFIED")}>Verify Payment</button><button className="btn btn-outline" onClick={() => updatePayment("REJECTED")}>Reject Payment</button></div>}
              <h3>Status</h3>
              <select value={selectedOrder.OrderStatus} onChange={(event) => updateStatus(event.target.value)}>{statuses.map((item) => <option value={item} key={item}>{prettyStatus(item)}</option>)}</select>
              <h3>Timeline</h3>
              <div className="admin-status-history">{(selectedOrder.history || []).map((entry) => <p key={entry.StatusHistoryId}><strong>{prettyStatus(entry.NewStatus)}</strong><span>{new Date(entry.ChangedAt).toLocaleString()} {entry.Username ? `by ${entry.Username}` : ""}</span></p>)}</div>
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
                  <tr key={it.productId || it.id}>
                    <td data-label="Product">{it.productName || it.name}</td>
                    <td data-label="Qty">{it.quantity || it.qty}</td>
                    <td data-label="Price">{formatCurrency(it.price || it.unitPrice || 0)}</td>
                    <td data-label="Subtotal">{formatCurrency((it.quantity || it.qty || 0) * (it.price || it.unitPrice || 0))}</td>
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
