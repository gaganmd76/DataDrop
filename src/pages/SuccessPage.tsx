import { useState, useEffect } from 'react';
import type { CreateDropResult, DropStatus } from '../types.ts';
import { formatRemainingTime, formatBytes } from '../utils/format.ts';

interface SuccessPageProps {
  drop: CreateDropResult;
  onCreateAnother: () => void;
}

export function SuccessPage({ drop, onCreateAnother }: SuccessPageProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [status, setStatus] = useState<DropStatus | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fullUrl = `${window.location.origin}/${drop.key}`;

  // Poll status every 3 seconds
  useEffect(() => {
    if (isDeleted) return;

    let isMounted = true;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/drops/${drop.key}/status`);
        if (res.status === 404) {
          if (isMounted) {
            setIsDeleted(true);
            setStatus(null);
          }
          return;
        }
        if (res.ok) {
          const data: DropStatus = await res.json();
          if (isMounted) {
            setStatus(data);
          }
        }
      } catch {
        // Silently tolerate transient network poll failure
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [drop.key, isDeleted]);

  // Copy link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Copy password to clipboard
  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(drop.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      // Fallback
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Delete now with private owner token
  const executeDeleteNow = async () => {
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/drops/${drop.key}`, {
        method: 'DELETE',
        headers: {
          'X-Owner-Token': drop.ownerToken,
        },
      });

      if (res.ok) {
        setIsDeleted(true);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to delete drop.');
        setConfirmingDelete(false);
      }
    } catch {
      setErrorMsg('Network error while deleting drop.');
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    executeDeleteNow();
  };

  if (isDeleted) {
    return (
      <div className="w-full text-center py-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 text-neutral-800 font-bold mb-4">
          ✓
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Drop deleted</h2>
        <p className="text-sm text-neutral-600 mb-6">
          All files and metadata associated with key <code className="font-mono font-bold">/{drop.key}</code> have been permanently wiped and the key is now free.
        </p>
        <button
          type="button"
          onClick={onCreateAnother}
          className="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm rounded cursor-pointer min-h-[44px]"
        >
          Create another drop
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <div className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded mb-2">
          Drop ready
        </div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          Share your drop
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          {drop.fileCount} file{drop.fileCount > 1 ? 's' : ''} ({formatBytes(drop.totalBytes)})
          ready to be downloaded.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
          {errorMsg}
        </div>
      )}

      {/* Shareable Link Box */}
      <div className="border border-neutral-300 rounded p-4 bg-neutral-50">
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
          Link to share
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={fullUrl}
            className="w-full px-3 py-2 bg-white border border-neutral-300 rounded text-sm font-mono text-neutral-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded whitespace-nowrap cursor-pointer min-h-[38px]"
          >
            {copiedLink ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Password Display */}
      <div className="border border-neutral-300 rounded p-4 bg-neutral-50">
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
          Drop password
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={drop.password}
            className="w-full px-3 py-2 bg-white border border-neutral-300 rounded text-sm font-mono font-bold text-neutral-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopyPassword}
            className="px-4 py-2 border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-medium rounded whitespace-nowrap cursor-pointer min-h-[38px]"
          >
            {copiedPassword ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Send this password separately or write it down. Recipient needs it to unlock.
        </p>
      </div>

      {/* QR Code */}
      <div className="border border-neutral-300 rounded p-6 bg-white flex flex-col items-center text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-3">
          Scan to open on phone
        </p>
        <div className="p-2 border border-neutral-200 rounded bg-white shadow-sm inline-block">
          <img
            src={`/api/drops/${drop.key}/qr`}
            alt={`QR code for ${drop.key}`}
            className="w-48 h-48 block"
            loading="eager"
          />
        </div>
        <p className="text-xs text-neutral-500 mt-3 font-mono">
          /{drop.key}
        </p>
      </div>

      {/* Live Polling Status Box */}
      <div className="border border-neutral-200 rounded p-4 bg-neutral-50 text-sm space-y-2">
        <div className="flex justify-between items-center text-xs text-neutral-500">
          <span>Live Drop Status</span>
          <span className="inline-flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
            Polling
          </span>
        </div>
        <div className="flex justify-between items-baseline font-medium text-neutral-900">
          <span>Activity</span>
          <span>{status ? status.statusText : 'Connecting…'}</span>
        </div>
        <div className="flex justify-between items-baseline text-xs text-neutral-600">
          <span>Time remaining</span>
          <span>
            {status ? formatRemainingTime(status.expiresInSeconds) : 'Calculating…'}
          </span>
        </div>
        <div className="flex justify-between items-baseline text-xs text-neutral-600">
          <span>Download policy</span>
          <span>
            {drop.maxDownloads ? `Max ${drop.maxDownloads} download(s)` : 'Until time ends'}
          </span>
        </div>
      </div>

      {/* Owner Actions */}
      <div className="pt-2 flex flex-col gap-3">
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={executeDeleteNow}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded cursor-pointer min-h-[44px] transition-colors"
            >
              {isDeleting ? 'Deleting completely…' : '⚠️ Confirm delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              className="py-2.5 px-4 border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-medium rounded cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="w-full py-2.5 px-4 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium rounded cursor-pointer min-h-[44px] transition-colors"
          >
            {isDeleting ? 'Deleting drop…' : 'Delete now (Owner)'}
          </button>
        )}

        <button
          type="button"
          onClick={onCreateAnother}
          className="w-full py-2.5 px-4 border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-medium rounded cursor-pointer min-h-[44px]"
        >
          Create another drop
        </button>
      </div>
    </div>
  );
}
