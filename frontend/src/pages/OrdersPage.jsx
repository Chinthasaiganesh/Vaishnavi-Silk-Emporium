import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import { resolveImageUrl, useFallbackImage } from "../utils/image";

function prettyStatus(status = "") { return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()); }

function customerStatus(order) {
  if (order.RefundStatus === "PENDING" && order.PaymentStatus !== "VERIFIED") return "Cancelled · Refund Awaiting Verification";
  if (order.RefundStatus === "PENDING") return "Cancelled · Refund Initiated";
  if (order.RefundStatus === "PROCESSING") return "Cancelled · Refund Processing";
  if (order.RefundStatus === "FAILED") return "Refund Needs Review";
  if (order.RefundStatus === "COMPLETED" || order.OrderStatus === "REFUNDED") return "Refund Completed";
  if (order.PaymentStatus === "PENDING") return "Payment Under Review";
  if (order.PaymentStatus === "REJECTED") return "Payment Verification Failed";
  return prettyStatus(order.OrderStatus);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/orders").then((response) => setOrders(response.data.orders || [])).catch((requestError) => setError(requestError.response?.data?.message || "Unable to load orders.")); }, []);
  return <main className="container section"><div className="section-head"><div><p className="eyebrow">Your purchases</p><h1>Order History</h1></div></div>{error && <p className="error-text">{error}</p>}{!error && orders.length === 0 ? <div className="customer-empty"><p>No orders available.</p><Link className="btn btn-primary" to="/products">Explore Products</Link></div> : <section className="orders-list">{orders.map((order) => <Link className="order-row" key={order.OrderId} to={`/orders/${order.OrderId}`}><img className="order-row-image" src={resolveImage(order.OrderImageUrl)} onError={useFallbackImage} alt="" /><span><strong>{order.OrderNumber}</strong><small>{new Date(order.CreatedDate).toLocaleDateString()} · {order.ItemCount} items · {order.PaymentMethod || "COD"}</small></span><span><strong>{formatCurrency(order.GrandTotal)}</strong>{Number(order.DiscountAmount) > 0 && <small>Saved {formatCurrency(order.DiscountAmount)}</small>}<small>{customerStatus(order)}</small></span></Link>)}</section>}</main>;
}

function resolveImage(url) { return resolveImageUrl(url); }
