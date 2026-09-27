export function stripPaymentProof(order) {
  if (!order || typeof order !== "object") return order;
  const { PaymentScreenshotUrl, PaymentScreenshotKey, ...safeOrder } = order;
  return safeOrder;
}

export async function adminOrderWithPaymentProof(order, signUrl) {
  if (!order || typeof order !== "object") return order;
  const { PaymentScreenshotKey, PaymentScreenshotUrl: legacyUrl, ...safeOrder } = order;
  return {
    ...safeOrder,
    PaymentScreenshotUrl: PaymentScreenshotKey ? await signUrl(PaymentScreenshotKey, 300) : null,
    paymentProofMigrationPending: Boolean(legacyUrl && !PaymentScreenshotKey)
  };
}