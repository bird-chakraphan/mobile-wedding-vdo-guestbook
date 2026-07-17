// The three output sizes CONTEXT.md specifies. Shared between the staff
// page (picking a preset) and the recording pipeline (issue #8 uses the
// same keys to size the output canvas).

export const OUTPUT_PRESETS = {
  'portrait-1080': { label: 'Portrait (1080×1920)', width: 1080, height: 1920 },
  'portrait-720': { label: 'Portrait fallback (720×1280)', width: 720, height: 1280 },
  'square': { label: 'Square (1080×1080)', width: 1080, height: 1080 }
};

const DEFAULT_PRESET_KEY = 'portrait-1080';

export function presetKeyFor(width, height) {
  const found = Object.entries(OUTPUT_PRESETS)
    .find(([, preset]) => preset.width === width && preset.height === height);
  return found ? found[0] : DEFAULT_PRESET_KEY;
}
