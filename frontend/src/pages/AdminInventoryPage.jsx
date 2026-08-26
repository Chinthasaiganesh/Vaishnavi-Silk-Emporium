import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminInventoryPage() {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadInventory() {
    try {
      const response = await api.get("/products/admin");
      setProducts(response.data.products || []);
    } catch {
      setError("Unable to load inventory.");
    }
  }

  useEffect(() => { loadInventory(); }, []);

  async function saveStock(product) {
    const quantity = quantities[product.productId] ?? product.quantity;
    setError("");
    try {
      const payload = new FormData();
      payload.append("productName", product.productName);
      payload.append("description", product.description);
      payload.append("category", product.category);
      payload.append("price", product.price);
      payload.append("quantity", quantity);
      payload.append("isActive", String(product.isActive));
      payload.append("isFeatured", String(product.isFeatured));
      payload.append("fabric", product.fabric || "");
      payload.append("weavingStyle", product.weavingStyle || "");
      payload.append("colour", product.colour || "");
      payload.append("occasion", product.occasion || "");
      payload.append("sareeLength", product.sareeLength || "5.5 metres");
      payload.append("careInstructions", product.careInstructions || "Dry clean only.");
      payload.append("rating", product.rating || 4.5);
      if (product.imageUrl) payload.append("imageUrl", product.imageUrl);
      await api.put(`/products/admin/${product.productId}`, payload);
      setMessage(`Stock updated for ${product.productName}.`);
      await loadInventory();
    } catch (requestError) {
      setError(requestError.response?.data?.errors?.[0]?.message || requestError.response?.data?.message || "Unable to update stock.");
    }
  }

  const lowStock = products.filter((product) => product.quantity <= 5);
  return <main className="container section admin-layout"><div className="admin-head"><div><p className="eyebrow">Stock Control</p><h1>Inventory Management</h1></div></div><div className="stats-grid"><article><h3>Current Sarees</h3><p>{products.length}</p></article><article><h3>Low Stock Alerts</h3><p>{lowStock.length}</p></article><article><h3>Out Of Stock</h3><p>{products.filter((product) => product.quantity === 0).length}</p></article></div>{message && <p className="success-text">{message}</p>}{error && <p className="error-text">{error}</p>}<section className="admin-table-wrap"><h2>Stock Management</h2><div className="table-scroll"><table className="admin-table"><thead><tr><th>Saree</th><th>Availability</th><th>Current Stock</th><th>Restock</th></tr></thead><tbody>{products.map((product) => <tr key={product.productId}><td>{product.productName}</td><td>{product.quantity > 0 ? "Available" : "Out Of Stock"}</td><td>{product.quantity}</td><td><div className="inventory-control"><input type="number" min="0" value={quantities[product.productId] ?? product.quantity} onChange={(event) => setQuantities({ ...quantities, [product.productId]: event.target.value })} /><button className="btn btn-primary" onClick={() => saveStock(product)}>Update</button></div></td></tr>)}</tbody></table></div></section></main>;
}