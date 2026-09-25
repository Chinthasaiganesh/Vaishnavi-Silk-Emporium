import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useCart } from "../CartContext";
import { formatCurrency } from "../utils/currency";
import ProductPrice from "../components/ProductPrice";
import { resolveImageUrl } from "../utils/image";

function money(value) { return formatCurrency(value); }

export default function CartPage() {
  const location = useLocation();
  const { cart, updateQuantity, removeItem, clearCart } = useCart();
  const { items, totals } = cart;

  useEffect(() => {
    if (!location.state?.message) return;
    window.alert(location.state.message);
    window.history.replaceState({}, document.title);
  }, [location]);

  return <main className="container section cart-page">
    <div className="section-head"><div><p className="eyebrow">Your selection</p><h1>Shopping Cart</h1></div>{items.length > 0 && <button className="btn btn-outline" onClick={clearCart}>Clear Cart</button>}</div>
    {items.length === 0 ? <section className="cart-empty"><div className="cart-empty-icon" aria-hidden="true">Cart</div><h2>Your cart is empty</h2><p>Explore our beautiful saree collections.</p><Link className="btn btn-primary" to="/products">Continue Shopping</Link></section> : <div className="cart-layout"><section className="cart-items">{items.map((item) => <article className="cart-item" key={item.cartItemId}><img src={resolveImage(item.imageUrl)} alt={item.productName} /><div className="cart-item-info"><p className="pill">{item.category}</p><h2>{item.productName}</h2><ProductPrice product={{ price: item.unitPrice, originalPrice: item.originalPrice, discountedPrice: item.discountedPrice, discountPercentage: item.discountPercentage }} /><p className="cart-stock">{item.availableStock} available</p></div><div className="cart-item-actions"><div className="quantity-stepper"><button aria-label={`Decrease ${item.productName} quantity`} disabled={item.quantity <= 1} onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}>-</button><span>{item.quantity}</span><button aria-label={`Increase ${item.productName} quantity`} disabled={item.quantity >= item.availableStock} onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}>+</button></div><strong>{money(item.subtotal)}</strong><button className="link-btn" onClick={() => removeItem(item.cartItemId)}>Remove</button></div></article>)}</section><aside className="cart-summary"><h2>Order Summary</h2><div><span>Items</span><strong>{totals.itemCount}</strong></div><div><span>Original price</span><strong>{money(totals.originalSubtotal ?? totals.subtotal)}</strong></div><div><span>Discount</span><strong className="checkout-savings">-{money(totals.discount || 0)}</strong></div><div className="cart-total"><span>Grand Total</span><strong>{money(totals.grandTotal)}</strong></div>{Number(totals.discount) > 0 && <div className="order-savings-callout"><strong>You save {money(totals.discount)}</strong></div>}<Link className="btn btn-primary" to="/checkout">Proceed To Checkout</Link><Link className="btn btn-outline" to="/products">Continue Shopping</Link></aside></div>}
  </main>;
}

function resolveImage(url) { return resolveImageUrl(url); }