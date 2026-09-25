import { Link } from "react-router-dom";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "./RatingBadge";
import ProductCardActions from "./ProductCardActions";
import ProductPrice from "./ProductPrice";
import ProductMediaCarousel from "./ProductMediaCarousel";

export default function ProductCard({ product }) {
  const { t } = useLanguage();
  return (
    <article className="product-card">
      <div className="product-card-image-wrap">
        {product.isFeatured && <span className="discount-badge">Featured</span>}
        <ProductMediaCarousel product={product} />
        {product.quantity <= 0 && <span className={`stock-ribbon${product.temporarilyReserved ? " stock-ribbon-reserved" : ""}`} aria-label={product.availabilityStatus || "Temporarily unavailable"}>{product.availabilityStatus || "Temporarily unavailable"}</span>}
      </div>
      <div className="product-card-body">
        <p className="pill">{product.category}</p>
        <h3>{product.productName}</h3>
        <p className="product-desc">{product.description}</p>
        <RatingBadge rating={product.rating} productId={product.productId} />
        <div className="product-meta">
          <span className={product.quantity > 0 ? "status in" : "status out"}>
            {product.quantity > 0 ? t("inStock") : product.availabilityStatus || t("outOfStock")}
          </span>
          <ProductPrice product={product} showSavings={false} />
        </div>
        {product.temporarilyReserved && <p className="reserved-note" role="status">Currently unavailable. Another customer is completing checkout.</p>}
        <Link className="btn btn-outline" to={`/products/${product.productId}`}>
          {t("viewDetails")}
        </Link>
        <ProductCardActions product={product} />
      </div>
    </article>
  );
}
