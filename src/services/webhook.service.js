import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SKEW_SECONDS = 300;

let jwksCache = { keys: [], fetchedAt: 0 };

const fetchJwks = async (force = false) => {
  if (!force && jwksCache.keys.length && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys = [] } = await res.json();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
};

/** Test hook: replace the cached JWKS. */
export const __setJwksForTests = (keys) => {
  jwksCache = { keys, fetchedAt: Date.now() };
};

/**
 * Verifies a fal.ai webhook per https://fal.ai/docs (ED25519 over
 * `request_id \n user_id \n timestamp \n sha256_hex(body)`, keys from fal's JWKS).
 *
 * @param {Record<string, string|undefined>} headers  lower-cased request headers
 * @param {Buffer} rawBody
 * @returns {Promise<boolean>}
 */
export const verifyFalWebhook = async (headers, rawBody) => {
  const requestId = headers['x-fal-webhook-request-id'];
  const userId = headers['x-fal-webhook-user-id'];
  const timestamp = headers['x-fal-webhook-timestamp'];
  const signatureHex = headers['x-fal-webhook-signature'];
  if (!requestId || !userId || !timestamp || !signatureHex || !rawBody) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) return false;
  if (!/^[0-9a-f]+$/i.test(signatureHex)) return false;

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join('\n'), 'utf8');
  const signature = Buffer.from(signatureHex, 'hex');

  const tryKeys = (keys) =>
    keys.some((jwk) => {
      if (typeof jwk?.x !== 'string') return false;
      try {
        const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
        return crypto.verify(null, message, key, signature);
      } catch {
        return false;
      }
    });

  try {
    if (tryKeys(await fetchJwks())) return true;
    // Keys may have rotated since we cached them.
    return tryKeys(await fetchJwks(true));
  } catch (err) {
    logger.error({ err: err.message }, 'fal webhook verification error');
    return false;
  }
};
