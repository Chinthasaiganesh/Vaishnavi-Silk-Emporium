import { formatCurrency } from "../utils/currency";

export default function ProductPrice({ product, className = "" }) {
  const hasDiscount = product.discountedPrice !== null && product.discountedPrice !== undefined && Number(product.discountedPrice) < Number(product.originalPrice ?? product.price);
  const originalPrice = Number(product.originalPrice ?? product.price ?? 0);
  const sellingPrice = Number(product.price ?? product.discountedPrice ?? originalPrice);

  return (
    <span className={`product-price${hasDiscount ? " product-price-discounted" : ""}${className ? ` ${className}` : ""}`} aria-label={hasDiscount ? `Sale price ${formatCurrency(sellingPrice)}, original price ${formatCurrency(originalPrice)}` : `Price ${formatCurrency(sellingPrice)}`}>
      {hasDiscount && <><del>{formatCurrency(originalPrice)}</del><span className="discount-percentage">-{product.discountPercentage ?? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)}%</span></>}
      <strong>{formatCurrency(sellingPrice)}</strong>
    </span>
  );
}
