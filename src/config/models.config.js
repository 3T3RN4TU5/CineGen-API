/**
 * AI model catalog. Adding or tuning a model only requires editing this array.
 *
 * Each entry:
 *  - key                 public identifier used by the API
 *  - type                'text-to-video' | 'image-to-video' | 'text-to-image'
 *  - falModelId          fal.ai endpoint id (see README "Model IDs" — verify on fal.ai before going live)
 *  - enabled             disabled models are hidden from /models and rejected by /generations
 *  - creditCostPerSecond cost for video models (total = perSecond * duration)
 *  - creditCostFlat      cost for image models
 *  - durations / aspectRatios / resolutions  allowed values (first one is the default)
 *  - maxPromptLength     enhanced prompt is trimmed to this length
 *  - buildInput          maps our normalized params to the model's input shape
 *  - extractOutputUrl    pulls the output file URL out of the fal result data
 *
 * Credit costs are internal units (1 credit ≈ ₹1) set above fal's list price.
 */

const IMAGE_SIZE_BY_ASPECT = {
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
};

/** fal returns `{ data, requestId }` from queue.result, while webhooks deliver the bare payload. */
const unwrap = (result) => result?.data ?? result;

export const MODELS = [
  {
    key: 'ltx-fast',
    name: 'LTX-2 Fast',
    type: 'text-to-video',
    falModelId: 'fal-ai/ltx-2/text-to-video/fast',
    enabled: true,
    tier: 'budget',
    creditCostPerSecond: 4,
    durations: [6, 8, 10],
    aspectRatios: ['16:9'],
    resolutions: ['1080p'],
    maxPromptLength: 1500,
    buildInput: ({ prompt, duration, aspectRatio, resolution }) => ({
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      resolution,
      generate_audio: false,
    }),
    extractOutputUrl: (result) => unwrap(result)?.video?.url,
    description: 'Fast and cheap. Good for testing ideas.',
  },
  {
    key: 'kling-v3',
    name: 'Kling 3.0 Standard',
    type: 'text-to-video',
    falModelId: 'fal-ai/kling-video/v3/standard/text-to-video',
    enabled: true,
    tier: 'premium',
    creditCostPerSecond: 12,
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    maxPromptLength: 2500,
    buildInput: ({ prompt, duration, aspectRatio }) => ({
      prompt,
      duration: String(duration),
      aspect_ratio: aspectRatio,
      generate_audio: false,
      negative_prompt: 'blur, distort, and low quality',
    }),
    extractOutputUrl: (result) => unwrap(result)?.video?.url,
    description: 'Premium cinematic motion and prompt adherence.',
  },
  {
    key: 'seedance-i2v',
    name: 'Seedance 1.0 Pro Fast (Image → Video)',
    type: 'image-to-video',
    falModelId: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    enabled: true,
    tier: 'standard',
    creditCostPerSecond: 6,
    durations: [5, 10],
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    resolutions: ['720p', '1080p', '480p'],
    maxPromptLength: 2000,
    buildInput: ({ prompt, duration, aspectRatio, resolution, imageUrl }) => ({
      prompt,
      image_url: imageUrl,
      duration: String(duration),
      aspect_ratio: aspectRatio,
      resolution,
    }),
    extractOutputUrl: (result) => unwrap(result)?.video?.url,
    description: 'Bring a still image to life with smooth camera motion.',
  },
  {
    key: 'flux-schnell',
    name: 'FLUX.1 [schnell]',
    type: 'text-to-image',
    falModelId: 'fal-ai/flux/schnell',
    enabled: true,
    tier: 'budget',
    creditCostFlat: 2,
    durations: [],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    maxPromptLength: 1500,
    buildInput: ({ prompt, aspectRatio }) => ({
      prompt,
      image_size: IMAGE_SIZE_BY_ASPECT[aspectRatio] ?? 'landscape_16_9',
      num_images: 1,
      enable_safety_checker: true,
    }),
    extractOutputUrl: (result) => unwrap(result)?.images?.[0]?.url,
    description: 'Very fast text-to-image. Great for storyboards and key frames.',
  },
];

export const GENERATION_TYPES = ['text-to-video', 'image-to-video', 'text-to-image'];

/** Admin toggles are kept in memory (reset on restart); edit `enabled` above for permanent changes. */
const overrides = new Map();

export const isEnabled = (model) => (overrides.has(model.key) ? overrides.get(model.key) : model.enabled);

export const setModelEnabled = (key, enabled) => {
  const model = MODELS.find((m) => m.key === key);
  if (!model) return null;
  overrides.set(key, Boolean(enabled));
  return model;
};

export const getModel = (key) => MODELS.find((m) => m.key === key);
export const getEnabledModels = () => MODELS.filter(isEnabled);
export const isVideoType = (type) => type !== 'text-to-image';

/**
 * Credit cost for a generation.
 * @param {object} model
 * @param {{ duration?: number }} params
 */
export const calculateCost = (model, { duration } = {}) =>
  model.creditCostFlat ?? model.creditCostPerSecond * (duration ?? model.durations[0]);

/** Public-safe representation (no functions, no internal ids). */
export const toPublicModel = (m) => ({
  key: m.key,
  name: m.name,
  type: m.type,
  tier: m.tier,
  description: m.description,
  creditCost: m.creditCostFlat
    ? { flat: m.creditCostFlat }
    : {
        perSecond: m.creditCostPerSecond,
        byDuration: Object.fromEntries(m.durations.map((d) => [d, calculateCost(m, { duration: d })])),
      },
  durations: m.durations,
  aspectRatios: m.aspectRatios,
  resolutions: m.resolutions ?? [],
  requiresImage: m.type === 'image-to-video',
});
