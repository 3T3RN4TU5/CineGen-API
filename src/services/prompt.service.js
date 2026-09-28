import { CAMERA_PRESETS, STYLE_PRESETS, QUALITY_SUFFIX, IMAGE_QUALITY_SUFFIX } from '../config/presets.config.js';

/**
 * Builds the prompt sent to the model: user prompt + camera fragment + style fragment + quality suffix.
 * Camera motion is ignored for text-to-image. The result is trimmed to `maxLength` without
 * cutting the user's own words when possible (fragments are dropped from the end first).
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.cameraPreset]
 * @param {string} [opts.stylePreset]
 * @param {string} [opts.type]
 * @param {number} [opts.maxLength]
 * @returns {string}
 */
export const enhancePrompt = ({ prompt, cameraPreset, stylePreset, type = 'text-to-video', maxLength = 2000 }) => {
  const base = String(prompt ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;\s]+$/, '');
  const isImage = type === 'text-to-image';

  const parts = [base];
  if (!isImage && cameraPreset && CAMERA_PRESETS[cameraPreset]) parts.push(CAMERA_PRESETS[cameraPreset].fragment);
  if (stylePreset && STYLE_PRESETS[stylePreset]) parts.push(STYLE_PRESETS[stylePreset].fragment);
  parts.push(isImage ? IMAGE_QUALITY_SUFFIX : QUALITY_SUFFIX);

  // Drop trailing fragments until it fits, then hard-trim as a last resort.
  while (parts.length > 1 && parts.join(', ').length > maxLength) parts.pop();
  const result = parts.join(', ');
  return result.length > maxLength ? result.slice(0, maxLength).trim() : result;
};

export const isValidCameraPreset = (key) => Object.hasOwn(CAMERA_PRESETS, key);
export const isValidStylePreset = (key) => Object.hasOwn(STYLE_PRESETS, key);
