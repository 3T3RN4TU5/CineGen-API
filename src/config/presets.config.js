export const CAMERA_PRESETS = {
  static: { label: 'Static', fragment: 'static locked-off camera', description: 'No camera movement.' },
  'dolly-in': {
    label: 'Dolly In',
    fragment: 'slow cinematic dolly-in toward the subject',
    description: 'Camera pushes toward the subject.',
  },
  'dolly-out': {
    label: 'Dolly Out',
    fragment: 'smooth dolly-out revealing the scene',
    description: 'Camera pulls back to reveal the scene.',
  },
  'pan-left': {
    label: 'Pan Left',
    fragment: 'smooth horizontal pan to the left',
    description: 'Horizontal pan to the left.',
  },
  'pan-right': {
    label: 'Pan Right',
    fragment: 'smooth horizontal pan to the right',
    description: 'Horizontal pan to the right.',
  },
  orbit: {
    label: 'Orbit',
    fragment: 'camera orbits around the subject in a smooth arc',
    description: 'Arc around the subject.',
  },
  'crane-up': { label: 'Crane Up', fragment: 'crane shot rising upward', description: 'Camera rises vertically.' },
  handheld: {
    label: 'Handheld',
    fragment: 'handheld camera with subtle natural shake',
    description: 'Documentary-style handheld feel.',
  },
  'fpv-drone': {
    label: 'FPV Drone',
    fragment: 'fast FPV drone flythrough',
    description: 'High-speed drone flythrough.',
  },
};

export const STYLE_PRESETS = {
  cinematic: {
    label: 'Cinematic',
    fragment:
      'cinematic lighting, anamorphic lens, shallow depth of field, rich teal and orange color grade, 35mm film look',
    description: 'Hollywood blockbuster look.',
  },
  'neon-noir': {
    label: 'Neon Noir',
    fragment:
      'neon-lit noir atmosphere, deep shadows, magenta and cyan reflections, wet surfaces, moody high-contrast grade',
    description: 'Moody cyberpunk night aesthetic.',
  },
  anime: {
    label: 'Anime',
    fragment: 'anime style, cel-shaded, vibrant saturated colors, clean line art, dramatic sky',
    description: 'Japanese animation style.',
  },
  documentary: {
    label: 'Documentary',
    fragment: 'natural available light, realistic colors, observational documentary framing, true-to-life textures',
    description: 'Grounded, realistic footage.',
  },
  'vintage-film': {
    label: 'Vintage Film',
    fragment: 'vintage 16mm film, warm faded colors, visible film grain, soft halation, light leaks',
    description: 'Nostalgic retro film stock.',
  },
  commercial: {
    label: 'Commercial',
    fragment: 'bright clean studio lighting, glossy premium product-commercial look, crisp vibrant colors',
    description: 'Polished advertising look.',
  },
};

export const QUALITY_SUFFIX = 'highly detailed, sharp focus, smooth motion';
export const IMAGE_QUALITY_SUFFIX = 'highly detailed, sharp focus';

const toList = (obj) => Object.entries(obj).map(([key, { label, description }]) => ({ key, label, description }));

export const listPresets = () => ({ camera: toList(CAMERA_PRESETS), style: toList(STYLE_PRESETS) });
