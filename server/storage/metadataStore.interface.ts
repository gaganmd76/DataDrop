/**
 * MetadataStore Interface
 *
 * Modeled after Redis/Valkey key-value operations so it can be swapped
 * with a Redis client (ioredis / valkey) in production without modifying
 * business logic.
 */
export interface MetadataStore {
  /**
   * Retrieves a string value by key. Returns null if key doesn't exist or expired.
   */
  get(key: string): Promise<string | null>;

  /**
   * Atomically sets a key only if it does not already exist (Redis SETNX).
   * @param key Storage key
   * @param value Serialized string value
   * @param ttlSeconds Time-to-live in seconds
   * @returns true if key was set, false if key already existed
   */
  setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Sets a key with an optional TTL in seconds.
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /**
   * Updates an existing key. If it doesn't exist, returns false.
   */
  update(key: string, value: string, ttlSeconds?: number): Promise<boolean>;

  /**
   * Deletes a key.
   * @returns true if key existed and was deleted, false otherwise
   */
  delete(key: string): Promise<boolean>;

  /**
   * Atomically increments an integer value stored at key (Redis INCR).
   * If key does not exist, it is set to 0 before performing the operation.
   */
  increment(key: string): Promise<number>;

  /**
   * Lists all keys matching a prefix.
   */
  list(patternPrefix: string): Promise<string[]>;

  /**
   * Returns remaining TTL in seconds, or -1 if no expiry / not found.
   */
  ttl(key: string): Promise<number>;
}
