import fs from "node:fs";
import multer from "multer";
import { env } from "../config/env.js";

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
    cb(null, safeName);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true)
});

export function getUploadMeta(file) {
  if (!file) {
    return { attachmentPath: null, attachmentName: null };
  }

  return {
    attachmentPath: file.filename,
    attachmentName: file.originalname
  };
}
