import { enhancePrompt, isValidCameraPreset } from '../src/services/prompt.service.js';
import { CAMERA_PRESETS, STYLE_PRESETS, QUALITY_SUFFIX } from '../src/config/presets.config.js';

describe('prompt.service enhancePrompt', () => {
  it('combines user prompt, camera, style and quality suffix', () => {
    const out = enhancePrompt({ prompt: 'a red car at night.', cameraPreset: 'dolly-in', stylePreset: 'neon-noir' });
    expect(out).toBe(
      `a red car at night, ${CAMERA_PRESETS['dolly-in'].fragment}, ${STYLE_PRESETS['neon-noir'].fragment}, ${QUALITY_SUFFIX}`,
    );
  });

  it('works without presets', () => {
    expect(enhancePrompt({ prompt: '  a   cat  ' })).toBe(`a cat, ${QUALITY_SUFFIX}`);
  });

  it('ignores unknown presets', () => {
    expect(enhancePrompt({ prompt: 'a cat', cameraPreset: 'nope', stylePreset: 'nope' })).toBe(
      `a cat, ${QUALITY_SUFFIX}`,
    );
  });

  it('skips camera motion for text-to-image', () => {
    const out = enhancePrompt({ prompt: 'a cat', cameraPreset: 'orbit', type: 'text-to-image' });
    expect(out).not.toContain(CAMERA_PRESETS.orbit.fragment);
    expect(out).not.toContain('smooth motion');
  });

  it('drops fragments before trimming the user prompt', () => {
    const prompt = 'x'.repeat(50);
    const out = enhancePrompt({ prompt, cameraPreset: 'orbit', stylePreset: 'cinematic', maxLength: 60 });
    expect(out).toBe(prompt);
  });

  it('hard-trims a prompt longer than the max length', () => {
    expect(enhancePrompt({ prompt: 'y'.repeat(100), maxLength: 40 })).toHaveLength(40);
  });

  it('validates preset keys', () => {
    expect(isValidCameraPreset('fpv-drone')).toBe(true);
    expect(isValidCameraPreset('toString')).toBe(false);
  });
});
