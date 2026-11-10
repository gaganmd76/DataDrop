import { useState, useEffect, type FormEvent } from 'react';
import type { UnlockedDrop } from '../types.ts';
import { formatBytes, formatRemainingTime } from '../utils/format.ts';
import {
  deriveEncryptionKey,
  deriveAuthVerifier,
  decryptJson,
  decryptFile,
} from '../utils/e2ee.ts';

interface OpenDropPageProps {
  dropKey: string;
  onNavigateHome: () => void;
}

interface DecryptedFileItem {
  index: number;
  name: string;
  size: number;
  mimeType?: string;
}

export function OpenDropPage({ dropKey, onNavigateHome }: OpenDropPageProps) {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);

  // E2EE state
  const [dropSaltHex, setDropSaltHex] = useState<string>('');
  const [decryptionKey, setDecryptionKey] = useState<CryptoKey | null>(null);

  // Unlocked state
  const [unlockedDrop, setUnlockedDrop] = useState<UnlockedDrop | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // Check drop existence and status on initial load to get salt
  useEffect(() => {
    let isMounted = true;
    const checkInitial = async () => {
      try {
        const res = await fetch(`/api/drops/${dropKey}/status`);
        if (!isMounted) return;

        if (res.status === 404) {
          setIsNotFound(true);
        } else if (res.ok) {
          const data = await res.json();
          if (data.saltHex) {
            setDropSaltHex(data.saltHex);
          }
          if (data.isLocked) {
            setIsLocked(true);
            setErrorMessage(
              `This drop has been temporarily locked due to too many incorrect password attempts. Please try again in ${Math.ceil(
                (data.lockRemainingSeconds || 600) / 60
              )} minutes.`
            );
          }
        }
      } catch {
        // Allow user to still attempt password
      }
    };

    checkInitial();
    return () => {
      isMounted = false;
    };
  }, [dropKey]);

  // Handle password submit
  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Derive authVerifier if salt is available
      let passwordPayload = password;
      let effectiveSalt = dropSaltHex;

      if (!effectiveSalt) {
        // Fetch status if salt was missing
        const statusRes = await fetch(`/api/drops/${dropKey}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.saltHex) {
            effectiveSalt = statusData.saltHex;
            setDropSaltHex(effectiveSalt);
          }
        }
      }

      if (effectiveSalt) {
        passwordPayload = await deriveAuthVerifier(password, effectiveSalt);
      }

      const res = await fetch(`/api/drops/${dropKey}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordPayload }),
      });

      const data = await res.json();

      if (res.status === 423) {
        setIsLocked(true);
        setErrorMessage(
          data.error ||
            'This drop has been temporarily locked due to too many incorrect password attempts. Please try again in 10 minutes.'
        );
      } else if (res.status === 401 || !res.ok) {
        setErrorMessage(data.error || 'Incorrect key or password.');
      } else {
        const saltToUse = data.saltHex || effectiveSalt;

        // Derive client-side AES-GCM key for decrypting files locally
        if (saltToUse) {
          try {
            const key = await deriveEncryptionKey(password, saltToUse);
            setDecryptionKey(key);

            // Decrypt file list metadata if encrypted
            if (data.encryptedFileList) {
              const decryptedList = await decryptJson<DecryptedFileItem[]>(
                data.encryptedFileList,
                key
              );

              const mappedFiles = data.files.map((f: { id: string; name: string; size: number }, idx: number) => {
                const dec = decryptedList[idx] || decryptedList.find((d) => d.index === idx);
                return {
                  id: f.id,
                  name: dec ? dec.name : f.name,
                  size: dec ? dec.size : f.size,
                  mimeType: dec?.mimeType,
                };
              });

              setUnlockedDrop({ ...data, files: mappedFiles });
              return;
            }
          } catch (decryptErr) {
            console.error('Failed to decrypt metadata:', decryptErr);
          }
        }

        setUnlockedDrop(data);
      }
    } catch {
      setErrorMessage('Network error during verification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file download and client-side decryption
  const handleDownloadFile = async (fileId: string, filename: string, mimeType?: string) => {
    if (!unlockedDrop) return;

    setDownloadingFileId(fileId);
    setErrorMessage(null);
    setDownloadSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/drops/${dropKey}/files/${encodeURIComponent(fileId)}/presign`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${unlockedDrop.accessToken}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate download link.');
      }

      // Fetch encrypted ciphertext blob from server
      const downloadResponse = await fetch(data.downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error('Failed to retrieve encrypted file payload.');
      }

      const encryptedBuffer = await downloadResponse.arrayBuffer();

      // Decrypt locally in browser memory
      let fileBlob: Blob;
      if (decryptionKey) {
        fileBlob = await decryptFile(encryptedBuffer, decryptionKey, mimeType);
      } else {
        fileBlob = new Blob([encryptedBuffer], { type: mimeType || 'application/octet-stream' });
      }

      // Trigger browser download via object URL
      const objectUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

      // Increment local download count
      const updatedCount = unlockedDrop.downloadCount + 1;
      setUnlockedDrop((prev) =>
        prev ? { ...prev, downloadCount: updatedCount } : null
      );

      if (
        unlockedDrop.maxDownloads !== null &&
        updatedCount >= unlockedDrop.maxDownloads
      ) {
        setDownloadSuccessMessage(
          'Download limit reached. This drop will be automatically deleted now.'
        );
      } else {
        setDownloadSuccessMessage(`Decrypted and downloaded "${filename}".`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed.';
      setErrorMessage(msg);
    } finally {
      setDownloadingFileId(null);
    }
  };

  // Shared Header matching HomePage screenshot exactly
  const renderHeader = () => (
    <>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 leading-tight mb-2 text-center">
        DataDrop
      </h1>
      <p className="text-sm text-neutral-600 leading-relaxed mb-8 text-center">
        Temporary, minimal file sharing.
      </p>
    </>
  );

  // State 1: Drop not found or expired
  if (isNotFound) {
    return (
      <div className="w-full flex flex-col justify-center py-6 sm:py-10">
        {renderHeader()}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 border border-neutral-200 rounded-full text-xs font-mono text-neutral-800">
            <span className="text-neutral-500">Drop key:</span>
            <span className="font-bold text-neutral-900">/{dropKey}</span>
          </span>
        </div>
        <div className="border border-neutral-200 rounded p-6 bg-neutral-50 text-center mb-6">
          <p className="text-base font-bold text-neutral-900 mb-1">Drop not found</p>
          <p className="text-xs text-neutral-500">
            This drop never existed, has expired, or reached its download limit.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateHome}
          className="w-full py-3.5 px-6 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-base rounded cursor-pointer min-h-[48px] focus:outline-none focus:ring-2 focus:ring-neutral-900 shadow-sm"
        >
          Return to home
        </button>
      </div>
    );
  }

  // State 2: Drop locked due to 5 wrong attempts
  if (isLocked) {
    return (
      <div className="w-full flex flex-col justify-center py-6 sm:py-10">
        {renderHeader()}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-100 border border-amber-200 rounded-full text-xs font-mono text-amber-900">
            <span className="text-amber-700">Drop key:</span>
            <span className="font-bold text-amber-900">/{dropKey}</span>
          </span>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded p-6 text-center mb-6">
          <p className="text-base font-bold text-amber-900 mb-1">Drop temporarily locked</p>
          <p className="text-xs text-amber-800">
            {errorMessage ||
              'Too many incorrect password attempts. Please try again in 10 minutes.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateHome}
          className="w-full py-3.5 px-6 border border-neutral-300 hover:bg-neutral-100 text-neutral-800 font-medium text-base rounded cursor-pointer min-h-[48px] focus:outline-none focus:ring-2 focus:ring-neutral-400"
        >
          Return to home
        </button>
      </div>
    );
  }

  // State 3: Drop is unlocked, show files
  if (unlockedDrop) {
    return (
      <div className="w-full flex flex-col justify-center py-6 sm:py-10 space-y-6">
        <div>
          {renderHeader()}
          <div className="flex justify-between items-center text-xs text-neutral-500 px-1 mb-2">
            <span>Drop: <strong className="font-mono text-neutral-800">/{dropKey}</strong></span>
            <span>
              Expires in {formatRemainingTime(unlockedDrop.expiresInSeconds)} ·{' '}
              {unlockedDrop.maxDownloads !== null
                ? `${unlockedDrop.downloadCount} of ${unlockedDrop.maxDownloads} downloads`
                : `${unlockedDrop.downloadCount} downloads`}
            </span>
          </div>
        </div>

        {downloadSuccessMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded text-center">
            {downloadSuccessMessage}
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded text-center">
            {errorMessage}
          </div>
        )}

        {/* Files List with download buttons */}
        <div className="border border-neutral-300 rounded divide-y divide-neutral-200 bg-white">
          {unlockedDrop.files.map((file) => (
            <div
              key={file.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="truncate">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownloadFile(file.id, file.name, file.mimeType)}
                disabled={
                  downloadingFileId === file.id ||
                  (unlockedDrop.maxDownloads !== null &&
                    unlockedDrop.downloadCount >= unlockedDrop.maxDownloads)
                }
                className="py-2 px-4 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-xs font-medium rounded whitespace-nowrap cursor-pointer disabled:cursor-not-allowed min-h-[38px] transition-colors"
              >
                {downloadingFileId === file.id ? 'Decrypting…' : 'Download file'}
              </button>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onNavigateHome}
            className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer focus:outline-none"
          >
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  // State 4: Password entry prompt (matches HomePage screenshot layout exactly)
  return (
    <div className="w-full flex flex-col justify-center py-6 sm:py-10">
      {renderHeader()}

      {/* Target Drop Key Badge */}
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 border border-neutral-200 rounded-full text-xs font-mono text-neutral-800">
          <span className="text-neutral-500">Unlocking drop:</span>
          <span className="font-bold text-neutral-900">/{dropKey}</span>
        </span>
      </div>

      <form onSubmit={handleUnlock} className="space-y-4">
        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded text-center font-medium"
          >
            {errorMessage}
          </div>
        )}

        <div>
          <label htmlFor="unlock-password" className="sr-only">
            Drop password
          </label>
          <input
            id="unlock-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter drop password"
            required
            autoFocus
            className="w-full py-3.5 px-4 border border-neutral-300 rounded text-neutral-900 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 placeholder:text-neutral-400 min-h-[48px] bg-white shadow-xs"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !password}
          className="w-full py-3.5 px-6 bg-neutral-900 hover:bg-neutral-800 active:bg-black disabled:bg-neutral-300 text-white font-medium text-base rounded cursor-pointer min-h-[48px] focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          {isSubmitting ? 'Decrypting & unlocking…' : 'Unlock Drop'}
        </button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer focus:outline-none"
          >
            Have a drop key? Open it here
          </button>
        </div>
      </form>
    </div>
  );
}
