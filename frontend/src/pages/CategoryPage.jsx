import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";

export default function CategoryPage() {
  const [categories, setCategories] = useState([]);
  useEffect(() => { api.get("/categories/public").then((response) => setCategories(response.data.categories || [])).catch(() => setCategories([])); }, []);
  return (
    <main className="container section">
      <div className="section-head"><h1>Shop By Category</h1></div>
      <div className="category-grid">
        {categories.map((category) => <Link key={category.categoryId} className="category-link" to={`/collections?category=${encodeURIComponent(category.categoryName)}`}>{category.categoryName}<small>{category.productCount} sarees</small></Link>)}
      </div>
    </main>
  );
}