import crypto from 'node:crypto';

/**
 * DataDrop Cryptography and Hashing Utilities
 *
 * NOTE: Using Node's built-in crypto (scrypt) for zero-dependency password hashing.
 * In a high-traffic production system, this can be swapped with Argon2id (e.g. via 'argon2' package).
 */

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hashes a plaintext password with a random salt using Node.js scrypt.
 * Output format: "saltHex:hashHex"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored "saltHex:hashHex" using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [saltHex, keyHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, expectedKey.length, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        // Constant-time buffer comparison to prevent timing attacks
        resolve(crypto.timingSafeEqual(derivedKey, expectedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Hashes a token using SHA-256 for secure storage.
 * Only the hash is stored in memory, never the raw token.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Compares two token hashes in constant time to prevent timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random hexadecimal token.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}
