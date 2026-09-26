import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminReportsPage() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/products/admin")
      .then((response) => setProducts(response.data.products || []))
      .catch(() => setError("No reports available yet."));
  }, []);

  const activeProducts = products.filter((product) => product.isActive);
  const categoryCounts = Object.entries(products.reduce((counts, product) => ({
    ...counts,
    [product.category]: (counts[product.category] || 0) + 1
  }), {}));
  const availableProducts = activeProducts.filter((product) => product.availableQuantity > 0).length;
  const outOfStockProducts = activeProducts.length - availableProducts;
  const lowStockProducts = activeProducts.filter((product) => product.availableQuantity > 0 && product.availableQuantity <= 5).length;
  const currentUnits = activeProducts.reduce((total, product) => total + product.currentStock, 0);
  const availableUnits = activeProducts.reduce((total, product) => total + product.availableQuantity, 0);
  const reservedUnits = activeProducts.reduce((total, product) => total + product.reservedQuantity, 0);
  const featured = products.filter((product) => product.isFeatured).length;
  const addedThisMonth = products.filter((product) => new Date(product.createdDate).getMonth() === new Date().getMonth()).length;

  return (
    <main className="container section admin-layout">
      <div className="admin-head">
        <div><p className="eyebrow">Business Intelligence</p><h1>Reports Dashboard</h1></div>
        <button className="btn btn-outline" onClick={() => window.print()}>Print Report</button>
      </div>
      <div className="stats-grid">
        <article><h3>Total Sarees</h3><p>{products.length}</p></article>
        <article><h3>Available Sarees</h3><p>{availableProducts}</p></article>
        <article><h3>Out Of Stock</h3><p>{outOfStockProducts}</p></article>
        <article><h3>Featured Sarees</h3><p>{featured}</p></article>
        <article><h3>Added This Month</h3><p>{addedThisMonth}</p></article>
      </div>
      {error && <p className="error-text">{error}</p>}
      <section className="report-grid">
        <article className="admin-table-wrap">
          <h2>Category-wise Products</h2>
          {categoryCounts.map(([category, count]) => (
            <div className="report-bar" key={category}>
              <span>{category}</span>
              <div><i style={{ width: `${products.length ? (count / products.length) * 100 : 0}%` }} /></div>
              <strong>{count}</strong>
            </div>
          ))}
        </article>
        <article className="admin-table-wrap">
          <h2>Inventory Distribution</h2>
          <div className="report-legend">
            <p>Current stock units <strong>{currentUnits}</strong></p>
            <p>Available units <strong>{availableUnits}</strong></p>
            <p>Reserved units <strong>{reservedUnits}</strong></p>
            <p>Low stock products (1-5) <strong>{lowStockProducts}</strong></p>
            <p>Out of stock products <strong>{outOfStockProducts}</strong></p>
          </div>
        </article>
      </section>
    </main>
  );
}