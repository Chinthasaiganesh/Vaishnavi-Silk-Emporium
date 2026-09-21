import { useState } from "react";
import { useCart } from "../CartContext";
import { useNavigate } from "react-router-dom";

export default function AddToCartButton({ product, inCart = false, className = "btn btn-primary" }) {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const outOfStock = product.quantity <= 0;

  async function handleAdd() {
    if (inCart) {
      navigate("/cart");
      return;
    }
    setAdding(true);
    const image = document.querySelector(`[data-cart-product="${product.productId}"]`);
    const cart = document.querySelector(".cart-link");
    const succeeded = await addToCart(product.productId, 1, product, image?.getBoundingClientRect(), cart?.getBoundingClientRect());
    setAdding(false);
    if (succeeded) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    }
  }

  return <button className={`${inCart ? "in-cart-button" : className} add-to-cart-button${added ? " add-to-cart-added" : ""}`} disabled={(!inCart && outOfStock) || adding || added} onClick={handleAdd} aria-live="polite">{inCart ? (added ? "✓ Added" : "✓ In Cart") : outOfStock ? "Out Of Stock" : adding ? <><span className="button-spinner" aria-hidden="true" />Adding...</> : "Add To Cart"}</button>;
}