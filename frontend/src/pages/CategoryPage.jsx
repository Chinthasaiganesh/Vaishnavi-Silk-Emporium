import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";

const categoryOrder = ["Silk Sarees", "Banarasi Sarees", "Kanchipuram Sarees", "Cotton Sarees", "Bridal Sarees", "Designer Sarees", "Festive Sarees", "Linen Sarees", "Handloom Sarees", "Uppada Pattu", "Uppadam pattu"];

export default function CategoryPage() {
  const [categories, setCategories] = useState([]);
  useEffect(() => { api.get("/categories/public").then((response) => setCategories(response.data.categories || [])).catch(() => setCategories([])); }, []);
  const sorted = [...categories].sort((a, b) => {
    const aOrder = categoryOrder.indexOf(a.categoryName);
    const bOrder = categoryOrder.indexOf(b.categoryName);
    return (aOrder === -1 ? 999 : aOrder) - (bOrder === -1 ? 999 : bOrder) || a.categoryName.localeCompare(b.categoryName);
  });
  const available = sorted.filter((category) => category.productCount > 0);
  const upcoming = sorted.filter((category) => category.productCount === 0);

  function CategoryCard({ category, comingSoon = false }) {
    return <article className={`category-card${comingSoon ? " coming-soon" : ""}`}>
      <div><p className="eyebrow">Saree Collection</p><h2>{category.categoryName}</h2><p className="category-count">{comingSoon ? "Coming Soon" : `${category.productCount} ${category.productCount === 1 ? "Saree" : "Sarees"} Available`}</p></div>
      {comingSoon ? <span className="category-soon-label">Coming Soon</span> : <Link className="category-view-link" to={`/collections?category=${encodeURIComponent(category.categoryName)}`}>View Collection</Link>}
    </article>;
  }

  return (
    <main className="container section">
      <div className="section-head"><div><p className="eyebrow">Curated Collections</p><h1>Shop By Category</h1></div></div>
      <div className="category-grid">
        {available.map((category) => <CategoryCard key={category.categoryId} category={category} />)}
      </div>
      {upcoming.length > 0 && <section className="upcoming-categories"><div className="section-head"><div><p className="eyebrow">In The Works</p><h2>Coming Soon Collections</h2></div></div><div className="category-grid">{upcoming.map((category) => <CategoryCard key={category.categoryId} category={category} comingSoon />)}</div></section>}
    </main>
  );
}