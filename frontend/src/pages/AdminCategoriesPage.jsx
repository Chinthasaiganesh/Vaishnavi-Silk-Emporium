import { useEffect, useState } from "react";
import { api } from "../api";
import { useNotifier } from "../NotifierContext";

const blank = { categoryName: "", description: "", isActive: true };

export default function AdminCategoriesPage() {
  const { confirm } = useNotifier();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await api.get("/categories");
    setCategories(response.data.categories || []);
  }

  useEffect(() => {
    load().catch(() => setMessage("Unable to load categories."));
  }, []);

  async function submit(event) {
    event.preventDefault();
    try {
      if (editing) {
        await api.put(`/categories/${editing}`, form);
      } else {
        await api.post("/categories", form);
      }
      setForm(blank);
      setEditing(null);
      setMessage("Category saved.");
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to save category.");
    }
  }

  const visible = categories.filter((category) => `${category.categoryName} ${category.description}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="container section admin-layout">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Collection Structure</p>
          <h1>Categories Management</h1>
        </div>
      </div>
      <form className="admin-form" onSubmit={submit}>
        <h2>{editing ? "Edit Category" : "Add Category"}</h2>
        <div className="form-grid">
          <input placeholder="Category Name" value={form.categoryName} onChange={(event) => setForm({ ...form, categoryName: event.target.value })} required />
          <input placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </div>
        <label className="checkbox-line"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active for storefront</label>
        <div className="form-actions">
          <button className="btn btn-primary">{editing ? "Update Category" : "Add Category"}</button>
          {editing && <button className="btn btn-outline" type="button" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
        </div>
        {message && <p className="success-text">{message}</p>}
      </form>
      <section className="admin-table-wrap">
        <div className="section-head">
          <h2>All Categories</h2>
          <input className="admin-search" placeholder="Search categories" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Category Name</th><th>Description</th><th>Products</th><th>Status</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((category) => (
                <tr key={category.categoryId}>
                  <td data-label="Category Name">{category.categoryName}</td>
                  <td data-label="Description">{category.description || "—"}</td>
                  <td data-label="Products">{category.productCount}</td>
                  <td data-label="Status">{category.isActive ? "Active" : "Inactive"}</td>
                  <td data-label="Created">{new Date(category.createdDate).toLocaleDateString()}</td>
                  <td data-label="Actions"><button className="link-btn" onClick={() => { setEditing(category.categoryId); setForm({ categoryName: category.categoryName, description: category.description, isActive: category.isActive }); }}>Edit</button><button className="link-btn danger" onClick={async () => { const confirmed = await confirm({ variant: "error", icon: "alert", eyebrow: "Delete category", title: "Delete This Category?", message: "Products assigned to this category will need to be re-categorised. This cannot be undone.", confirmLabel: "Delete Category", cancelLabel: "Keep Category" }); if (confirmed) { await api.delete(`/categories/${category.categoryId}`); await load(); } }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <p className="customer-empty">No categories created yet.</p>}
      </section>
    </main>
  );
}