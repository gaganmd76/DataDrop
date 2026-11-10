import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InMemoryMetadataStore } from './server/storage/inMemoryMetadataStore.ts';
import { InMemoryFileStorage } from './server/storage/inMemoryFileStorage.ts';
import { DropService } from './server/dropService.ts';
import { createApiRouter } from './server/apiRouter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Instantiate storage adapters (In-memory implementations)
  // Architecture allows swapping with Redis/Valkey and S3 stores transparently.
  const metadataStore = new InMemoryMetadataStore();
  const fileStorage = new InMemoryFileStorage();

  // Core business service
  const dropService = new DropService(metadataStore, fileStorage);

  // Background cleanup job: purges expired drops every 5 minutes
  setInterval(async () => {
    try {
      const purged = await dropService.cleanupExpiredDrops();
      if (purged > 0) {
        console.log(`[Cleaner] Automatically purged ${purged} expired drop(s).`);
      }
    } catch (err) {
      console.error('[Cleaner] Error running periodic cleanup:', err);
    }
  }, 5 * 60 * 1000);

  // Global Security Headers Middleware
  app.use((req, res, next) => {
    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Hide referrer data when navigating away
    res.setHeader('Referrer-Policy', 'no-referrer');

    // For API endpoints, deny framing strictly
    if (req.path.startsWith('/api/')) {
      res.setHeader('X-Frame-Options', 'DENY');
    } else {
      // In web preview environment, allow embedding within host iframe
      if (!isProduction) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; frame-ancestors 'self' https://*.google.com https://*.run.app;"
        );
      } else {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none';"
        );
      }
    }
    next();
  });

  // Body parsers for JSON and URL-encoded bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount API Router under /api
  app.use('/api', createApiRouter(dropService));

  // Client-Side Routing and Frontend Serving
  if (!isProduction) {
    // In development: mount Vite dev server middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // In production: serve static build files
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));

    app.get('*', (_req, res) => {
      const indexPath = path.resolve(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application build not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DataDrop server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
