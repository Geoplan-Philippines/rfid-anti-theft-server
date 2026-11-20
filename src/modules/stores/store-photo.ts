export const STORE_PHOTO_FIELD = 'photo';
export const STORE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const STORE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const STORE_PHOTO_TYPE_MESSAGE = 'Photo must be a JPG, PNG or WebP image.';
export const STORE_PHOTO_SIZE_MESSAGE = 'Photo must be 5 MB or smaller.';

export type StorePhotoExtension = 'jpg' | 'png' | 'webp';

/** The parts of a multer in-memory file the stores module reads. */
export type UploadedStorePhoto = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_TAG = 'RIFF';
const WEBP_TAG = 'WEBP';

/**
 * The image type read from the file's first bytes, or null when it is not a JPG, PNG or WebP.
 * The mimetype the browser sends is only a hint, so the saved extension comes from here.
 */
export function detectStorePhotoExtension(buffer: Buffer): StorePhotoExtension | null {
  if (startsWith(buffer, JPEG_SIGNATURE)) {
    return 'jpg';
  }

  if (startsWith(buffer, PNG_SIGNATURE)) {
    return 'png';
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === RIFF_TAG && buffer.toString('ascii', 8, 12) === WEBP_TAG) {
    return 'webp';
  }

  return null;
}

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}
