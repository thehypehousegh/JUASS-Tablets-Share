import fs from "fs";
import multer from "multer";
import path from "path";

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Buffered in memory rather than written straight to disk: the route
// handler decides where the photo actually ends up (local disk or cloud
// object storage) via utils/storage.ts.
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadJson = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export { uploadDir };
