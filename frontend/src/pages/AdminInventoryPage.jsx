import { useEffect, useState } from "react";
import { api, apiBaseUrl } from "../api";

export default function AdminInventoryPage() {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/inventory");
      setProducts(response.data.products || []);
    } catch (requestError) {
      const status = requestError.response?.status;
      const serverMessage = requestError.response?.data?.message;
      const requestId = requestError.response?.headers?.["x-request-id"];
      const diagnostic = requestId ? ` Request ID: ${requestId}.` : "";
      setError(serverMessage || (status === 401 ? "Unauthorized access. Please sign in again." : status === 403 ? "Access denied. Admin permissions are required." : status === 404 ? `Inventory endpoint not registered at ${apiBaseUrl}/inventory.${diagnostic}` : status ? `Inventory API unavailable (HTTP ${status}).${diagnostic}` : `Inventory service is unreachable at ${apiBaseUrl}/inventory.`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInventory(); }, []);

  async function saveStock(product) {
    const quantity = quantities[product.productId] ?? product.quantity;
    setError("");
    try {
      await api.put(`/inventory/${product.productId}`, { stock: quantity });
      setMessage(`Stock updated for ${product.productName}.`);
      await loadInventory();
    } catch (requestError) {
      const validationMessage = requestError.response?.data?.errors?.[0]?.message;
      const serverMessage = validationMessage || requestError.response?.data?.message;
      setError(serverMessage || (requestError.response ? `Inventory update failed (HTTP ${requestError.response.status}).` : "Inventory service is unreachable."));
    }
  }

  const lowStock = products.filter((product) => product.quantity <= 5);
  return <main className="container section admin-layout"><div className="admin-head"><div><p className="eyebrow">Stock Control</p><h1>Inventory Management</h1></div></div>{loading && <p>Loading inventory records...</p>}{message && <p className="success-text">{message}</p>}{error && <div className="error-text"><p>{error}</p><button className="btn btn-outline" onClick={loadInventory}>Retry</button></div>}{!loading && !error && <><div className="stats-grid"><article><h3>Current Sarees</h3><p>{products.length}</p></article><article><h3>Low Stock Alerts</h3><p>{lowStock.length}</p></article><article><h3>Out Of Stock</h3><p>{products.filter((product) => product.quantity === 0).length}</p></article></div><section className="admin-table-wrap"><h2>Stock Management</h2>{products.length === 0 ? <p>No inventory records found.</p> : <div className="table-scroll"><table className="admin-table"><thead><tr><th>Saree</th><th>Availability</th><th>Current Stock</th><th>Restock</th></tr></thead><tbody>{products.map((product) => <tr key={product.productId}><td>{product.productName}</td><td>{product.quantity > 0 ? "Available" : "Out Of Stock"}</td><td>{product.quantity}</td><td><div className="inventory-control"><input type="number" min="0" value={quantities[product.productId] ?? product.quantity} onChange={(event) => setQuantities({ ...quantities, [product.productId]: event.target.value })} /><button className="btn btn-primary" onClick={() => saveStock(product)}>Update</button></div></td></tr>)}</tbody></table></div>}</section></>}</main>;
}