import { MetadataStore } from './metadataStore.interface.js';

interface Entry {
  value: string;
  expiresAt: number | null; // Unix timestamp in ms
}

/**
 * In-memory implementation of MetadataStore using a Map.
 * Used for development and sandbox environments.
 * Note: Data is volatile and will reset on process restart.
 */
export class InMemoryMetadataStore implements MetadataStore {
  private store = new Map<string, Entry>();

  private isExpired(entry: Entry): boolean {
    if (entry.expiresAt === null) return false;
    return Date.now() > entry.expiresAt;
  }

  private cleanIfExpired(key: string): Entry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cleanIfExpired(key);
    return entry ? entry.value : null;
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.cleanIfExpired(key);
    if (existing) {
      return false; // Key already active
    }

    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return true;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async update(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const existing = this.cleanIfExpired(key);
    if (!existing) return false;

    let expiresAt = existing.expiresAt;
    if (ttlSeconds !== undefined) {
      expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    }
    this.store.set(key, { value, expiresAt });
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async increment(key: string): Promise<number> {
    const entry = this.cleanIfExpired(key);
    let current = 0;
    let expiresAt: number | null = null;

    if (entry) {
      current = parseInt(entry.value, 10);
      if (isNaN(current)) current = 0;
      expiresAt = entry.expiresAt;
    }

    const next = current + 1;
    this.store.set(key, { value: next.toString(), expiresAt });
    return next;
  }

  async list(patternPrefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      if (key.startsWith(patternPrefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cleanIfExpired(key);
    if (!entry) return -2; // Key does not exist
    if (entry.expiresAt === null) return -1; // No TTL set
    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.floor(remainingMs / 1000));
  }
}
