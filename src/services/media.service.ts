import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import ApiError from "../utils/ApiError";

const UPLOADS_ROOT = path.join(__dirname, "../../uploads");
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const ensureUploadFolder = async (subfolder: string): Promise<string> => {
  const folder = path.join(UPLOADS_ROOT, subfolder);
  await fs.promises.mkdir(folder, { recursive: true });
  return folder;
};

const relativePathFor = (subfolder: string, filename: string): string =>
  path.posix.join("/uploads", subfolder.replace(/\\/g, "/"), filename);

const isRelativeUploadPath = (value: string): boolean =>
  value.startsWith("/uploads/");

/**
 * Compress and save an image buffer to local disk.
 * Returns the relative path: /uploads/{subfolder}/{filename}.webp
 */
export async function uploadAndCompressImage(
  fileBuffer: Buffer,
  subfolder: string,
  _originalName?: string,
  options: { autoOrient?: boolean } = {},
): Promise<string> {
  if (!fileBuffer || fileBuffer.byteLength === 0) {
    throw new ApiError(400, "Image file is empty.");
  }

  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw new ApiError(400, "File exceeds 8MB limit");
  }

  const filename = `${crypto.randomUUID()}.webp`;
  const destDir = await ensureUploadFolder(subfolder);
  const destPath = path.join(destDir, filename);

  const pipeline = sharp(fileBuffer);
  if (options.autoOrient) pipeline.rotate();
  await pipeline
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destPath);

  return relativePathFor(subfolder, filename);
}

/**
 * Delete a local file given its relative path (/uploads/gallery/abc.webp).
 * Silently ignores if file does not exist.
 */
export async function deleteLocalFile(relativePath: string): Promise<void> {
  if (!relativePath || !isRelativeUploadPath(relativePath)) return;

  const fullPath = path.join(
    UPLOADS_ROOT,
    relativePath.replace(/^\/uploads\//, ""),
  );
  const relative = path.relative(UPLOADS_ROOT, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new ApiError(400, "Invalid upload path");

  try {
    await fs.promises.unlink(fullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Construct a full public URL from a relative path.
 * Use this only when sending responses, never for storage.
 */
export function toPublicUrl(relativePath: string): string {
  if (!relativePath) return "";
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const base = (process.env.APP_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");
  const normalized = relativePath.startsWith("/")
    ? relativePath
    : `/${relativePath}`;
  return `${base}${normalized}`;
}

export const uploadProfilePicture = async (
  fileBuffer: Buffer,
  _firebaseUid: string,
): Promise<string> => {
  return uploadAndCompressImage(fileBuffer, "avatars");
};

export const uploadBookingScreenshot = async (
  fileBuffer: Buffer,
  bookingId: string,
): Promise<string> => {
  return uploadAndCompressImage(fileBuffer, `booking-screenshots/${bookingId}`);
};
