import path from 'node:path';

/**
 * Key and File Validation Rules
 */

export const RESERVED_KEYS = new Set([
  'admin',
  'api',
  'about',
  'create',
  'new',
  'login',
  'abuse',
  'terms',
  'privacy',
  'created',
  'static',
  'help',
  'support',
  'www',
]);

export const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'apk',
  'bat',
  'cmd',
  'com',
  'scr',
  'msi',
  'js',
  'vbs',
  'ps1',
  'sh',
  'jar',
  'dll',
]);

export const MAX_FILES_PER_DROP = 5;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Validates a drop key according to format rules.
 * Allowed: lowercase letters, digits, hyphens. Length 4-32. No leading/trailing hyphen.
 */
export function validateKey(key: string): { isValid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { isValid: false, error: 'Key is required.' };
  }

  const normalized = key.toLowerCase().trim();

  if (normalized.length < 4 || normalized.length > 32) {
    return { isValid: false, error: 'Key must be between 4 and 32 characters.' };
  }

  if (RESERVED_KEYS.has(normalized)) {
    return { isValid: false, error: `"${normalized}" is a reserved system path.` };
  }

  // Allowed: a-z, 0-9, single hyphens between characters, no leading or trailing hyphens
  const validPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!validPattern.test(normalized)) {
    return {
      isValid: false,
      error: 'Key can only contain lowercase letters, numbers, and hyphens (no consecutive or leading/trailing hyphens).',
    };
  }

  return { isValid: true };
}

/**
 * Checks if a file extension is blocked for safety.
 */
export function isBlockedExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  return BLOCKED_EXTENSIONS.has(ext);
}

/**
 * Sanitizes a file name, removing path traversal and forbidden characters.
 */
export function sanitizeFilename(rawName: string): string {
  // Strip directory paths (protect against ../ traversal)
  const base = path.basename(rawName).trim();
  // Remove non-printable or dangerous characters
  const sanitized = base.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_');
  // Avoid empty names
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return 'file.bin';
  }
  // Truncate to reasonable length (100 characters max) while preserving extension
  if (sanitized.length > 100) {
    const ext = path.extname(sanitized);
    const stem = path.basename(sanitized, ext).slice(0, 100 - ext.length);
    return `${stem}${ext}`;
  }
  return sanitized;
}
