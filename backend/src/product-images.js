export function parseImageUrls(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [value];
  } catch {
    return [value];
  }
}

export function mergeProductImages({ storedValue, existingImages, newImageUrl, uploadedUrls = [] }) {
  const storedUrls = parseImageUrls(storedValue);
  const retainedUrls = existingImages === undefined
    ? storedUrls
    : parseImageUrls(existingImages).filter((url) => storedUrls.includes(url));
  const imageUrls = [...new Set([...retainedUrls, ...parseImageUrls(newImageUrl), ...uploadedUrls])];
  const removedUrls = storedUrls.filter((url) => !imageUrls.includes(url));
  return { imageUrls, removedUrls };
}