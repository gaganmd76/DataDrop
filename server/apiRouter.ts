import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { DropService } from './dropService.js';
import {
  keyCheckLimiter,
  dropCreateLimiter,
  passwordAttemptLimiter,
} from './utils/rateLimiter.js';
import { MAX_FILES_PER_DROP, MAX_TOTAL_BYTES } from './utils/keyValidator.js';

// Multer memory storage for up to 5 files, 25 MB max total
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES_PER_DROP,
    fileSize: MAX_TOTAL_BYTES,
  },
});

export function createApiRouter(dropService: DropService): Router {
  const router = Router();

  /**
   * GET /api/keys/check/:key
   * Live availability check with debounce on frontend
   */
  router.get('/keys/check/:key', keyCheckLimiter.middleware(), async (req: Request, res: Response) => {
    try {
      const result = await dropService.checkKeyAvailability(req.params.key);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to verify key availability.' });
    }
  });

  /**
   * POST /api/drops
   * Create a new drop with files, password, and limits
   */
  router.post(
    '/drops',
    dropCreateLimiter.middleware(),
    upload.array('files', MAX_FILES_PER_DROP),
    async (req: Request, res: Response) => {
      try {
        const { key, password, expirySeconds, maxDownloads, honeypot, saltHex, encryptedFileList } = req.body;
        const uploadedFiles = (req.files as Express.Multer.File[]) || [];

        if (!uploadedFiles || uploadedFiles.length === 0) {
          res.status(400).json({ error: 'At least one file is required.' });
          return;
        }

        const parsedExpiry = parseInt(expirySeconds, 10) || 3600;
        const parsedMaxDownloads =
          maxDownloads === 'unlimited' || !maxDownloads || maxDownloads === 'null'
            ? null
            : parseInt(maxDownloads, 10);

        const result = await dropService.createDrop(
          key,
          password,
          parsedExpiry,
          parsedMaxDownloads,
          uploadedFiles.map((f) => ({
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            buffer: f.buffer,
          })),
          honeypot,
          saltHex,
          encryptedFileList
        );

        res.status(201).json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create drop.';
        res.status(400).json({ error: message });
      }
    }
  );

  /**
   * GET /api/drops/:key/status
   * Polling status for success screen or key inspection
   */
  router.get('/drops/:key/status', async (req: Request, res: Response) => {
    try {
      const status = await dropService.getDropStatus(req.params.key);
      if (!status) {
        res.status(404).json({ error: 'Drop not found or expired.' });
        return;
      }
      res.json(status);
    } catch {
      res.status(500).json({ error: 'Failed to query drop status.' });
    }
  });

  /**
   * GET /api/drops/:key/qr
   * Generates a clean QR code SVG or PNG data URL for sharing
   */
  router.get('/drops/:key/qr', async (req: Request, res: Response) => {
    try {
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const dropUrl = `${protocol}://${host}/${encodeURIComponent(req.params.key)}`;

      const qrSvg = await QRCode.toString(dropUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(qrSvg);
    } catch {
      res.status(500).json({ error: 'Failed to generate QR code.' });
    }
  });

  /**
   * POST /api/drops/:key/unlock
   * Submit password to unlock drop files
   */
  router.post(
    '/drops/:key/unlock',
    passwordAttemptLimiter.middleware(),
    async (req: Request, res: Response) => {
      try {
        const { password } = req.body;
        const outcome = await dropService.unlockDrop(req.params.key, password);

        if (outcome.error) {
          res.status(outcome.status).json({ error: outcome.error });
          return;
        }

        res.status(200).json(outcome.result);
      } catch {
        res.status(500).json({ error: 'Internal verification error.' });
      }
    }
  );

  /**
   * POST /api/drops/:key/files/:fileId/presign
   * Issues a short-lived (60s) single-use download token and reserves download count atomically
   */
  router.post('/drops/:key/files/:fileId/presign', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) {
        res.status(401).json({ error: 'Missing access token.' });
        return;
      }

      const fileId = decodeURIComponent(req.params.fileId);
      const presigned = await dropService.createPresignedDownload(
        req.params.key,
        fileId,
        token
      );

      res.json(presigned);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to issue download link.';
      res.status(400).json({ error: message });
    }
  });

  /**
   * GET /api/download/:token
   * Resolves simulated presigned link and streams file attachment
   */
  router.get('/download/:token', async (req: Request, res: Response) => {
    try {
      const resolved = await dropService.resolveDownloadToken(req.params.token);
      if (!resolved) {
        res.status(404).send('Download link expired or invalid.');
        return;
      }

      const { file } = resolved;

      // RFC 5987 encoded filename for safe headers
      const safeFilename = file.filename.replace(/["\r\n]/g, '');
      const encodedFilename = encodeURIComponent(file.filename);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Content-Length', file.buffer.length.toString());

      res.end(file.buffer);
    } catch {
      res.status(500).send('Error streaming download.');
    }
  });

  /**
   * DELETE /api/drops/:key
   * Instant deletion by creator using X-Owner-Token header
   */
  router.delete('/drops/:key', async (req: Request, res: Response) => {
    try {
      const ownerToken = (req.headers['x-owner-token'] as string) || '';
      const result = await dropService.deleteDrop(req.params.key, ownerToken);

      if (!result.success) {
        res.status(403).json({ error: result.error || 'Failed to delete drop.' });
        return;
      }

      res.json({ success: true, message: 'Drop has been permanently deleted.' });
    } catch {
      res.status(500).json({ error: 'Failed to delete drop.' });
    }
  });

  return router;
}
