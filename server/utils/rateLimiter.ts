import type { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

/**
 * Lightweight in-memory sliding window rate limiter per client IP.
 */
export class InMemoryRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly message: string;

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.message = config.message;

    // Periodic sweep to prevent unbounded memory growth
    setInterval(() => this.cleanup(), 60_000);
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter((t) => now - t < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, valid);
      }
    }
  }

  public check(req: Request): { allowed: boolean; remaining: number } {
    const ip = this.getClientIp(req);
    const now = Date.now();
    const timestamps = (this.requests.get(ip) || []).filter((t) => now - t < this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this.requests.set(ip, timestamps);
    return { allowed: true, remaining: this.maxRequests - timestamps.length };
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const { allowed } = this.check(req);
      if (!allowed) {
        res.status(429).json({ error: this.message });
        return;
      }
      next();
    };
  }
}

// Configured rate limiters:
// Key availability checks: max 60 per minute per IP
export const keyCheckLimiter = new InMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many key check requests. Please slow down.',
});

// Drop creation: max 10 per 10 minutes per IP
export const dropCreateLimiter = new InMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many drops created from this address. Please wait a few minutes.',
});

// Password unlock attempts: max 15 per 5 minutes per IP
export const passwordAttemptLimiter = new InMemoryRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 15,
  message: 'Too many unlock attempts. Please wait before trying again.',
});
