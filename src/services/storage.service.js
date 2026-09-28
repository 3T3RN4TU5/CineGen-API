import { cloudinary } from '../config/cloudinary.js';

const FOLDER = 'cinegen';

/**
 * Uploads an in-memory file (user upload) to Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder?: string }} [opts]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadBuffer = (buffer, { folder = `${FOLDER}/uploads` } = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image' }, (err, result) => {
      if (err) return reject(err);
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.end(buffer);
  });

/**
 * Copies a remote file (fal output — those URLs may expire) into Cloudinary.
 * @param {string} url
 * @param {'video'|'image'} resourceType
 * @returns {Promise<{ url: string, publicId: string, thumbnailUrl?: string }>}
 */
export const uploadFromUrl = async (url, resourceType) => {
  const result = await cloudinary.uploader.upload(url, {
    folder: `${FOLDER}/outputs`,
    resource_type: resourceType,
  });
  const thumbnailUrl =
    resourceType === 'video'
      ? cloudinary.url(result.public_id, { resource_type: 'video', format: 'jpg', secure: true, start_offset: '0' })
      : undefined;
  return { url: result.secure_url, publicId: result.public_id, thumbnailUrl };
};

/**
 * Deletes an asset. Missing assets are ignored.
 * @param {string} publicId
 * @param {'video'|'image'} resourceType
 */
export const deleteAsset = async (publicId, resourceType) => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
};
