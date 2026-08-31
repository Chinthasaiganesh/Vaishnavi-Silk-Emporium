import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatCurrency } from "../utils/currency";
import CategoryCombobox from "../components/CategoryCombobox";

const initialForm = {
  productName: "",
  description: "",
  category: "",
  fabric: "",
  weavingStyle: "",
  colour: "",
  occasion: "",
  sareeLength: "5.5 metres",
  careInstructions: "Dry clean only.",
  rating: "4.5",
  price: "",
  quantity: "",
  isActive: true,
  isFeatured: false,
  imageUrl: "",
  imageFile: null
};

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState({ totalProducts: 0, activeProducts: 0, lowStockProducts: 0 });
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const submitLabel = useMemo(() => (editingId ? "Update Product" : "Add Product"), [editingId]);

  async function loadData() {
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get("/products/admin/summary"),
        api.get("/products/admin")
      ]);
      setSummary(summaryRes.data);
      const loadedProducts = listRes.data.products || [];
      console.info("Admin product prices rendered", loadedProducts.map((product) => ({ productId: product.productId, productName: product.productName, priceRetrieved: product.price, priceRendered: formatCurrency(product.price) })));
      setProducts(loadedProducts);
    } catch (requestError) {
      setError(requestError.response?.status >= 500 ? "The inventory service is temporarily unavailable." : "Unable to load inventory data.");
    }
  }

  useEffect(() => {
    loadData();
    loadCategories();
  }, []);

  async function loadCategories() {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const response = await api.get("/categories");
      setCategories((response.data.categories || []).sort((first, second) => first.categoryName.localeCompare(second.categoryName)));
    } catch {
      setCategoriesError("Unable to load categories. Please try again.");
    } finally {
      setCategoriesLoading(false);
    }
  }

  function onFieldChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function setEditing(product) {
    setEditingId(product.productId);
    setForm({
      productName: product.productName,
      description: product.description,
      category: product.category,
      fabric: product.fabric || "",
      weavingStyle: product.weavingStyle || "",
      colour: product.colour || "",
      occasion: product.occasion || "",
      sareeLength: product.sareeLength || "5.5 metres",
      careInstructions: product.careInstructions || "Dry clean only.",
      rating: String(product.rating || 4.5),
      price: String(product.price),
      quantity: String(product.quantity),
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      imageUrl: product.imageUrl || "",
      imageFile: null
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!form.category) {
      setError("Please select a category.");
      return;
    }

    try {
      const payload = new FormData();
      payload.append("productName", form.productName);
      payload.append("description", form.description);
      payload.append("category", form.category);
      payload.append("fabric", form.fabric);
      payload.append("weavingStyle", form.weavingStyle);
      payload.append("colour", form.colour);
      payload.append("occasion", form.occasion);
      payload.append("sareeLength", form.sareeLength);
      payload.append("careInstructions", form.careInstructions);
      payload.append("rating", form.rating);
      payload.append("price", form.price);
      payload.append("quantity", form.quantity);
      payload.append("isActive", String(form.isActive));
      payload.append("isFeatured", String(form.isFeatured));
      if (form.imageUrl) {
        payload.append("imageUrl", form.imageUrl);
      }
      if (form.imageFile) {
        payload.append("image", form.imageFile);
      }

      if (editingId) {
        await api.put(`/products/admin/${editingId}`, payload);
        setMessage("Product updated successfully.");
      } else {
        await api.post("/products/admin", payload);
        setMessage("Product added successfully.");
      }

      resetForm();
      await loadData();
    } catch (err) {
      const apiMsg = err?.response?.data?.message;
      const detail = err?.response?.data?.errors?.[0]?.message;
      setError(detail || apiMsg || "Save failed.");
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm("Delete this product?")) {
      return;
    }
    try {
      await api.delete(`/products/admin/${id}`);
      setMessage("Product deleted.");
      await loadData();
    } catch {
      setError("Could not delete product.");
    }
  }

  return (
    <main className="container section admin-layout">
      <div className="admin-head">
        <h1>Product Management</h1>
      </div>

      <div className="stats-grid">
        <article>
          <h3>Total Products</h3>
          <p>{summary.totalProducts}</p>
        </article>
        <article>
          <h3>Active Products</h3>
          <p>{summary.activeProducts}</p>
        </article>
        <article>
          <h3>Low Stock</h3>
          <p>{summary.lowStockProducts}</p>
        </article>
      </div>

      <form className="admin-form" onSubmit={handleSubmit}>
        <h2>{submitLabel}</h2>
        <div className="form-grid">
          <input
            placeholder="Product Name"
            value={form.productName}
            onChange={(e) => onFieldChange("productName", e.target.value)}
            required
          />
          <CategoryCombobox categories={categories} value={form.category} onChange={(value) => onFieldChange("category", value)} loading={categoriesLoading} error={categoriesError} onRetry={loadCategories} onCreate={() => window.location.assign("/admin/categories")} />
          <input placeholder="Fabric (e.g. Pure Silk)" value={form.fabric} onChange={(e) => onFieldChange("fabric", e.target.value)} />
          <input placeholder="Weaving Style" value={form.weavingStyle} onChange={(e) => onFieldChange("weavingStyle", e.target.value)} />
          <input placeholder="Colour" value={form.colour} onChange={(e) => onFieldChange("colour", e.target.value)} />
          <input placeholder="Occasion" value={form.occasion} onChange={(e) => onFieldChange("occasion", e.target.value)} />
          <input placeholder="Saree Length" value={form.sareeLength} onChange={(e) => onFieldChange("sareeLength", e.target.value)} />
          <input type="number" min="0" max="5" step="0.1" placeholder="Rating" value={form.rating} onChange={(e) => onFieldChange("rating", e.target.value)} />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            value={form.price}
            onChange={(e) => onFieldChange("price", e.target.value)}
            required
          />
          <input
            type="number"
            min="0"
            placeholder="Quantity"
            value={form.quantity}
            onChange={(e) => onFieldChange("quantity", e.target.value)}
            required
          />
          <input
            placeholder="Image URL (optional)"
            value={form.imageUrl}
            onChange={(e) => onFieldChange("imageUrl", e.target.value)}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onFieldChange("imageFile", e.target.files?.[0] || null)}
          />
        </div>
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => onFieldChange("description", e.target.value)}
          minLength={10}
          required
        />
        <textarea placeholder="Care Instructions" value={form.careInstructions} onChange={(e) => onFieldChange("careInstructions", e.target.value)} />

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onFieldChange("isActive", e.target.checked)}
          />
          Visible to customers (active)
        </label>

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(e) => onFieldChange("isFeatured", e.target.checked)}
          />
          Show on the Home Page (featured)
        </label>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {submitLabel}
          </button>
          {editingId && (
            <button className="btn btn-outline" type="button" onClick={resetForm}>
              Cancel Edit
            </button>
          )}
        </div>

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </form>

      <section className="admin-table-wrap">
        <h2>All Sarees</h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId}>
                  <td>{p.productName}</td>
                  <td>{p.category}</td>
                  <td>{formatCurrency(p.price)}</td>
                  <td>{p.quantity}</td>
                  <td>{p.isActive ? "Active" : "Inactive"}</td>
                  <td>{p.isFeatured ? "Yes" : "No"}</td>
                  <td>
                    <button className="link-btn" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="link-btn danger" onClick={() => deleteProduct(p.productId)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
