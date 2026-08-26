import { Link } from "react-router-dom";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "./RatingBadge";

export default function ProductCard({ product }) {
  const { t } = useLanguage();
  return (
    <article className="product-card">
      <img src={resolveImage(product.imageUrl)} alt={product.productName} loading="lazy" />
      <div className="product-card-body">
        <p className="pill">{product.category}</p>
        <h3>{product.productName}</h3>
        <p className="product-desc">{product.description}</p>
        <RatingBadge rating={product.rating} />
        <div className="product-meta">
          <span className={product.quantity > 0 ? "status in" : "status out"}>
            {product.quantity > 0 ? t("inStock") : t("outOfStock")}
          </span>
          {product.canViewPrice ? <strong>${Number(product.price).toFixed(2)}</strong> : <Link className="price-lock" to="/login">Lock Sign In to View Price</Link>}
        </div>
        <Link className="btn btn-outline" to={`/products/${product.productId}`}>
          {t("viewDetails")}
        </Link>
      </div>
    </article>
  );
}

function resolveImage(url) {
  if (!url) {
    return "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80";
  }
  if (url.startsWith("http")) {
    return url;
  }
  const apiRoot = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace("/api", "");
  return `${apiRoot}${url}`;
}
