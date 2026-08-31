import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";

function prettyStatus(status = "") { return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()); }

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/orders").then((response) => setOrders(response.data.orders || [])).catch((requestError) => setError(requestError.response?.data?.message || "Unable to load orders.")); }, []);
  return <main className="container section"><div className="section-head"><div><p className="eyebrow">Your purchases</p><h1>Order History</h1></div></div>{error && <p className="error-text">{error}</p>}{!error && orders.length === 0 ? <div className="customer-empty"><p>No orders available.</p><Link className="btn btn-primary" to="/products">Explore Products</Link></div> : <section className="orders-list">{orders.map((order) => <Link className="order-row" key={order.OrderId} to={`/orders/${order.OrderId}`}><span><strong>{order.OrderNumber}</strong><small>{new Date(order.CreatedDate).toLocaleDateString()} · {order.ItemCount} items · {order.PaymentMethod || "COD"}</small></span><span><strong>{formatCurrency(order.GrandTotal)}</strong><small>{prettyStatus(order.OrderStatus)}</small></span></Link>)}</section>}</main>;
}
