export function priceReservedItems(items) {
  return items.map((item) => {
    const price = Number(item.UnitPrice);
    const originalPrice = Math.max(price, Number(item.OriginalPrice ?? item.UnitPrice));
    const savingsAmount = Math.max(0, originalPrice - price);
    return {
      ...item,
      Price: price,
      OriginalPrice: originalPrice,
      DiscountedPrice: price,
      SavingsAmount: savingsAmount,
      DiscountPercentage: originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0
    };
  });
}

export function calculateOrderTotals(items) {
  return {
    subtotal: items.reduce((sum, item) => sum + item.Price * item.Quantity, 0),
    discount: items.reduce((sum, item) => sum + item.SavingsAmount * item.Quantity, 0)
  };
}