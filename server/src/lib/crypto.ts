import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be set to 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM field-level encryption. Format: v1:<iv>:<tag>:<ciphertext> (base64). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('Unrecognized ciphertext format');
  }
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** SHA-256 hash, used for storing refresh tokens / invite tokens at rest. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token (default 256 bits). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
