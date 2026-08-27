const indianCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

export function formatCurrency(amount) {
  return indianCurrency.format(Number(amount) || 0);
}
