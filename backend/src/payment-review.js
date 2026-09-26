export function normalizeRejectionReason(paymentStatus, rejectionReason) {
  if (paymentStatus !== "REJECTED") return null;
  const normalized = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (!normalized) throw Object.assign(new Error("A rejection reason is required."), { status: 400 });
  return normalized;
}