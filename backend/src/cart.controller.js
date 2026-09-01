import { addToCart, emptyCart, getCart, removeCartItem, updateQuantity } from "./cart.service.js";

export async function get(req, res, next) {
  try { return res.json(await getCart(req.user.userId)); } catch (error) { return next(error); }
}
export async function add(req, res, next) {
  console.info(JSON.stringify({ level: "info", message: "Cart add controller hit", requestId: req.requestId, userId: req.user.userId, productId: req.body.productId, quantity: req.body.quantity }));
  try { return res.status(201).json({ success: true, message: "Added to cart successfully.", ...(await addToCart(req.user.userId, Number(req.body.productId), Number(req.body.quantity), req.requestId)) }); } catch (error) { return next(error); }
}
export async function update(req, res, next) {
  try { return res.json({ success: true, message: "Cart quantity updated.", ...(await updateQuantity(req.user.userId, Number(req.params.id), Number(req.body.quantity))) }); } catch (error) { return next(error); }
}
export async function remove(req, res, next) {
  try { return res.json({ success: true, message: "Item removed from cart.", ...(await removeCartItem(req.user.userId, Number(req.params.id))) }); } catch (error) { return next(error); }
}
export async function clear(req, res, next) {
  try { return res.json({ success: true, message: "Cart cleared successfully.", ...(await emptyCart(req.user.userId)) }); } catch (error) { return next(error); }
}