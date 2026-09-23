import test from "node:test";
import assert from "node:assert/strict";
import { mergeProductImages } from "../src/product-images.js";

const storedValue = JSON.stringify(["image-1", "image-2", "image-3"]);

test("preserves every stored image when an update omits image fields", () => {
  assert.deepEqual(mergeProductImages({ storedValue }), {
    imageUrls: ["image-1", "image-2", "image-3"],
    removedUrls: []
  });
});

test("adds uploads after retained images without duplicates", () => {
  assert.deepEqual(mergeProductImages({ storedValue, existingImages: storedValue, uploadedUrls: ["image-4", "image-2"] }), {
    imageUrls: ["image-1", "image-2", "image-3", "image-4"],
    removedUrls: []
  });
});

test("removes only images omitted from the explicit retained list", () => {
  assert.deepEqual(mergeProductImages({ storedValue, existingImages: JSON.stringify(["image-1", "image-3"]) }), {
    imageUrls: ["image-1", "image-3"],
    removedUrls: ["image-2"]
  });
});

test("uses the explicit retained list order", () => {
  assert.deepEqual(mergeProductImages({ storedValue, existingImages: JSON.stringify(["image-3", "image-1", "image-2"]) }), {
    imageUrls: ["image-3", "image-1", "image-2"],
    removedUrls: []
  });
});

test("ignores retained URLs that do not belong to the product", () => {
  assert.deepEqual(mergeProductImages({ storedValue, existingImages: JSON.stringify(["image-1", "other-product-image"]) }), {
    imageUrls: ["image-1"],
    removedUrls: ["image-2", "image-3"]
  });
});