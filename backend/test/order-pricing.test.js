import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrderTotals, priceReservedItems } from "../src/order-pricing.js";

test("preserves reservation prices and calculates order discounts by quantity", () => {
  const pricedItems = priceReservedItems([
    { ProductId: 1, UnitPrice: "80.00", OriginalPrice: "100.00", Quantity: 2 },
    { ProductId: 2, UnitPrice: "50.00", OriginalPrice: "50.00", Quantity: 1 }
  ]);

  assert.deepEqual(pricedItems.map(({ Price, OriginalPrice, DiscountedPrice, SavingsAmount, DiscountPercentage }) => ({
    Price,
    OriginalPrice,
    DiscountedPrice,
    SavingsAmount,
    DiscountPercentage
  })), [
    { Price: 80, OriginalPrice: 100, DiscountedPrice: 80, SavingsAmount: 20, DiscountPercentage: 20 },
    { Price: 50, OriginalPrice: 50, DiscountedPrice: 50, SavingsAmount: 0, DiscountPercentage: 0 }
  ]);
  assert.deepEqual(calculateOrderTotals(pricedItems), { subtotal: 210, discount: 40 });
});

test("uses the reserved selling price when an older reservation has no original price", () => {
  const [item] = priceReservedItems([{ UnitPrice: "75.00", Quantity: 1 }]);

  assert.equal(item.OriginalPrice, 75);
  assert.equal(item.SavingsAmount, 0);
});

test("does not show an original price below a legacy reservation's locked price", () => {
  const [item] = priceReservedItems([{ UnitPrice: "75.00", OriginalPrice: "70.00", Quantity: 1 }]);

  assert.equal(item.OriginalPrice, 75);
  assert.equal(item.SavingsAmount, 0);
});