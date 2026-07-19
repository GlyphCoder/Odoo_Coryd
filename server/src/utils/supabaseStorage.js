/**
 * supabaseStorage.js
 *
 * Thin wrapper around the Supabase JS client for Storage operations.
 * Used only on the server (service-role key — never expose to client).
 *
 * Bucket: vehicle-docs (create it in Supabase Dashboard → Storage)
 *   - Set to PRIVATE (we generate signed URLs for upload; public read via permanent URL)
 */

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import config from '../config.js';

// Polyfill WebSocket for Node.js versions < 22 to prevent Supabase Realtime errors
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}

// Lazy-initialise so the server still boots even if keys are not yet set.
let _client = null;
function getClient() {
  if (!_client) {
    const { url, serviceRoleKey } = config.supabase;
    if (!url || !serviceRoleKey || serviceRoleKey === 'YOUR_SERVICE_ROLE_KEY_HERE') {
      throw new Error(
        'Supabase Storage is not configured. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env'
      );
    }
    _client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

const BUCKET = () => config.supabase.storageBucket;

/**
 * Generate a signed upload URL so the browser can PUT a file directly
 * to Supabase Storage without passing through our Express server.
 *
 * @param {string} path — storage path, e.g. "org123/emp456/driving_license.jpg"
 * @param {number} expiresInSeconds — default 5 minutes
 * @returns {{ signedUrl: string, path: string, token: string }}
 */
export async function createSignedUploadUrl(path, expiresInSeconds = 300) {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(BUCKET())
    .createSignedUploadUrl(path, { expiresIn: expiresInSeconds });

  if (error) throw new Error(`Storage sign error: ${error.message}`);
  return { signedUrl: data.signedUrl, path, token: data.token };
}

/**
 * Return the public URL for a stored file path.
 * The bucket must have "Public" policy or you use signed download URLs.
 */
export function getPublicUrl(path) {
  const supabase = getClient();
  const { data } = supabase.storage.from(BUCKET()).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a file from storage (used if a vehicle is removed).
 */
export async function deleteFile(path) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET()).remove([path]);
  if (error) console.error('[storage] delete failed:', error.message);
}
