function key(userId, name) {
  return `blueorbit_${name}_${userId}`;
}

function read(userId, name) {
  return JSON.parse(localStorage.getItem(key(userId, name)) || "[]");
}

function write(userId, name, value) {
  localStorage.setItem(key(userId, name), JSON.stringify(value));
}

export function addRecentlyViewed(userId, product) {
  const viewed = read(userId, "recently_viewed").filter((item) => item.productId !== product.productId);
  write(userId, "recently_viewed", [{ ...product, viewedAt: new Date().toISOString() }, ...viewed].slice(0, 12));
}

export function getRecentlyViewed(userId) {
  return read(userId, "recently_viewed");
}

export function getWishlist(userId) {
  return read(userId, "wishlist");
}

export function addWishlistItem(userId, product) {
  const wishlist = getWishlist(userId);
  if (!wishlist.some((item) => item.productId === product.productId)) {
    write(userId, "wishlist", [product, ...wishlist]);
  }
}

export function removeWishlistItem(userId, productId) {
  write(userId, "wishlist", getWishlist(userId).filter((product) => product.productId !== productId));
}