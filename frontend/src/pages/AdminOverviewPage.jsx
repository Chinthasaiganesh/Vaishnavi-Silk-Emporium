import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState({ totalProducts: 0, activeProducts: 0, lowStockProducts: 0 });
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/products/admin/summary"), api.get("/products/admin")])
      .then(([summaryResponse, productsResponse]) => {
        setSummary(summaryResponse.data);
        setProducts(productsResponse.data.products || []);
      })
      .catch(() => setError("Unable to load dashboard insights."));
  }, []);

  const activeProducts = products.filter((product) => product.isActive);
  const outOfStock = activeProducts.filter((product) => Number(product.availableQuantity ?? 0) === 0).length;
  const availableProducts = activeProducts.filter((product) => Number(product.availableQuantity ?? 0) > 0).length;
  const featured = products.filter((product) => product.isFeatured).length;
  const recent = products.slice(0, 5);

  return (
    <main className="container section admin-layout">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Vaishnavi Silk Emporium</p>
          <h1>Admin Dashboard</h1>
        </div>
      </div>
      <div className="stats-grid">
        <article><h3>Total Sarees</h3><p>{summary.totalProducts}</p></article>
        <article><h3>Available Sarees</h3><p>{availableProducts}</p></article>
        <article><h3>Out Of Stock</h3><p>{outOfStock}</p></article>
        <article><h3>Featured Sarees</h3><p>{featured}</p></article>
      </div>
      {error && <p className="error-text">{error}</p>}
      <section className="admin-table-wrap">
        <h2>Recent Updates</h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Saree</th><th>Category</th><th>Current</th><th>Available</th><th>Reserved</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recent.map((product) => (
                <tr key={product.productId}>
                  <td data-label="Saree">{product.productName}</td>
                  <td data-label="Category">{product.category}</td>
                  <td data-label="Current">{product.currentStock}</td>
                  <td data-label="Available">{product.availableQuantity}</td>
                  <td data-label="Reserved">{product.reservedQuantity}</td>
                  <td data-label="Status">{product.isActive ? product.availabilityStatus : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}