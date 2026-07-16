// One-off verification script for Step 0 — confirms the 'clips' bucket and
// its RLS policy actually accept an anonymous upload, before any UI exists.
// Run with: node supabase/test-upload.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const testContent = `test upload from setup verification — ${new Date().toISOString()}`;
const filename = `_test-upload-${Date.now()}.txt`;

const { data, error } = await supabase.storage
  .from('clips')
  .upload(filename, new Blob([testContent], { type: 'text/plain' }));

if (error) {
  console.error('❌ Upload failed:', error.message);
  process.exit(1);
} else {
  console.log('✅ Upload succeeded:', data.path);
  console.log('Check Supabase dashboard -> Storage -> clips to see it.');
}
