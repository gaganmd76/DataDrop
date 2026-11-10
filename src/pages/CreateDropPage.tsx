import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { generateKeySuggestion, generatePassword } from '../utils/words.ts';
import { formatBytes } from '../utils/format.ts';
import {
  generateSaltHex,
  deriveEncryptionKey,
  deriveAuthVerifier,
  encryptFile,
  encryptJson,
} from '../utils/e2ee.ts';
import type { CreateDropResult } from '../types.ts';

interface CreateDropPageProps {
  onSuccess: (result: CreateDropResult) => void;
  onBack?: () => void;
}

const BLOCKED_EXTENSIONS = [
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
];

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

export function CreateDropPage({ onSuccess, onBack }: CreateDropPageProps) {
  // Key state
  const [key, setKey] = useState<string>('');
  const [keyStatus, setKeyStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message?: string;
  }>({
    checking: false,
    available: null,
  });

  // Password state
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Files state
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expiry & limits
  const [expirySeconds, setExpirySeconds] = useState<number>(3600); // default 1 hour
  const [maxDownloads, setMaxDownloads] = useState<string>('unlimited'); // '1', '2', '5', 'unlimited'

  // Honeypot for bot detection
  const [honeypot, setHoneypot] = useState<string>('');

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittingStatus, setSubmittingStatus] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize with random suggestion once on page load
  useEffect(() => {
    const initialKey = generateKeySuggestion();
    setKey(initialKey);
    setPassword(generatePassword());
  }, []);

  // Debounced check for key availability
  useEffect(() => {
    const trimmed = key.trim().toLowerCase();
    if (!trimmed) {
      setKeyStatus({ checking: false, available: null });
      return;
    }

    if (trimmed.length < 4 || trimmed.length > 32) {
      setKeyStatus({
        checking: false,
        available: false,
        message: 'Must be between 4 and 32 characters.',
      });
      return;
    }

    const validPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!validPattern.test(trimmed)) {
      setKeyStatus({
        checking: false,
        available: false,
        message: 'Only lowercase letters, numbers, and hyphens.',
      });
      return;
    }

    setKeyStatus((prev) => ({ ...prev, checking: true }));

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/keys/check/${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.available) {
          setKeyStatus({ checking: false, available: true });
        } else {
          setKeyStatus({
            checking: false,
            available: false,
            message: data.reason || 'Key is already taken.',
          });
        }
      } catch {
        setKeyStatus({
          checking: false,
          available: null,
          message: 'Unable to check availability.',
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [key]);

  // Handle files selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
  };

  const addFiles = (newFiles: File[]) => {
    setFormError(null);
    const combined = [...files, ...newFiles];

    if (combined.length > MAX_FILES) {
      setFormError(`Maximum of ${MAX_FILES} files allowed.`);
      return;
    }

    // Check blocked extensions
    for (const f of newFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
        setFormError(`Files with .${ext} extension are blocked for security.`);
        return;
      }
    }

    // Check size limit
    const totalBytes = combined.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      setFormError(`Total size exceeds 25 MB limit (${formatBytes(totalBytes)}).`);
      return;
    }

    setFiles(combined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFormError(null);
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  // Form submit with client-side AES-GCM encryption
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (files.length === 0) {
      setFormError('Please select at least 1 file to upload.');
      return;
    }

    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (keyStatus.available === false) {
      setFormError('Please choose an available key.');
      return;
    }

    setIsSubmitting(true);
    setSubmittingStatus('Encrypting files locally with 256-bit AES-GCM...');

    try {
      // 1. Generate client-side E2EE salt & keys
      const saltHex = generateSaltHex();
      const cryptoKey = await deriveEncryptionKey(password, saltHex);
      const authVerifier = await deriveAuthVerifier(password, saltHex);

      // 2. Encrypt each file locally in browser memory
      const encryptedFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setSubmittingStatus(`Encrypting file ${i + 1} of ${files.length}...`);
        const { encryptedBlob } = await encryptFile(file, cryptoKey);
        // Upload ciphertext with random extension - server never sees real file contents
        const encFile = new File([encryptedBlob], `payload_${i}.enc`, {
          type: 'application/octet-stream',
        });
        encryptedFiles.push(encFile);
      }

      // 3. Encrypt file list metadata (names and sizes) so even filenames are zero-knowledge
      const filesMetadata = files.map((f, i) => ({
        index: i,
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
      }));
      const encryptedFileList = await encryptJson(filesMetadata, cryptoKey);

      setSubmittingStatus('Uploading encrypted drop...');

      const formData = new FormData();
      formData.append('key', key.trim().toLowerCase());
      formData.append('password', authVerifier); // Server only verifies one-way auth hash
      formData.append('saltHex', saltHex);
      formData.append('encryptedFileList', encryptedFileList);
      formData.append('expirySeconds', expirySeconds.toString());
      formData.append('maxDownloads', maxDownloads);
      if (honeypot) {
        formData.append('honeypot', honeypot);
      }

      encryptedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/drops', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create drop.');
      }

      onSuccess({
        key: data.key,
        ownerToken: data.ownerToken,
        expiresAt: data.expiresAt,
        maxDownloads: data.maxDownloads,
        fileCount: files.length,
        totalBytes: totalBytes,
        password, // saved only in client state for sender display
        saltHex,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error creating drop.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
      setSubmittingStatus('');
    }
  };

  return (
    <div className="w-full">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer flex items-center gap-1 focus:outline-none"
        >
          ← Back to home
        </button>
      )}
      <h1 className="text-xl font-bold tracking-tight text-neutral-900 mb-1">Create a drop</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Temporary, password-protected file delivery. Deletes automatically on expiry.
      </p>

      {formError && (
        <div
          role="alert"
          className="mb-6 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded"
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Honeypot field (hidden from view) */}
        <div style={{ display: 'none' }} aria-hidden="true">
          <label htmlFor="website">Website (leave empty)</label>
          <input
            id="website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* Custom Key Field */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label htmlFor="drop-key" className="block text-sm font-semibold text-neutral-900">
              Drop key
            </label>
            <button
              type="button"
              onClick={() => setKey(generateKeySuggestion())}
              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer focus:outline-none"
            >
              New suggestion
            </button>
          </div>
          <div className="relative">
            <input
              id="drop-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="e.g. blue-tiger-42"
              required
              minLength={4}
              maxLength={32}
              className="w-full px-3 py-2 border border-neutral-300 rounded text-neutral-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>
          <div className="mt-1 text-xs min-h-[18px]">
            {keyStatus.checking && <span className="text-neutral-500">Checking availability…</span>}
            {!keyStatus.checking && keyStatus.available === true && (
              <span className="text-emerald-700 font-medium">✓ Key is available</span>
            )}
            {!keyStatus.checking && keyStatus.available === false && (
              <span className="text-red-600 font-medium">{keyStatus.message || 'Key is unavailable'}</span>
            )}
            {!keyStatus.checking && keyStatus.available === null && (
              <span className="text-neutral-500">
                Letters, digits, and hyphens (4–32 chars). Recipient opens /{key || 'key'}
              </span>
            )}
          </div>
        </div>

        {/* Mandatory Password Field */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label htmlFor="drop-password" className="block text-sm font-semibold text-neutral-900">
              Password (required)
            </label>
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer focus:outline-none"
            >
              Generate random
            </button>
          </div>
          <div className="relative flex">
            <input
              id="drop-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full px-3 py-2 border border-neutral-300 rounded-l text-neutral-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="px-3 py-2 border border-l-0 border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-xs text-neutral-700 rounded-r cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Recipient must enter this exact password to unlock the files.
          </p>
        </div>

        {/* Files Selection */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-1">
            Files ({files.length} / {MAX_FILES})
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) {
                addFiles(Array.from(e.dataTransfer.files));
              }
            }}
            className="border-2 border-dashed border-neutral-300 rounded p-4 text-center cursor-pointer hover:border-neutral-400 bg-neutral-50 transition-colors"
          >
            <p className="text-sm text-neutral-800 font-medium">Click to select files or drop here</p>
            <p className="text-xs text-neutral-500 mt-1">
              1–5 files · 25 MB max total · Executables & scripts blocked
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Selected files list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs text-neutral-600 font-medium border-b border-neutral-200 pb-1">
                <span>Selected files</span>
                <span>
                  Total: {formatBytes(totalBytes)} / 25 MB
                </span>
              </div>
              <ul className="divide-y divide-neutral-200 border border-neutral-200 rounded text-xs">
                {files.map((file, idx) => (
                  <li key={idx} className="flex justify-between items-center px-3 py-2 bg-white">
                    <div className="truncate max-w-[240px]">
                      <span className="font-medium text-neutral-900">{file.name}</span>
                      <span className="text-neutral-500 ml-2">({formatBytes(file.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-neutral-500 hover:text-red-600 underline cursor-pointer p-1"
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Expiry Time Limit */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-2">Time limit</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: '10 minutes', value: 600 },
              { label: '1 hour', value: 3600 },
              { label: '2 hours', value: 7200 },
              { label: '24 hours', value: 86400 },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center justify-center p-2.5 border rounded cursor-pointer text-center font-medium ${
                  expirySeconds === option.value
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600'
                    : 'border-neutral-300 hover:border-neutral-400 bg-white text-neutral-800'
                }`}
              >
                <input
                  type="radio"
                  name="expirySeconds"
                  value={option.value}
                  checked={expirySeconds === option.value}
                  onChange={() => setExpirySeconds(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Download Limit */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-2">Download limit</label>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {[
              { label: '1 time', value: '1' },
              { label: '2 times', value: '2' },
              { label: '5 times', value: '5' },
              { label: 'Until time ends', value: 'unlimited' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center justify-center p-2.5 border rounded cursor-pointer text-center font-medium ${
                  maxDownloads === option.value
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600'
                    : 'border-neutral-300 hover:border-neutral-400 bg-white text-neutral-800'
                }`}
              >
                <input
                  type="radio"
                  name="maxDownloads"
                  value={option.value}
                  checked={maxDownloads === option.value}
                  onChange={() => setMaxDownloads(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Whichever limit is reached first triggers permanent deletion.
          </p>
        </div>


        {/* Submit Button */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting || keyStatus.available === false || files.length === 0}
            className="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white font-medium text-sm rounded cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 transition-colors min-h-[44px]"
          >
            {isSubmitting
              ? submittingStatus || 'Encrypting & uploading…'
              : 'Create encrypted drop'}
          </button>
        </div>
      </form>
    </div>
  );
}
