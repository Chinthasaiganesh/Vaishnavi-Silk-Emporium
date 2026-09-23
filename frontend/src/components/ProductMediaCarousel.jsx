import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { resolveImageUrl, useFallbackImage } from "../utils/image";

export default function ProductMediaCarousel({ product }) {
  const images = product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setActiveIndex(0);
  }, [product.productId]);

  useEffect(() => {
    if (reducedMotion || paused || images.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % images.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [images.length, paused, reducedMotion]);

  function showPrevious() {
    setActiveIndex((index) => (index - 1 + images.length) % images.length);
  }

  function showNext() {
    setActiveIndex((index) => (index + 1) % images.length);
  }

  return (
    <div
      className="product-media-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <img
        data-cart-product={product.productId}
        src={resolveImageUrl(images[activeIndex])}
        onError={useFallbackImage}
        alt={`${product.productName}, image ${activeIndex + 1} of ${Math.max(images.length, 1)}`}
        loading="lazy"
      />
      {images.length > 1 && (
        <>
          <button className="product-media-arrow previous" type="button" aria-label={`Previous image of ${product.productName}`} onClick={showPrevious}>‹</button>
          <button className="product-media-arrow next" type="button" aria-label={`Next image of ${product.productName}`} onClick={showNext}>›</button>
          <div className="product-media-dots" aria-label={`${product.productName} images`}>
            {images.map((url, index) => (
              <button
                className={index === activeIndex ? "active" : ""}
                type="button"
                key={`${url}-${index}`}
                aria-label={`Show image ${index + 1}`}
                aria-pressed={index === activeIndex}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
          <span className="product-media-count" aria-hidden="true">{activeIndex + 1}/{images.length}</span>
        </>
      )}
    </div>
  );
}
