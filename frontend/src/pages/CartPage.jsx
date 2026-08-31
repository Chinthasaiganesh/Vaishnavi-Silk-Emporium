import { Link } from "react-router-dom";
import { useCart } from "../CartContext";
import { formatCurrency } from "../utils/currency";

function money(value) { return formatCurrency(value); }

export default function CartPage() {
  const { cart, updateQuantity, removeItem, clearCart } = useCart();
  const { items, totals } = cart;

  return <main className="container section cart-page">
    <div className="section-head"><div><p className="eyebrow">Your selection</p><h1>Shopping Cart</h1></div>{items.length > 0 && <button className="btn btn-outline" onClick={clearCart}>Clear Cart</button>}</div>
    {items.length === 0 ? <section className="cart-empty"><div className="cart-empty-icon" aria-hidden="true">Cart</div><h2>Your cart is empty</h2><p>Explore our beautiful saree collections.</p><Link className="btn btn-primary" to="/products">Continue Shopping</Link></section> : <div className="cart-layout"><section className="cart-items">{items.map((item) => <article className="cart-item" key={item.cartItemId}><img src={resolveImage(item.imageUrl)} alt={item.productName} /><div className="cart-item-info"><p className="pill">{item.category}</p><h2>{item.productName}</h2><p>{money(item.unitPrice)} each</p><p className="cart-stock">{item.availableStock} available</p></div><div className="cart-item-actions"><div className="quantity-stepper"><button aria-label={`Decrease ${item.productName} quantity`} disabled={item.quantity <= 1} onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}>-</button><span>{item.quantity}</span><button aria-label={`Increase ${item.productName} quantity`} disabled={item.quantity >= item.availableStock} onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}>+</button></div><strong>{money(item.subtotal)}</strong><button className="link-btn" onClick={() => removeItem(item.cartItemId)}>Remove</button></div></article>)}</section><aside className="cart-summary"><h2>Order Summary</h2><div><span>Items</span><strong>{totals.itemCount}</strong></div><div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div><div className="cart-total"><span>Grand Total</span><strong>{money(totals.grandTotal)}</strong></div><Link className="btn btn-primary" to="/checkout">Proceed To Checkout</Link><Link className="btn btn-outline" to="/products">Continue Shopping</Link></aside></div>}
  </main>;
}

function resolveImage(url) { return url?.startsWith("http") ? url : url ? `${(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api")).replace("/api", "")}${url}` : "https://images.unsplash.com/photo-1610189020380-dc0d7a3e743d?auto=format&fit=crop&w=500&q=80"; }