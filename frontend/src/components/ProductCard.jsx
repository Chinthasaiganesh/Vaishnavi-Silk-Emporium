import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "./RatingBadge";
import ProductCardActions from "./ProductCardActions";
import ProductPrice from "./ProductPrice";
import ProductMediaCarousel from "./ProductMediaCarousel";

export default function ProductCard({ product }) {
  const { t } = useLanguage();
  const [reservedAfterConflict, setReservedAfterConflict] = useState(false);
  useEffect(() => setReservedAfterConflict(false), [product]);
  const displayedProduct = reservedAfterConflict
    ? { ...product, quantity: 0, availableQuantity: 0, temporarilyReserved: true, availabilityStatus: "Temporarily Unavailable" }
    : product;
  return (
    <article className="product-card">
      <div className="product-card-image-wrap">
        {displayedProduct.isFeatured && <span className="discount-badge">Featured</span>}
        <ProductMediaCarousel product={displayedProduct} />
        {Number(displayedProduct.availableQuantity ?? 0) <= 0 && <span className={`stock-ribbon${displayedProduct.temporarilyReserved ? " stock-ribbon-reserved" : ""}`} aria-label={displayedProduct.availabilityStatus || "Out of Stock"}>{displayedProduct.availabilityStatus || "Out of Stock"}</span>}
      </div>
      <div className="product-card-body">
        <p className="pill">{displayedProduct.category}</p>
        <h3>{displayedProduct.productName}</h3>
        <p className="product-desc">{displayedProduct.description}</p>
        <RatingBadge rating={displayedProduct.rating} productId={displayedProduct.productId} />
        <div className="product-meta">
          <span className={Number(displayedProduct.availableQuantity ?? 0) > 0 ? "status in" : "status out"}>
            {Number(displayedProduct.availableQuantity ?? 0) > 0 ? t("inStock") : displayedProduct.availabilityStatus || t("outOfStock")}
          </span>
          <ProductPrice product={displayedProduct} showSavings={false} />
        </div>
        {displayedProduct.temporarilyReserved && <p className="reserved-note" role="status">Another customer is completing checkout. Please try again shortly.</p>}
        <Link className="btn btn-outline" to={`/products/${displayedProduct.productId}`}>
          {t("viewDetails")}
        </Link>
        <ProductCardActions product={displayedProduct} onUnavailable={() => setReservedAfterConflict(true)} />
      </div>
    </article>
  );
}
