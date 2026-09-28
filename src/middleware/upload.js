import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(400, 'INVALID_FILE_TYPE', 'Only JPG, PNG and WEBP images are allowed.')),
}).single('image');

/** Magic-byte check so a renamed file cannot pass the MIME filter. */
export const assertImageSignature = (buffer) => {
  const hex = buffer.subarray(0, 12).toString('hex');
  const isJpeg = hex.startsWith('ffd8ff');
  const isPng = hex.startsWith('89504e470d0a1a0a');
  const isWebp = hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  if (!isJpeg && !isPng && !isWebp) throw new ApiError(400, 'INVALID_FILE_TYPE', 'File content is not a valid image.');
};
