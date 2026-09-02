import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { uploadDir } from "../middleware/upload";

// Photo storage for faulty/missing device reports. Two modes, chosen purely
// by which environment variables are set — no code change needed to switch:
//
//   - Cloud (recommended for anything hosted, e.g. Render): set S3_BUCKET,
//     S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and
//     S3_PUBLIC_URL_BASE. Works with any S3-compatible provider — Cloudflare
//     R2, Backblaze B2, Supabase Storage, AWS S3 itself, etc. Photos get a
//     stable public URL that works from any device, and survive redeploys
//     (unlike local disk on hosts like Render's free tier).
//   - Local disk (default): if S3_BUCKET isn't set, photos are written to
//     server/uploads and served at /uploads/<file>, same as before. Fine for
//     a local-network deployment where the server's disk is durable.

const s3Bucket = process.env.S3_BUCKET;
const s3PublicBase = process.env.S3_PUBLIC_URL_BASE;

const s3Client =
  s3Bucket && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      })
    : null;

export const cloudStorageEnabled = !!s3Client && !!s3Bucket && !!s3PublicBase;

function randomKey(originalName: string) {
  const ext = path.extname(originalName).toLowerCase() || ".jpg";
  return `issue-photos/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

/** Persists an uploaded photo and returns the URL to store on the record. */
export async function savePhoto(buffer: Buffer, originalName: string, mimetype: string): Promise<string> {
  const key = randomKey(originalName);

  if (cloudStorageEnabled) {
    await s3Client!.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      })
    );
    return `${s3PublicBase!.replace(/\/+$/, "")}/${key}`;
  }

  const filename = path.basename(key);
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}
