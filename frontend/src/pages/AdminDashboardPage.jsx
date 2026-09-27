import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNotifier } from "../NotifierContext";
import { formatCurrency } from "../utils/currency";
import { resolveImageUrl } from "../utils/image";
import CategoryCombobox from "../components/CategoryCombobox";
import ProductPrice from "../components/ProductPrice";

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
  discountedPrice: "",
  quantity: "",
  isActive: true,
  isFeatured: false,
  existingImages: [],
  imageUrl: "",
  imageFile: null,
  imageFiles: []
};

export default function AdminDashboardPage() {
  const { confirm } = useNotifier();
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
  const selectedImagePreviews = useMemo(
    () => form.imageFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [form.imageFiles]
  );
  const imageCount = form.existingImages.length + form.imageFiles.length + (form.imageUrl.trim() ? 1 : 0);

  useEffect(() => () => {
    selectedImagePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [selectedImagePreviews]);

  async function loadData() {
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get("/products/admin/summary"),
        api.get("/products/admin")
      ]);
      setSummary(summaryRes.data);
      const loadedProducts = listRes.data.products || [];
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
      price: String(product.originalPrice ?? product.price),
      discountedPrice: product.discountedPrice == null ? "" : String(product.discountedPrice),
      quantity: String(product.currentStock ?? 0),
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      existingImages: product.imageUrls?.length ? [...product.imageUrls] : product.imageUrl ? [product.imageUrl] : [],
      imageUrl: "",
      imageFile: null,
      imageFiles: []
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  function removeExistingImage(index) {
    setForm((previous) => ({
      ...previous,
      existingImages: previous.existingImages.filter((_, imageIndex) => imageIndex !== index)
    }));
  }

  function moveExistingImage(index, direction) {
    setForm((previous) => {
      const destination = index + direction;
      if (destination < 0 || destination >= previous.existingImages.length) return previous;
      const existingImages = [...previous.existingImages];
      [existingImages[index], existingImages[destination]] = [existingImages[destination], existingImages[index]];
      return { ...previous, existingImages };
    });
  }

  function removeSelectedImage(index) {
    setForm((previous) => ({
      ...previous,
      imageFiles: previous.imageFiles.filter((_, imageIndex) => imageIndex !== index)
    }));
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
      payload.append("discountedPrice", form.discountedPrice);
      payload.append("quantity", form.quantity);
      payload.append("isActive", String(form.isActive));
      payload.append("isFeatured", String(form.isFeatured));
      if (form.imageUrl) {
        payload.append(editingId ? "newImageUrl" : "imageUrl", form.imageUrl);
      }
      if (editingId) {
        payload.append("existingImages", JSON.stringify(form.existingImages));
      }
      if (form.imageFiles.length) {
        form.imageFiles.forEach((file) => payload.append("images", file));
      } else if (form.imageFile) {
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
    const confirmed = await confirm({ variant: "error", icon: "alert", eyebrow: "Delete product", title: "Delete This Product?", message: "The product will be removed from the catalogue and will no longer be visible to customers. This cannot be undone.", confirmLabel: "Delete Product", cancelLabel: "Keep Product" });
    if (!confirmed) return;
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
            step="0.01"
            min="0"
            placeholder="Discounted Price (optional)"
            value={form.discountedPrice}
            onChange={(e) => onFieldChange("discountedPrice", e.target.value)}
          />
          <input
            type="number"
            min="0"
            placeholder="Current Stock"
            value={form.quantity}
            onChange={(e) => onFieldChange("quantity", e.target.value)}
            required
          />
          <input
            placeholder={editingId ? "Add image URL (optional)" : "Image URL (optional)"}
            value={form.imageUrl}
            onChange={(e) => onFieldChange("imageUrl", e.target.value)}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => {
              const availableSlots = Math.max(0, 8 - form.existingImages.length - (form.imageUrl.trim() ? 1 : 0));
              onFieldChange("imageFiles", Array.from(e.target.files || []).slice(0, availableSlots));
            }}
          />
          <small>{imageCount} of 8 images selected. New images are added after the existing gallery.</small>
          {(form.existingImages.length > 0 || selectedImagePreviews.length > 0) && (
            <div className="admin-image-gallery" aria-label="Product image preview">
              {form.existingImages.map((url, index) => (
                <figure className="admin-image-preview" key={url}>
                  <img src={resolveImageUrl(url)} alt={`Existing product image ${index + 1}`} />
                  <figcaption>
                    <button type="button" title="Move image left" aria-label={`Move image ${index + 1} left`} disabled={index === 0} onClick={() => moveExistingImage(index, -1)}>←</button>
                    <span>{index + 1}</span>
                    <button type="button" title="Move image right" aria-label={`Move image ${index + 1} right`} disabled={index === form.existingImages.length - 1} onClick={() => moveExistingImage(index, 1)}>→</button>
                    <button className="danger" type="button" title="Remove image" aria-label={`Remove image ${index + 1}`} onClick={() => removeExistingImage(index)}>×</button>
                  </figcaption>
                </figure>
              ))}
              {selectedImagePreviews.map(({ file, url }, index) => (
                <figure className="admin-image-preview pending" key={`${file.name}-${file.lastModified}`}>
                  <img src={url} alt={`New product image ${index + 1}`} />
                  <figcaption><span>New</span><button className="danger" type="button" title="Remove image" aria-label={`Remove new image ${index + 1}`} onClick={() => removeSelectedImage(index)}>×</button></figcaption>
                </figure>
              ))}
            </div>
          )}
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
                <th>Current Stock</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId}>
                  <td data-label="Name">{p.productName}</td>
                  <td data-label="Category">{p.category}</td>
                  <td data-label="Price"><ProductPrice product={p} /></td>
                  <td data-label="Current Stock">{p.currentStock}</td>
                  <td data-label="Available">{p.availableQuantity}</td>
                  <td data-label="Reserved">{p.reservedQuantity}</td>
                  <td data-label="Status">{p.isActive ? "Active" : "Inactive"}</td>
                  <td data-label="Featured">{p.isFeatured ? "Yes" : "No"}</td>
                  <td data-label="Actions">
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
