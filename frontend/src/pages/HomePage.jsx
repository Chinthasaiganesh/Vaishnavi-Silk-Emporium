import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useLanguage } from "../LanguageContext";
import RatingBadge from "../components/RatingBadge";

const valueMessages = [
  "Heritage weaves, curated for modern celebrations.",
  "Silk, cotton and handloom sarees for every occasion.",
  "Elegance woven into every drape."
];

export default function HomePage() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useLanguage();
  const reducedMotion = useReducedMotion();
  const videoRef = useRef(null);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }
    const rotation = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % valueMessages.length);
    }, 3600);
    return () => window.clearInterval(rotation);
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedProducts() {
      try {
        const response = await api.get("/products/public", { params: { featured: true } });
        if (!cancelled) {
          setFeaturedProducts(response.data.products || []);
        }
      } finally {
        if (!cancelled) {
          setFeaturedLoading(false);
        }
      }
    }

    loadFeaturedProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      videoRef.current?.pause();
    }
  }, [reducedMotion]);

  const reveal = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 20 },
    visible: (delay) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay } })
  };

  return (
    <main>
      <section className="hero hero-video saree-hero" aria-label="Saree collections">
        <video
          ref={videoRef}
          className="hero-video-media"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1800&q=85"
          aria-hidden="true"
        >
          <source src="https://videos.pexels.com/video-files/3129595/3129595-hd_1920_1080_25fps.mp4" type="video/mp4" />
        </video>
        <div className="hero-video-overlay" />
        <div className="container hero-content">
          <motion.div initial="hidden" animate="visible" className="hero-copy">
            <motion.p custom={0} variants={reveal} className="eyebrow hero-eyebrow">Vaishnavi Silk Emporium</motion.p>
            <motion.h1 custom={0.12} variants={reveal} className="hero-title">
              Discover Timeless Elegance in Every Saree
            </motion.h1>
            <motion.div custom={0.24} variants={reveal} className="hero-message" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.p
                  key={valueMessages[messageIndex]}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reducedMotion ? 0 : -10 }}
                  transition={{ duration: 0.35 }}
                >
                  {valueMessages[messageIndex]}
                </motion.p>
              </AnimatePresence>
            </motion.div>
            <motion.p custom={0.34} variants={reveal} className="hero-description">
              Explore premium Silk, Cotton, Banarasi, Kanchipuram, Designer and Festive Sarees curated for every occasion.
            </motion.p>
            <motion.div custom={0.46} variants={reveal} className="hero-cta">
              <motion.div whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link className="btn btn-primary" to="/products">{t("explore")}</Link>
              </motion.div>
            </motion.div>
          </motion.div>
          <motion.aside
            className="hero-glass-card"
            initial={{ opacity: 0, x: reducedMotion ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.32 }}
          >
            <p>Handpicked heritage</p>
            <strong>Crafted for your moments</strong>
            <span>Authentic fabrics, elegant weaving and occasion-ready drapes.</span>
          </motion.aside>
        </div>
      </section>

      <section className="section container">
        {user?.role === "USER" && (
          <motion.section
            className="home-welcome"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45 }}
          >
            <p>{t("personalPicks")}</p>
            <h2>{t("welcome")}, {user.displayName || user.fullName || user.username} <span aria-hidden="true">👋</span></h2>
            <span>Explore our newest saree collections curated specially for you.</span>
          </motion.section>
        )}
        <div className="section-head featured-heading">
          <div>
            <p className="eyebrow">Handpicked For You</p>
            <h2>Featured Sarees</h2>
          </div>
          <Link className="btn btn-outline" to="/products">
            Explore Collections
          </Link>
        </div>
        <div className="featured-products-grid">
          {featuredLoading && Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index} />)}
          {featuredProducts.map((product, index) => (
            <motion.article
              className="featured-product-card"
              key={product.id}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.35, delay: reducedMotion ? 0 : Math.min(index * 0.035, 0.22) }}
              whileHover={reducedMotion ? undefined : { y: -6 }}
            >
              <div className="featured-image-wrap">
                <span className="discount-badge">Featured</span>
                <img src={resolveImage(product.imageUrl)} alt={product.productName} loading="lazy" />
              </div>
              <div className="featured-product-body">
                <p className="featured-category">{product.category}</p>
                <h3>{product.productName}</h3>
                <p className="featured-description">{product.fabric} | {product.weavingStyle}</p>
                <RatingBadge rating={product.rating} />
                <div className="featured-price-row">
                  {product.canViewPrice ? <strong>${Number(product.price).toFixed(2)}</strong> : <Link className="price-lock" to="/login">Lock Sign In to View Price</Link>}
                  <span className={product.quantity > 0 ? "featured-stock in" : "featured-stock out"}>
                    {product.quantity > 0 ? t("inStock") : t("outOfStock")}
                  </span>
                </div>
                <Link className="featured-details-link" to={`/products/${product.productId}`}>{t("viewDetails")}</Link>
              </div>
            </motion.article>
          ))}
          {!featuredLoading && featuredProducts.length === 0 && (
            <p className="featured-empty">Featured products will appear here when an admin marks active, in-stock catalog items as featured.</p>
          )}
        </div>
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
  const apiRoot = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace("/api", "");
  return `${apiRoot}${url}`;
}
