import multer from "multer";
import { imageSize } from "image-size";

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
  }
  return cb(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export function validateAvatarDimensions(req, res, next) {
  if (!req.file) {
    return next();
  }

  try {
    const { width, height } = imageSize(req.file.buffer);
    if (!width || !height || width < 100 || height < 100) {
      return res.status(400).json({ message: "Image dimensions must be at least 100 x 100 pixels." });
    }
  } catch {
    return res.status(400).json({ message: "Unable to read image. Upload a valid JPG, PNG, or WEBP file." });
  }

  return next();
}
