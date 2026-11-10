/**
 * DataDrop End-to-End Encryption (E2EE) Module
 *
 * Implements client-side Zero-Knowledge encryption using the native Web Crypto API.
 * - Key derivation: PBKDF2 with SHA-256 (100,000 iterations)
 * - Symmetric encryption: AES-GCM 256-bit with random 12-byte IVs
 * - Domain-separated auth hash to verify passwords on server without revealing the key
 */

const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256;

// Convert Uint8Array to hex string
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert hex string to Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates a cryptographically random 16-byte salt in hex.
 */
export function generateSaltHex(): string {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a user password and salt using PBKDF2.
 */
export async function deriveEncryptionKey(
  password: string,
  saltHex: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = hexToBytes(saltHex);

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Computes a domain-separated authentication hash to send to the server.
 * The server uses this to verify the password attempt without ever knowing the raw password
 * or the AES encryption key.
 */
export async function deriveAuthVerifier(
  password: string,
  saltHex: string
): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`datadrop-auth-v1:${saltHex}:${password}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Encrypts an arbitrary JSON object with AES-GCM.
 * Output is a base64-encoded string containing [12 bytes IV][ciphertext].
 */
export async function encryptJson(data: unknown, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const jsonBytes = enc.encode(JSON.stringify(data));
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    jsonBytes
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to base64
  let binary = '';
  const len = combined.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return window.btoa(binary);
}

/**
 * Decrypts a base64-encoded string containing [12 bytes IV][ciphertext] back to JSON.
 */
export async function decryptJson<T>(base64Data: string, key: CryptoKey): Promise<T> {
  const binary = window.atob(base64Data);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i);
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted)) as T;
}

/**
 * Encrypts a File into a Blob using AES-GCM.
 * Prefix is a 12-byte IV followed by the encrypted bytes.
 */
export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; originalSize: number }> {
  const buffer = await file.arrayBuffer();
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    buffer
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return {
    encryptedBlob: new Blob([combined], { type: 'application/octet-stream' }),
    originalSize: file.size,
  };
}

/**
 * Decrypts an encrypted file ArrayBuffer using AES-GCM.
 * Extracts the 12-byte IV from the front and decrypts the rest.
 */
export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  key: CryptoKey,
  mimeType = 'application/octet-stream'
): Promise<Blob> {
  const bytes = new Uint8Array(encryptedBuffer);
  if (bytes.length < 12) {
    throw new Error('Corrupted or invalid encrypted payload.');
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  return new Blob([decrypted], { type: mimeType });
}
