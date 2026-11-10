/**
 * DataDrop Server Domain Types
 */

export interface DropFileMetadata {
  id: string; // unique identifier in FileStorage (e.g., dropKey/uuid_name)
  originalName: string;
  size: number;
  mimeType: string;
}

export interface DropRecord {
  key: string;
  passwordHash: string; // Format: "saltHex:hashHex" using Node crypto scrypt
  ownerTokenHash: string; // Hash of the private owner token
  saltHex?: string; // Client-side E2EE salt for PBKDF2 key derivation
  encryptedFileList?: string; // Client-side encrypted JSON metadata of files
  files: DropFileMetadata[];
  totalBytes: number;
  createdAt: number;
  expiresAt: number; // Unix timestamp in ms
  maxDownloads: number | null; // null represents "until time ends"
  downloadCount: number;
  failedPasswordAttempts: number;
  lockedUntil: number | null; // Unix timestamp in ms if locked
  isDeleting?: boolean;
}

export interface CreateDropRequest {
  key: string;
  password: string;
  expirySeconds: number; // 600, 3600, 7200, 86400
  maxDownloads: number | null; // 1, 2, 5, or null
  saltHex?: string;
  encryptedFileList?: string;
  honeypot?: string;
}

export interface CreateDropResponse {
  key: string;
  ownerToken: string;
  expiresAt: number;
  maxDownloads: number | null;
  fileCount: number;
  totalBytes: number;
  saltHex?: string;
}

export interface DropStatusResponse {
  key: string;
  isLocked: boolean;
  lockRemainingSeconds?: number;
  isExpired: boolean;
  expiresAt: number;
  expiresInSeconds: number;
  downloadCount: number;
  maxDownloads: number | null;
  fileCount: number;
  totalBytes: number;
  statusText: string;
  saltHex?: string;
}

export interface UnlockedDropResponse {
  key: string;
  accessToken: string;
  expiresAt: number;
  expiresInSeconds: number;
  downloadCount: number;
  maxDownloads: number | null;
  saltHex?: string;
  encryptedFileList?: string;
  files: {
    id: string;
    name: string;
    size: number;
  }[];
}

export interface PresignedDownloadResponse {
  downloadUrl: string;
  expiresInSeconds: number;
}
