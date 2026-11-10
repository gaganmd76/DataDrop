interface AboutPageProps {
  onNavigateHome: () => void;
}

export function AboutPage({ onNavigateHome }: AboutPageProps) {
  return (
    <div className="w-full space-y-6 text-sm text-neutral-800">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 mb-2">About DataDrop</h1>
        <p className="text-neutral-600">
          A minimal, login-free, temporary file-sharing project.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">How it works</h2>
        <p className="text-neutral-700 leading-relaxed">
          The sender picks a custom URL key, sets a mandatory password, and uploads up to 5 files
          (25 MB total limit). Files are held in temporary memory until either the time limit or the
          specified download limit is reached. Once reached, everything is purged permanently.
        </p>
      </section>

      <section className="space-y-2 p-4 bg-neutral-50 border border-neutral-200 rounded">
        <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">End-to-End Encryption (E2EE)</h2>
        <p className="text-neutral-700 leading-relaxed">
          <strong>Files are fully End-to-End Encrypted (E2EE).</strong> All files and metadata are encrypted in the sender's browser using 256-bit AES-GCM and PBKDF2 (100,000 iterations of SHA-256) before transmission.
        </p>
        <p className="text-neutral-700 leading-relaxed">
          The encryption keys never leave your browser. The server only stores encrypted ciphertext blobs and cannot inspect your filenames, contents, or plaintext password. Decryption happens strictly in the recipient's browser.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Trust & Safety</h2>
        <p className="text-neutral-700 leading-relaxed">
          DataDrop is built for private, temporary communication. To report prohibited material or request assistance, contact{' '}
          <a
            href="mailto:safety@datadrop.example"
            className="text-blue-600 hover:text-blue-800 underline font-mono"
          >
            safety@datadrop.example
          </a>
          . Please include the drop key in your report.
        </p>
      </section>


      <div className="pt-4">
        <button
          type="button"
          onClick={onNavigateHome}
          className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded cursor-pointer min-h-[44px]"
        >
          Return to home
        </button>
      </div>
    </div>
  );
}
