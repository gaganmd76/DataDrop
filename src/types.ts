export interface CreateDropResult {
  key: string;
  ownerToken: string;
  expiresAt: number;
  maxDownloads: number | null;
  fileCount: number;
  totalBytes: number;
  password: string; // Stored only in local browser state for user convenience upon creation
  saltHex?: string;
}

export interface DropStatus {
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

export interface DropFileInfo {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface UnlockedDrop {
  key: string;
  accessToken: string;
  expiresAt: number;
  expiresInSeconds: number;
  downloadCount: number;
  maxDownloads: number | null;
  saltHex?: string;
  encryptedFileList?: string;
  files: DropFileInfo[];
}
