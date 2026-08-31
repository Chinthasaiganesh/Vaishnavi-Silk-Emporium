const indianCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === "") return "Price unavailable";
  return indianCurrency.format(Number(amount));
}
