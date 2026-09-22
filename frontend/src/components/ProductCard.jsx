import { Link } from "react-router-dom";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "./RatingBadge";
import ProductCardActions from "./ProductCardActions";
import ProductPrice from "./ProductPrice";

export default function ProductCard({ product }) {
  const { t } = useLanguage();
  return (
    <article className="product-card">
      <div className="product-card-image-wrap">
        {product.isFeatured && <span className="discount-badge">Featured</span>}
        <img data-cart-product={product.productId} src={resolveImage(product.imageUrl)} alt={product.productName} loading="lazy" />
        {product.quantity <= 0 && <span className="stock-ribbon" aria-label="Out of stock">Out of Stock</span>}
      </div>
      <div className="product-card-body">
        <p className="pill">{product.category}</p>
        <h3>{product.productName}</h3>
        <p className="product-desc">{product.description}</p>
        <RatingBadge rating={product.rating} productId={product.productId} />
        <div className="product-meta">
          <span className={product.quantity > 0 ? "status in" : "status out"}>
            {product.quantity > 0 ? t("inStock") : t("outOfStock")}
          </span>
          <ProductPrice product={product} />
        </div>
        <Link className="btn btn-outline" to={`/products/${product.productId}`}>
          {t("viewDetails")}
        </Link>
        <ProductCardActions product={product} />
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
  const apiRoot = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api")).replace("/api", "");
  return `${apiRoot}${url}`;
}
