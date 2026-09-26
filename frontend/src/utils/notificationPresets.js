export const notificationPresets = {
  RESERVATION_STARTED: {
    variant: "success",
    icon: "cart",
    eyebrow: "Checkout reserved",
    title: "Items Reserved Successfully",
    message: "Great news! Your items are reserved exclusively for you for the next 5 minutes. Complete your payment before the timer expires.",
    primaryLabel: "Continue Checkout"
  },
  RESERVATION_EXPIRING: {
    variant: "warning",
    icon: "timer",
    eyebrow: "Act now",
    title: "Reservation Ending Soon",
    message: "Less than 2 minutes remain. Complete your payment now to avoid losing your reserved items.",
    primaryLabel: "Complete Payment"
  },
  RESERVATION_EXPIRED: {
    variant: "error",
    icon: "clock",
    eyebrow: "Reservation closed",
    title: "Reservation Expired",
    message: "Your reservation has expired and the items are now available to other customers. Please restart checkout if you'd like to purchase them.",
    primaryLabel: "Return to Cart"
  },
  PAYMENT_SUBMITTED: {
    variant: "info",
    icon: "payment",
    eyebrow: "Verification in progress",
    title: "Payment Submitted",
    message: "Your payment proof has been received and is currently being reviewed. We'll notify you once verification is complete.",
    primaryLabel: "View Order"
  },
  PAYMENT_APPROVED: {
    variant: "success",
    icon: "check",
    eyebrow: "Payment verified",
    title: "Payment Confirmed",
    message: "Your payment has been successfully verified. We're now preparing your order.",
    primaryLabel: "Track Order"
  },
  PAYMENT_REJECTED: {
    variant: "error",
    icon: "declined",
    eyebrow: "Action required",
    title: "Payment Verification Failed",
    message: "Unfortunately, we couldn't verify your payment. Please review the details and try again or contact support.",
    primaryLabel: "Upload Again"
  },
  ORDER_PLACED: {
    variant: "success",
    icon: "check",
    eyebrow: "Payment Under Verification",
    title: "Order Placed Successfully",
    message: "Your order has been placed successfully and your payment is currently under verification. We'll notify you once the payment verification is completed.",
    primaryLabel: "View Order"
  },
  ORDER_PROCESSING: {
    variant: "info",
    icon: "info",
    eyebrow: "Order update",
    title: "Processing",
    message: "Your order is being prepared for packing.",
    primaryLabel: "Track Order"
  },
  ORDER_PACKED: {
    variant: "info",
    icon: "package",
    eyebrow: "Order update",
    title: "Order Packed",
    message: "Your order has been packed and is ready to leave our store.",
    primaryLabel: "Track Order"
  },
  ORDER_SHIPPED: {
    variant: "info",
    icon: "shipping",
    eyebrow: "Order update",
    title: "Order Shipped",
    message: "Your order is on its way. Track it any time from your orders page.",
    primaryLabel: "Track Order"
  },
  ORDER_OUT_FOR_DELIVERY: {
    variant: "info",
    icon: "shipping",
    eyebrow: "Order update",
    title: "Out For Delivery",
    message: "Your order is with the delivery partner and is out for delivery.",
    primaryLabel: "Track Order"
  },
  ORDER_DELIVERED: {
    variant: "success",
    icon: "check",
    eyebrow: "Order complete",
    title: "Order Delivered",
    message: "Your order has been delivered successfully.",
    primaryLabel: "View Order"
  },
  ORDER_REFUNDED: {
    variant: "info",
    icon: "check",
    eyebrow: "Refund complete",
    title: "Refund Completed",
    message: "Your refund has been completed.",
    primaryLabel: "View Order"
  },
  ORDER_CANCELLED: {
    variant: "warning",
    icon: "alert",
    eyebrow: "Order closed",
    title: "Order Cancelled",
    message: "Your order has been cancelled. Any eligible refund will be processed automatically.",
    primaryLabel: "View Order"
  },
  ITEM_UNAVAILABLE: {
    variant: "warning",
    icon: "timer",
    eyebrow: "Checkout in progress",
    title: "Temporarily Unavailable",
    message: "Another customer is completing checkout for this item. Please try again shortly.",
    primaryLabel: "Got It"
  }
};

export function resolveNotificationVisual(notification = {}) {
  const type = notification.type || "";
  const title = (notification.title || "").toLowerCase();
  if (type === "RESERVATION_STARTED") return { variant: "success", icon: "cart" };
  if (type === "RESERVATION_EXPIRING") return { variant: "warning", icon: "timer" };
  if (type === "RESERVATION_EXPIRED") return { variant: "error", icon: "clock" };
  if (type === "PAYMENT_STATUS") {
    if (/verified|confirmed|approved/.test(title)) return { variant: "success", icon: "check" };
    if (/failed|rejected|declined/.test(title)) return { variant: "error", icon: "declined" };
    return { variant: "warning", icon: "payment" };
  }
  if (type === "ORDER_STATUS" || type === "ORDER_PLACED") {
    if (title.includes("delivered")) return { variant: "success", icon: "check" };
    if (/cancelled|failed/.test(title)) return { variant: "error", icon: "declined" };
    if (/shipped|out for delivery/.test(title)) return { variant: "info", icon: "shipping" };
    if (title.includes("packed")) return { variant: "info", icon: "package" };
    if (title.includes("placed")) return { variant: "success", icon: "check" };
    return { variant: "info", icon: "info" };
  }
  if (type === "BACK_IN_STOCK" || type === "INVENTORY") return { variant: "success", icon: "package" };
  return { variant: "info", icon: "info" };
}

export function buildNotification(presetKey, overrides = {}) {  const preset = notificationPresets[presetKey];
  if (!preset) return { variant: "info", icon: "info", title: "Update", message: "", ...overrides };
  const { primaryLabel, ...rest } = preset;
  return {
    ...rest,
    ...overrides,
    primaryAction: { label: primaryLabel, ...overrides.primaryAction }
  };
}
