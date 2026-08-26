import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import ProductCard from "../components/ProductCard";
import { useAuth } from "../AuthContext";
import { useLanguage } from "../LanguageContext";

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const { t } = useLanguage();

  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "";

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/products/public", { params: { q, category, sort } });
        if (!cancelled) {
          setProducts(response.data.products || []);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load products right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [q, category, sort]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await api.get("/categories/public");
        if (!cancelled) {
          setCategories((response.data.categories || []).map((category) => category.categoryName));
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      }
    }

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateParam(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(name, value);
    } else {
      next.delete(name);
    }
    setSearchParams(next);
  }

  return (
    <main className="container section">
      <div className="section-head">
        <h1>{t("products")}</h1>
      </div>

      <div className="toolbar">
        <input
          type="search"
          value={q}
          placeholder={t("search")}
          onChange={(e) => updateParam("q", e.target.value)}
        />

        <select value={category} onChange={(e) => updateParam("category", e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option value={c} key={c}>
              {c}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => updateParam("sort", e.target.value)} disabled={!user}>
          <option value="">Sort By</option>
          {user && <><option value="price_asc">Price Low to High</option><option value="price_desc">Price High to Low</option></>}
          <option value="alpha_asc">Alphabetical Order</option>
        </select>
      </div>

      {loading && <section className="products-grid" aria-label="Loading saree collections">{Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index} />)}</section>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && products.length === 0 && <div className="empty-state">No Products Found</div>}

      {!loading && <section className="products-grid">
        {products.map((product) => (
          <ProductCard key={product.productId} product={product} />
        ))}
      </section>}
    </main>
  );
}
