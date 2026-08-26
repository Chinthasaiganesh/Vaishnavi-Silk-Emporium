import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { imageSize } from "image-size";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
  }
  return cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export function validateAvatarDimensions(req, res, next) {
  if (!req.file) {
    return next();
  }

  try {
    const { width, height } = imageSize(fs.readFileSync(req.file.path));
    if (!width || !height || width < 100 || height < 100) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Image dimensions must be at least 100 x 100 pixels." });
    }
  } catch {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: "Unable to read image. Upload a valid JPG, PNG, or WEBP file." });
  }

  return next();
}
