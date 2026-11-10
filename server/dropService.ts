import type { MetadataStore } from './storage/metadataStore.interface.js';
import type { FileStorage } from './storage/fileStorage.interface.js';
import type {
  DropRecord,
  DropFileMetadata,
  CreateDropResponse,
  DropStatusResponse,
  UnlockedDropResponse,
  PresignedDownloadResponse,
} from './types.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  timingSafeCompare,
  generateSecureToken,
} from './utils/crypto.js';
import {
  validateKey,
  isBlockedExtension,
  sanitizeFilename,
  MAX_FILES_PER_DROP,
  MAX_TOTAL_BYTES,
} from './utils/keyValidator.js';

interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class DropService {
  constructor(
    private metadataStore: MetadataStore,
    private fileStorage: FileStorage
  ) {}

  /**
   * Helper to fetch and auto-purge expired drops
   */
  private async getActiveDrop(key: string): Promise<DropRecord | null> {
    const raw = await this.metadataStore.get(`drop:${key}`);
    if (!raw) return null;

    try {
      const drop: DropRecord = JSON.parse(raw);
      // Check absolute expiration
      if (Date.now() > drop.expiresAt) {
        await this.deleteDrop(key);
        return null;
      }
      return drop;
    } catch {
      await this.deleteDrop(key);
      return null;
    }
  }

  /**
   * Checks whether a custom key is available.
   */
  async checkKeyAvailability(rawKey: string): Promise<{ available: boolean; reason?: string }> {
    const validation = validateKey(rawKey);
    if (!validation.isValid) {
      return { available: false, reason: validation.error };
    }

    const key = rawKey.toLowerCase().trim();
    const existing = await this.getActiveDrop(key);
    if (existing) {
      return { available: false, reason: 'Key is already in use.' };
    }

    return { available: true };
  }

  /**
   * Creates a new drop with files, password, and limits.
   * Atomically claims key using setIfNotExists.
   */
  async createDrop(
    rawKey: string,
    password: string,
    expirySeconds: number,
    maxDownloads: number | null,
    files: UploadedFileInput[],
    honeypot?: string,
    saltHex?: string,
    encryptedFileList?: string
  ): Promise<CreateDropResponse> {
    // 1. Bot check: honeypot field must be empty
    if (honeypot && honeypot.trim().length > 0) {
      throw new Error('Bot submission detected.');
    }

    // 2. Key validation
    const keyValidation = validateKey(rawKey);
    if (!keyValidation.isValid) {
      throw new Error(keyValidation.error || 'Invalid key.');
    }
    const key = rawKey.toLowerCase().trim();

    // 3. Password validation
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    // 4. Expiry validation (10m, 1h, 2h, 24h)
    const allowedExpiries = [600, 3600, 7200, 86400];
    const validExpiry = allowedExpiries.includes(expirySeconds) ? expirySeconds : 3600;

    // 5. Download limit validation
    let validMaxDownloads: number | null = null;
    if (maxDownloads !== null && [1, 2, 5].includes(maxDownloads)) {
      validMaxDownloads = maxDownloads;
    }

    // 6. Files count and size validation
    if (!files || files.length === 0) {
      throw new Error('At least 1 file is required.');
    }
    if (files.length > MAX_FILES_PER_DROP) {
      throw new Error(`Maximum ${MAX_FILES_PER_DROP} files allowed per drop.`);
    }

    let totalBytes = 0;
    for (const f of files) {
      totalBytes += f.size;
      if (isBlockedExtension(f.originalname)) {
        throw new Error(`File type "${f.originalname}" is blocked for security reasons.`);
      }
    }

    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Total files size exceeds 25 MB limit (${(totalBytes / 1024 / 1024).toFixed(2)} MB).`
      );
    }

    // 7. Store files in FileStorage
    const storedFiles: DropFileMetadata[] = [];
    const uploadedStorageIds: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = sanitizeFilename(file.originalname);
        const fileStorageId = `${key}/${Date.now()}_${i}_${safeName}`;

        await this.fileStorage.putObject(fileStorageId, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          filename: safeName,
        });

        uploadedStorageIds.push(fileStorageId);
        storedFiles.push({
          id: fileStorageId,
          originalName: safeName,
          size: file.size,
          mimeType: file.mimetype || 'application/octet-stream',
        });
      }

      // 8. Generate hashes and tokens
      const passwordHash = await hashPassword(password);
      const rawOwnerToken = generateSecureToken(32);
      const ownerTokenHash = hashToken(rawOwnerToken);

      const now = Date.now();
      const expiresAt = now + validExpiry * 1000;

      const dropRecord: DropRecord = {
        key,
        passwordHash,
        ownerTokenHash,
        saltHex: saltHex || undefined,
        encryptedFileList: encryptedFileList || undefined,
        files: storedFiles,
        totalBytes,
        createdAt: now,
        expiresAt,
        maxDownloads: validMaxDownloads,
        downloadCount: 0,
        failedPasswordAttempts: 0,
        lockedUntil: null,
      };

      // 9. Atomic claim via MetadataStore setIfNotExists
      const claimed = await this.metadataStore.setIfNotExists(
        `drop:${key}`,
        JSON.stringify(dropRecord),
        validExpiry + 60 // slight buffer for TTL
      );

      if (!claimed) {
        // Rollback uploaded files
        await this.fileStorage.deleteMany(uploadedStorageIds);
        throw new Error('Key is already taken. Please choose another key.');
      }

      return {
        key,
        ownerToken: rawOwnerToken,
        expiresAt,
        maxDownloads: validMaxDownloads,
        fileCount: storedFiles.length,
        totalBytes,
        saltHex: dropRecord.saltHex,
      };
    } catch (err) {
      // Cleanup if any step failed
      if (uploadedStorageIds.length > 0) {
        await this.fileStorage.deleteMany(uploadedStorageIds).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Retrieves live status of a drop for polling & success screen.
   */
  async getDropStatus(key: string): Promise<DropStatusResponse | null> {
    const drop = await this.getActiveDrop(key.toLowerCase().trim());
    if (!drop) return null;

    const now = Date.now();
    const isLocked = drop.lockedUntil !== null && drop.lockedUntil > now;
    const lockRemainingSeconds = isLocked ? Math.ceil((drop.lockedUntil! - now) / 1000) : 0;
    const expiresInSeconds = Math.max(0, Math.ceil((drop.expiresAt - now) / 1000));

    let statusText = 'Not opened yet';
    if (isLocked) {
      statusText = `Temporarily locked (${Math.ceil(lockRemainingSeconds / 60)}m left)`;
    } else if (drop.downloadCount > 0) {
      if (drop.maxDownloads !== null) {
        statusText = `Downloaded ${drop.downloadCount} of ${drop.maxDownloads}`;
      } else {
        statusText = `Downloaded ${drop.downloadCount} time${drop.downloadCount === 1 ? '' : 's'}`;
      }
    }

    return {
      key: drop.key,
      isLocked,
      lockRemainingSeconds,
      isExpired: false,
      expiresAt: drop.expiresAt,
      expiresInSeconds,
      downloadCount: drop.downloadCount,
      maxDownloads: drop.maxDownloads,
      fileCount: drop.files.length,
      totalBytes: drop.totalBytes,
      statusText,
      saltHex: drop.saltHex,
    };
  }

  /**
   * Unlocks drop with password and returns short-lived access token.
   * Returns IDENTICAL error message for non-existent drops and wrong passwords.
   */
  async unlockDrop(
    rawKey: string,
    passwordAttempt: string
  ): Promise<{ status: number; result?: UnlockedDropResponse; error?: string }> {
    const key = rawKey.toLowerCase().trim();
    const drop = await this.getActiveDrop(key);

    const GENERIC_ERROR = 'Incorrect key or password.';

    // If drop does not exist, return identical error without timing leak
    if (!drop) {
      // Simulate dummy verification to equalize execution time
      await verifyPassword(
        passwordAttempt || '',
        '00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000'
      );
      return { status: 401, error: GENERIC_ERROR };
    }

    const now = Date.now();

    // Check if drop is locked
    if (drop.lockedUntil !== null && drop.lockedUntil > now) {
      const waitMinutes = Math.ceil((drop.lockedUntil - now) / 60000);
      return {
        status: 423,
        error: `This drop has been temporarily locked due to too many incorrect password attempts. Please try again in ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`,
      };
    }

    // Verify password using scrypt
    const isCorrect = await verifyPassword(passwordAttempt || '', drop.passwordHash);

    if (!isCorrect) {
      drop.failedPasswordAttempts += 1;
      if (drop.failedPasswordAttempts >= 5) {
        drop.lockedUntil = now + 10 * 60 * 1000; // 10 minute lock
      }
      await this.metadataStore.set(`drop:${key}`, JSON.stringify(drop));

      if (drop.lockedUntil && drop.lockedUntil > now) {
        return {
          status: 423,
          error:
            'This drop has been temporarily locked due to too many incorrect password attempts. Please try again in 10 minutes.',
        };
      }

      return { status: 401, error: GENERIC_ERROR };
    }

    // Correct password: reset failed attempts
    drop.failedPasswordAttempts = 0;
    drop.lockedUntil = null;
    await this.metadataStore.set(`drop:${key}`, JSON.stringify(drop));

    // Generate short-lived access token (valid for 10 minutes)
    const accessToken = generateSecureToken(24);
    await this.metadataStore.set(`token:${accessToken}`, key, 600); // 10 minutes TTL

    const expiresInSeconds = Math.max(0, Math.ceil((drop.expiresAt - now) / 1000));

    return {
      status: 200,
      result: {
        key: drop.key,
        accessToken,
        expiresAt: drop.expiresAt,
        expiresInSeconds,
        downloadCount: drop.downloadCount,
        maxDownloads: drop.maxDownloads,
        saltHex: drop.saltHex,
        encryptedFileList: drop.encryptedFileList,
        files: drop.files.map((f) => ({
          id: f.id,
          name: f.originalName,
          size: f.size,
        })),
      },
    };
  }

  /**
   * Generates a single-use presigned download token (valid 60 seconds).
   * Atomically increments the download counter when the token is issued.
   */
  async createPresignedDownload(
    rawKey: string,
    fileId: string,
    accessToken: string
  ): Promise<PresignedDownloadResponse> {
    const key = rawKey.toLowerCase().trim();

    // Verify access token
    const tokenDropKey = await this.metadataStore.get(`token:${accessToken}`);
    if (!tokenDropKey || tokenDropKey !== key) {
      throw new Error('Unauthorized access token.');
    }

    const drop = await this.getActiveDrop(key);
    if (!drop) {
      throw new Error('Drop not found or expired.');
    }

    // Verify file belongs to this drop
    const fileRecord = drop.files.find((f) => f.id === fileId);
    if (!fileRecord) {
      throw new Error('File not found in this drop.');
    }

    // Check download limit
    if (drop.maxDownloads !== null && drop.downloadCount >= drop.maxDownloads) {
      throw new Error('Download limit for this drop has been reached.');
    }

    // Increment download counter atomically
    drop.downloadCount += 1;
    const isFinalDownload =
      drop.maxDownloads !== null && drop.downloadCount >= drop.maxDownloads;

    await this.metadataStore.set(`drop:${key}`, JSON.stringify(drop));

    // Create 60-second one-time download token
    const downloadToken = generateSecureToken(24);
    const tokenPayload = {
      key,
      fileId,
      isFinalDownload,
      expiresAt: Date.now() + 60 * 1000,
    };

    await this.metadataStore.set(
      `download:${downloadToken}`,
      JSON.stringify(tokenPayload),
      60
    );

    return {
      downloadUrl: `/api/download/${downloadToken}`,
      expiresInSeconds: 60,
    };
  }

  /**
   * Resolves a one-time download token, retrieves the file, and marks token used.
   */
  async resolveDownloadToken(downloadToken: string) {
    const raw = await this.metadataStore.get(`download:${downloadToken}`);
    if (!raw) {
      return null;
    }

    // Single-use: delete immediately
    await this.metadataStore.delete(`download:${downloadToken}`);

    try {
      const payload = JSON.parse(raw);
      if (Date.now() > payload.expiresAt) {
        return null;
      }

      const file = await this.fileStorage.getObject(payload.fileId);
      if (!file) {
        return null;
      }

      // If this was the final permitted download, schedule drop deletion after a 30s grace period
      if (payload.isFinalDownload) {
        setTimeout(() => {
          this.deleteDrop(payload.key).catch(() => {});
        }, 30_000);
      }

      return {
        file,
        key: payload.key,
      };
    } catch {
      return null;
    }
  }

  /**
   * Deletes a drop completely. Safe to call multiple times.
   */
  async deleteDrop(rawKey: string, ownerToken?: string): Promise<{ success: boolean; error?: string }> {
    const key = rawKey.toLowerCase().trim();
    const raw = await this.metadataStore.get(`drop:${key}`);
    if (!raw) {
      return { success: true }; // Already deleted
    }

    try {
      const drop: DropRecord = JSON.parse(raw);

      // If owner token provided, authenticate constant time
      if (ownerToken) {
        const hashedProvided = hashToken(ownerToken);
        const isOwner = timingSafeCompare(hashedProvided, drop.ownerTokenHash);
        if (!isOwner) {
          return { success: false, error: 'Invalid owner token.' };
        }
      }

      // Remove all files from FileStorage
      const fileIds = drop.files.map((f) => f.id);
      if (fileIds.length > 0) {
        await this.fileStorage.deleteMany(fileIds);
      }

      // Remove metadata entry
      await this.metadataStore.delete(`drop:${key}`);
      return { success: true };
    } catch {
      await this.metadataStore.delete(`drop:${key}`);
      return { success: true };
    }
  }

  /**
   * Scans and purges any drops whose expiration timestamp has passed.
   * Invoked on interval.
   */
  async cleanupExpiredDrops(): Promise<number> {
    let purged = 0;
    try {
      const dropKeys = await this.metadataStore.list('drop:');
      const now = Date.now();

      for (const prefixedKey of dropKeys) {
        const raw = await this.metadataStore.get(prefixedKey);
        if (!raw) continue;

        try {
          const drop: DropRecord = JSON.parse(raw);
          if (now > drop.expiresAt) {
            await this.deleteDrop(drop.key);
            purged++;
          }
        } catch {
          await this.metadataStore.delete(prefixedKey);
        }
      }
    } catch (err) {
      console.error('Error during expired drops cleanup:', err);
    }
    return purged;
  }
}
