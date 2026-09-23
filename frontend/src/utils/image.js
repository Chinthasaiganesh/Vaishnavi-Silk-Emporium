export const fallbackImage = "https://images.unsplash.com/photo-1610189020380-dc0d7a3e743d?auto=format&fit=crop&w=500&q=80";

export function useFallbackImage(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = fallbackImage;
}

export function resolveImageUrl(value, width = 500) {
  const url = normalizeImageValue(value);
  if (!url) return fallbackImage;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiRoot = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api")).replace("/api", "");
  return `${apiRoot}${url.startsWith("/") ? url : `/${url}`}`;
}

export function normalizeImageValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.find(Boolean) || "";
  if (typeof value !== "string") return "";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.find(Boolean) || "";
    if (typeof parsed === "string") return parsed;
  } catch {
    // Stored legacy paths are plain strings.
  }
  return value;
}
