/**
 * sign.js - host signatures with ECDSA P-256 / SHA-256 (WebCrypto only).
 *
 * The room key in net.js is shared by every peer, so it cannot prove WHO sent a
 * message. The host therefore owns an ECDSA key pair: the public key travels in
 * the invite (65 bytes -> 87 base64url chars), the private key stays with the
 * host (as a JWK, e.g. in localStorage) and signs what only the host may say.
 *
 * Encodings:
 *   public key  raw uncompressed point 0x04 || X || Y (65 bytes), base64url, no padding
 *   signature   IEEE P1363 r || s (64 bytes), base64url, no padding (86 chars)
 *   text        signed as its UTF-8 bytes
 *
 * Requires a secure context (https:// or http://localhost).
 *
 * @module sign
 */

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' };
const PUBLIC_KEY_BYTES = 65;
const SIGNATURE_BYTES = 64;
const COORDINATE_BYTES = 32;

const utf8Encoder = new TextEncoder();

/** Imported verification keys, by base64url public key (importKey is the slow part). */
const verifyKeyCache = new Map();
const VERIFY_KEY_CACHE_MAX = 16;

/**
 * Create a new host identity.
 *
 * @returns {Promise<{ publicKey: string, privateJwk: JsonWebKey }>}
 *   `publicKey` is safe to share; `privateJwk` is a plain JSON-serialisable
 *   object (kty/crv/x/y/d) that must stay on the host's device.
 */
export async function generateHostKey() {
  const subtle = getSubtle();
  const pair = await subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const [raw, privateJwk] = await Promise.all([
    subtle.exportKey('raw', pair.publicKey),
    subtle.exportKey('jwk', pair.privateKey),
  ]);
  return { publicKey: toBase64Url(new Uint8Array(raw)), privateJwk };
}

/**
 * Recompute the shareable public key from a stored private JWK.
 *
 * @param {JsonWebKey} privateJwk
 * @returns {string} base64url of the 65-byte raw public key
 */
export function publicKeyFromJwk(privateJwk) {
  const x = fromBase64Url(String(privateJwk && privateJwk.x));
  const y = fromBase64Url(String(privateJwk && privateJwk.y));
  if (x.length !== COORDINATE_BYTES || y.length !== COORDINATE_BYTES) throw new TypeError('sign: not a P-256 JWK');
  const raw = new Uint8Array(PUBLIC_KEY_BYTES);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 1 + COORDINATE_BYTES);
  return toBase64Url(raw);
}

/**
 * Sign a text with the host's private key.
 *
 * @param {JsonWebKey} privateJwk  As returned by generateHostKey() (may have been through JSON).
 * @param {string} text
 * @returns {Promise<string>} base64url signature (86 chars)
 */
export async function signText(privateJwk, text) {
  if (typeof text !== 'string') throw new TypeError('signText: `text` must be a string');
  const subtle = getSubtle();
  // Only pass the key material: a stored JWK may carry `key_ops` / `ext` / `alg`
  // members that make importKey() fail when they do not match this exact usage.
  const { kty, crv, x, y, d } = privateJwk || {};
  const key = await subtle.importKey('jwk', { kty, crv, x, y, d }, ALGORITHM, false, ['sign']);
  const signature = await subtle.sign(SIGN_PARAMS, key, utf8Encoder.encode(text));
  return toBase64Url(new Uint8Array(signature));
}

/**
 * Check a signature made by signText(). Never throws: anything malformed
 * (wrong length, bad base64url, point not on the curve, ...) verifies as false.
 *
 * @param {string} publicKeyB64  base64url raw public key from generateHostKey()
 * @param {string} text
 * @param {string} sigB64        base64url signature from signText()
 * @returns {Promise<boolean>}
 */
export async function verifyText(publicKeyB64, text, sigB64) {
  try {
    if (typeof publicKeyB64 !== 'string' || typeof text !== 'string' || typeof sigB64 !== 'string') return false;
    const signature = fromBase64Url(sigB64);
    if (signature.length !== SIGNATURE_BYTES) return false;
    const key = await importVerifyKey(publicKeyB64);
    return await getSubtle().verify(SIGN_PARAMS, key, signature, utf8Encoder.encode(text));
  } catch {
    return false;
  }
}

/**
 * @param {string} publicKeyB64
 * @returns {Promise<CryptoKey>}
 */
async function importVerifyKey(publicKeyB64) {
  const cached = verifyKeyCache.get(publicKeyB64);
  if (cached) return cached;
  const raw = fromBase64Url(publicKeyB64);
  if (raw.length !== PUBLIC_KEY_BYTES || raw[0] !== 4) throw new TypeError('sign: bad public key');
  const key = await getSubtle().importKey('raw', raw, ALGORITHM, false, ['verify']);
  if (verifyKeyCache.size >= VERIFY_KEY_CACHE_MAX) verifyKeyCache.delete(verifyKeyCache.keys().next().value);
  verifyKeyCache.set(publicKeyB64, key);
  return key;
}

function getSubtle() {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('sign: WebCrypto is unavailable (serve the page from https:// or http://localhost)');
  return subtle;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} base64url without padding
 */
export function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} text base64url, padding optional
 * @returns {Uint8Array}
 * @throws {TypeError} if `text` is not valid base64url
 */
export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new TypeError('sign: invalid base64url');
  const unpadded = text.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new TypeError('sign: invalid base64url length');
  const binary = atob(unpadded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
