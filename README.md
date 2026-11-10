# DataDrop

> A minimal, login-free, temporary file-sharing website and open-source learning project (MIT License).

DataDrop allows senders to upload 1–5 files (25 MB total max), designate a memorable custom key, configure a mandatory password, and select automatic expiration and download limits. Recipients open `https://<host>/<key>`, enter the password, and download the files. Once either the time limit or download limit is reached, all files and metadata are permanently expunged.

---

## Features

- **No login, accounts, or cookies required**: Create and access drops with zero personal data.
- **Custom human-friendly keys**: Suggests memorable keys (e.g. `blue-tiger-42`) with real-time availability checking and atomic reservation.
- **Strict dual limits**: Drops expire automatically when either the time limit (10m, 1h, 2h, 24h) or the download counter (1, 2, 5, or until time ends) is reached.
- **Atomic download reservation**: Download count is decremented only upon clicking "Download", issuing a single-use simulated presigned URL (valid for 60 seconds).
- **Anti-brute-force defense**: Wrong key and wrong password return identical responses (`401 Incorrect key or password.`). Drops lock for 10 minutes after 5 failed attempts.
- **Constant-time verification**: Password verification with Node's native `crypto.scrypt` and constant-time token comparison prevents timing attacks.
- **Strict security headers**: Includes `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and strict `Content-Security-Policy`.
- **Instant private deletion**: Senders receive a private owner token to delete drops on demand before their scheduled expiration.
- **Mobile-first, ultra-minimal UI**: Single narrow column (`max-w-md`), system typography, no marketing fluff or icon bloat.

---

## Architecture & Adapters

DataDrop is designed as an architectural reference that decouples storage and persistence behind clean interfaces:

### 1. `MetadataStore` (`server/storage/metadataStore.interface.ts`)
- Models key-value semantics modeled after Redis / Valkey (`get`, `setIfNotExists`, `set`, `update`, `delete`, `increment`, `list`, `ttl`).
- In this learning sandbox, implemented by `InMemoryMetadataStore` (`server/storage/inMemoryMetadataStore.ts`) using standard JavaScript `Map` structures.
- Can be replaced directly with an `ioredis` or Valkey driver in production without changing application routes.

### 2. `FileStorage` (`server/storage/fileStorage.interface.ts`)
- Models S3-compatible object storage semantics (`putObject`, `getObject`, `deleteObject`, `headObject`, `deleteMany`).
- Implemented by `InMemoryFileStorage` (`server/storage/inMemoryFileStorage.ts`) using buffer maps.
- Can be replaced directly with AWS S3, MinIO, or Cloudflare R2 adapters in production.

### 3. Password Hashing
- Uses Node.js built-in `crypto.scrypt` with unique salts.
- Can be upgraded to Argon2id (`argon2` npm package) in production environments with native build toolchains.

---

## Running Locally

### Prerequisites
- Node.js 20+
- npm

### Installation & Development
```bash
# 1. Install dependencies
npm install

# 2. Run the development full-stack server (runs on port 3000)
npm run dev
```

### Production Build
```bash
# 1. Build frontend bundle
npm run build

# 2. Start full-stack server
npm run start
```

---

## Security Model & Zero-Knowledge E2EE

- **Client-Side End-to-End Encryption (E2EE)**: All files and filenames are encrypted in the sender's browser with 256-bit AES-GCM and PBKDF2 (100,000 iterations of SHA-256) before upload. The server only holds encrypted binary blobs and has no access to the plaintext content or encryption keys.
- **Passwords and owner tokens**: Passwords and owner tokens are never sent in plaintext. Only domain-separated cryptographic auth hashes are sent to the server for authentication.
- **Trust & Safety**: Contact `safety@datadrop.example` with the relevant drop key.

---

## Known Limitations

- **In-Memory Volatility**: Because this sandbox runs with in-memory adapters (`InMemoryMetadataStore` and `InMemoryFileStorage`), all active drops and uploaded files are stored in volatile Node process memory and will reset whenever the server restarts.
- **Single Instance**: The default in-memory maps do not share state across horizontally scaled replicas. For production multi-replica deployments, configure Redis/Valkey for `MetadataStore` and S3/MinIO for `FileStorage`.
- **File Size Ceiling**: Default ceiling is 25 MB total per drop across up to 5 files.

---

## License

Dev: GVC copyright @GVC2026.
