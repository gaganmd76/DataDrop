# DataDrop

> A minimal, login-free, temporary file-sharing app built with React, Vite, and Express.

> Live demo: (https://datadropconnect.onrender.com/)

DataDrop is a learning-focused project for secure temporary file sharing. Senders choose a custom key, set a required password, upload up to five files, and configure an expiry and download cap. Recipients can open the drop with the generated key and password to download files securely.

---

## Features

- No login, accounts, or cookies required.
- Human-friendly custom keys such as `blue-tiger-42` with live availability checks.
- Required password protection with server-side lockout after repeated failures.
- Automatic expiry with either a time limit or download limit, whichever comes first.
- Strict file limits: up to 5 files and 25 MB total per drop.
- Client-side end-to-end encryption using AES-GCM and PBKDF2 before upload.
- Server-side protection against wrong-key/wrong-password timing leaks with generic responses.
- Atomic download reservation and short-lived single-use presigned download tokens.
- Owner-only private deletion token for removing a drop before expiry.
- Security headers including `X-Content-Type-Options`, `Referrer-Policy`, and CSP.
- Mobile-first, minimal UI for a lightweight experience.

---

## How it works

1. The sender visits the app, selects a unique drop key, and enters a password.
2. Files are encrypted in the browser before they are sent to the server.
3. The server stores only encrypted file payloads, hashed auth data, and metadata for the active drop.
4. A recipient opens `/your-key`, enters the password, and unlocks the drop client-side.
5. Download links are generated as short-lived, single-use tokens; the final download may trigger automatic drop deletion.

This design keeps the server blind to plaintext file names, contents, and passwords while still providing a fast, temporary share flow.

---

## Architecture

### Frontend
- React + Vite single-page app
- Route-based flow for home, create, open, and about views
- Client-side encryption and decryption helpers in `src/utils/`

### Backend
- Express server in `server.ts`
- API router in `server/apiRouter.ts`
- Business logic in `server/dropService.ts`
- Storage abstractions in `server/storage/`

### Storage adapters
- `MetadataStore`: interface for key/value storage semantics, modeled after Redis/Valkey patterns
- `FileStorage`: interface for object-like storage semantics, modeled after S3-compatible backends
- Default implementation uses in-memory maps for local development and learning purposes

### Encryption model
- Files and file metadata are encrypted in the browser using AES-GCM.
- Password verification is derived with salted PBKDF2 / scrypt-style patterns and one-way auth verification.
- Server never receives plaintext secrets or encryption keys.

---

## Repository structure

```text
.
├── src/
│   ├── components/
│   ├── pages/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── server/
│   ├── storage/
│   ├── apiRouter.ts
│   ├── dropService.ts
│   └── types.ts
├── .env.example
├── index.html
├── package.json
├── server.ts
├── tsconfig.json
├── vite.config.ts
├── README.md
└── metadata.json
```

---

## Local development

### Prerequisites
- Node.js 20+
- npm

### Setup
```bash
npm install
cp .env.example .env
```

### Run in development mode
```bash
npm run dev
```

The app runs on port 3000 by default.

### Production build
```bash
npm run build
npm run start
```

---

## Environment variables

The project includes an example environment file:

```dotenv
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
PORT="3000"
```

---

## Security model

- Passwords and owner tokens are not sent in plaintext.
- Only one-way derived verifier data is submitted for authentication.
- Duplicate key/password failures return the same generic error response to reduce enumeration risk.
- Failed unlock attempts trigger temporary lockouts.
- File uploads are blocked for unsafe executable/script extensions.
- CSP and browser security headers are applied by the server.

---

## Known limitations

- The default storage layer is in-memory and intentionally non-persistent.
- Drops are not shared across multiple horizontally scaled instances unless a shared metadata store is introduced.
- The app is designed as a sandbox and reference implementation rather than a production-ready multi-tenant service.
- Total upload size is limited to 25 MB per drop across up to 5 files.

---

## License

This repository does not currently include a LICENSE file. If you plan to publish, redistribute, or reuse this project beyond personal learning, add a license before distribution.

---

## Summary

DataDrop demonstrates a compact, secure, temporary file-sharing workflow with a strong emphasis on zero-knowledge patterns, simple adapters, and browser-side encryption. It is intended as an open-source learning project and reference implementation, not a production-ready service.
