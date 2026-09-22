import ProductPrice from "./ProductPrice";
import AddToCartButton from "./AddToCartButton";
import { NotifyWhenAvailableButton } from "./ProductCardActions";
import { useCart } from "../CartContext";
import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  const { cart } = useCart();
  const inCart = cart.items.some((item) => item.productId === product.productId);
  return (
    <article className="product-card">
      <img data-cart-product={product.productId} src={resolveImage(product.imageUrl)} alt={product.productName} loading="lazy" />
      <div className="product-card-body">
        <p className="product-card-category">{product.category}</p>
        <h3>{product.productName}</h3>
        <ProductPrice product={product} />
        <Link className="product-card-details" to={`/products/${product.productId}`}>View Details</Link>
        {product.quantity > 0 ? <AddToCartButton product={product} inCart={inCart} /> : <NotifyWhenAvailableButton product={product} />}
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
