import { useEffect, useMemo, useState } from "react";
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

  return <main className="container section admin-layout">
    <div className="admin-head"><div><p className="eyebrow">Fulfillment</p><h1>Order Management</h1></div></div>
    {message && <p className="success-text">{message}</p>}
    {error && <p className="error-text">{error}</p>}
    <section className="admin-table-wrap">
      <div className="order-admin-toolbar">
        <input className="admin-search" placeholder="Search order, customer, email" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{prettyStatus(item)}</option>)}</select>
        <button className="btn btn-outline" onClick={load}>Apply</button>
      </div>
      <div className="table-scroll"><table className="admin-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>{pagedOrders.map((order) => <tr key={order.OrderId}><td>{order.OrderNumber}</td><td>{order.FullName || order.Username}<br /><small>{order.Email}</small></td><td>{new Date(order.CreatedDate).toLocaleDateString()}</td><td>{order.ItemCount}</td><td>{formatCurrency(order.GrandTotal)}</td><td>{order.PaymentMethod || "COD"}</td><td><span className="order-status-badge">{prettyStatus(order.OrderStatus)}</span></td><td><button className="link-btn" onClick={() => viewOrder(order.OrderId)}>View</button></td></tr>)}</tbody></table></div>
      <div className="pagination-row"><button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn btn-outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
    {selectedOrder && <section className="admin-table-wrap order-admin-detail"><div className="checkout-section-heading"><h2>{selectedOrder.OrderNumber}</h2><button className="link-btn" onClick={() => setSelectedOrder(null)}>Close</button></div><div className="order-admin-grid"><article><h3>Customer</h3><p>{selectedOrder.CustomerName || selectedOrder.Username}<br />{selectedOrder.Email}<br />{selectedOrder.CustomerMobile}</p><h3>Shipping Address</h3><p>{selectedOrder.FullName}<br />{selectedOrder.AddressLine1}{selectedOrder.AddressLine2 ? `, ${selectedOrder.AddressLine2}` : ""}<br />{selectedOrder.City}, {selectedOrder.State} {selectedOrder.PostalCode}<br />{selectedOrder.Country}</p></article><article><h3>Status</h3><select value={selectedOrder.OrderStatus} onChange={(event) => updateStatus(event.target.value)}>{statuses.map((item) => <option value={item} key={item}>{prettyStatus(item)}</option>)}</select><h3>Timeline</h3><div className="admin-status-history">{(selectedOrder.history || []).map((entry) => <p key={entry.StatusHistoryId}><strong>{prettyStatus(entry.NewStatus)}</strong><span>{new Date(entry.ChangedAt).toLocaleString()} {entry.Username ? `by ${entry.Username}` : ""}</span></p>)}</div></article></div><h3>Products</h3><div className="table-scroll"><table className="admin-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody>{selectedOrder.items.map((item) => <tr key={item.OrderItemId}><td>{item.ProductName}</td><td>{item.Quantity}</td><td>{formatCurrency(item.ProductPrice)}</td><td>{formatCurrency(item.LineTotal)}</td></tr>)}</tbody></table></div></section>}
  </main>;
}
