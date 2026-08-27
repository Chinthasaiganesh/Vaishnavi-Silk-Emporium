import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { addRecentlyViewed } from "../customerData";
import { Link } from "react-router-dom";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "../components/RatingBadge";
import ProductCardActions from "../components/ProductCardActions";
import { formatCurrency } from "../utils/currency";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/products/public/${id}`);
        if (!cancelled) {
          setProduct(response.data.product);
          if (user?.role === "USER") {
            addRecentlyViewed(user.userId, response.data.product);
          }
        }
      } catch {
        if (!cancelled) {
          setError("Product not found or unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (loading) {
    return <main className="container section">Loading product...</main>;
  }

  if (error || !product) {
    return <main className="container section error-text">{error || "Product unavailable."}</main>;
  }

  const imageSrc = resolveImage(product.imageUrl);

  return (
    <main className="container section detail-grid">
      <section className="detail-media">
        <img data-cart-product={product.productId} src={imageSrc} alt={product.productName} />
      </section>
      <section className="detail-content">
        <p className="pill">{product.category}</p>
        <h1>{product.productName}</h1>
        <p>{product.description}</p>
        <dl className="saree-details">
          <dt>Fabric</dt><dd>{product.fabric || "Artisan fabric"}</dd>
          <dt>Weaving Style</dt><dd>{product.weavingStyle || "Traditional weave"}</dd>
          <dt>Colour</dt><dd>{product.colour || "Curated colour"}</dd>
          <dt>Occasion</dt><dd>{product.occasion || "Traditional events"}</dd>
          <dt>Saree Length</dt><dd>{product.sareeLength || "5.5 metres"}</dd>
          <dt>Blouse Piece</dt><dd>{product.blousePieceIncluded ? "Included" : "Not included"}</dd>
          <dt>Care</dt><dd>{product.careInstructions || "Dry clean only"}</dd>
        </dl>
        <RatingBadge rating={product.rating} />
        {product.canViewPrice ? <h2>{formatCurrency(product.price)}</h2> : <Link className="price-lock detail-price-lock" to="/login">Lock Sign In to View Pricing</Link>}
        <p className={product.quantity > 0 ? "status in" : "status out"}>
          {product.quantity > 0 ? t("inStock") : t("outOfStock")}
        </p>
        <ProductCardActions product={product} />
      </section>
    </main>
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
