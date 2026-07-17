import { supabase } from './supabaseClient.js';
import { loadSettings } from './settings.js';
import { OUTPUT_PRESETS, presetKeyFor } from './outputPresets.js';
import { buildSettingsPayload } from './staffSettingsForm.js';

const passcodeGate = document.getElementById('passcodeGate');
const passcodeInput = document.getElementById('passcodeInput');
const unlockBtn = document.getElementById('unlockBtn');
const form = document.getElementById('settingsForm');
const timeLimitInput = document.getElementById('timeLimitInput');
const smoothInput = document.getElementById('smoothInput');
const smoothVal = document.getElementById('smoothVal');
const glowInput = document.getElementById('glowInput');
const glowVal = document.getElementById('glowVal');
const vshapeInput = document.getElementById('vshapeInput');
const vshapeVal = document.getElementById('vshapeVal');
const narrowInput = document.getElementById('narrowInput');
const narrowVal = document.getElementById('narrowVal');
const presetSelect = document.getElementById('presetSelect');
const frameFileInput = document.getElementById('frameFileInput');
const gestureLeftFileInput = document.getElementById('gestureLeftFileInput');
const gestureRightFileInput = document.getElementById('gestureRightFileInput');
const status = document.getElementById('status');

// Fixed per-slot filenames in the 'assets' bucket (upsert on upload) so
// re-uploads replace rather than accumulate — see ADR-0003.
const ASSET_INPUTS = [
  { input: frameFileInput, filename: 'frame', key: 'frameUrl' },
  { input: gestureLeftFileInput, filename: 'gesture-left', key: 'gestureLeftUrl' },
  { input: gestureRightFileInput, filename: 'gesture-right', key: 'gestureRightUrl' }
];

for (const [key, preset] of Object.entries(OUTPUT_PRESETS)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = preset.label;
  presetSelect.appendChild(option);
}

let passcode = '';

async function populateForm() {
  const settings = await loadSettings(supabase);
  timeLimitInput.value = settings.timeLimitSeconds;
  smoothInput.value = settings.beautySmooth;
  smoothVal.textContent = settings.beautySmooth;
  glowInput.value = settings.beautyGlow;
  glowVal.textContent = settings.beautyGlow;
  vshapeInput.value = settings.beautyVshape;
  vshapeVal.textContent = settings.beautyVshape;
  narrowInput.value = settings.beautyNarrow;
  narrowVal.textContent = settings.beautyNarrow;
  presetSelect.value = presetKeyFor(settings.outputWidth, settings.outputHeight);
}

smoothInput.addEventListener('input', () => { smoothVal.textContent = smoothInput.value; });
glowInput.addEventListener('input', () => { glowVal.textContent = glowInput.value; });
vshapeInput.addEventListener('input', () => { vshapeVal.textContent = vshapeInput.value; });
narrowInput.addEventListener('input', () => { narrowVal.textContent = narrowInput.value; });

unlockBtn.addEventListener('click', async () => {
  passcode = passcodeInput.value;
  if (!passcode) return;
  passcodeGate.style.display = 'none';
  form.style.display = 'block';
  status.textContent = '';
  await populateForm();
});

// Mints a short-lived upload token (proves the passcode) then uploads
// each selected file to its fixed slot in the 'assets' bucket. Returns
// {} untouched when no files were selected, so saving without any
// upload stays exactly as cheap as before.
async function uploadSelectedAssets() {
  const selected = ASSET_INPUTS.filter(a => a.input.files[0]);
  if (selected.length === 0) return {};

  const { error: tokenError } = await supabase.rpc('mint_upload_token', { p_passcode: passcode });
  if (tokenError) throw new Error(`invalid passcode (${tokenError.message})`);

  const urls = {};
  for (const { input, filename, key } of selected) {
    const file = input.files[0];
    const { error } = await supabase.storage.from('assets').upload(filename, file, {
      upsert: true,
      contentType: file.type
    });
    if (error) throw new Error(`${filename} upload failed (${error.message})`);
    urls[key] = supabase.storage.from('assets').getPublicUrl(filename).data.publicUrl;
  }
  return urls;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const preset = OUTPUT_PRESETS[presetSelect.value];

  status.textContent = 'Saving…';
  let assetUrls;
  try {
    assetUrls = await uploadSelectedAssets();
  } catch (err) {
    status.textContent = `Save failed: ${err.message}`;
    return;
  }

  const payload = buildSettingsPayload(passcode, {
    timeLimitSeconds: Number(timeLimitInput.value),
    beautySmooth: Number(smoothInput.value),
    beautyGlow: Number(glowInput.value),
    beautyVshape: Number(vshapeInput.value),
    beautyNarrow: Number(narrowInput.value),
    outputWidth: preset.width,
    outputHeight: preset.height,
    ...assetUrls
  });

  const { error } = await supabase.rpc('update_staff_settings', payload);
  status.textContent = error
    ? `Save failed: ${error.message}`
    : 'Saved ✓ — guest phones will use these settings on next load.';
});
