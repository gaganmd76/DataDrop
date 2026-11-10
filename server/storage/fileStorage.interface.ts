/**
 * FileStorage Interface
 *
 * Modeled after Amazon S3 / MinIO / Cloudflare R2 object storage operations.
 * Allows transparent migration from InMemoryFileStorage to S3-compatible stores.
 */

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
  size: number;
  filename: string;
}

export interface ObjectMetadata {
  size: number;
  contentType: string;
  filename: string;
}

export interface FileStorage {
  /**
   * Uploads an object into storage.
   */
  putObject(
    objectId: string,
    data: Buffer,
    metadata: { contentType: string; filename: string }
  ): Promise<void>;

  /**
   * Retrieves an object from storage. Returns null if not found.
   */
  getObject(objectId: string): Promise<StoredObject | null>;

  /**
   * Deletes an object from storage.
   */
  deleteObject(objectId: string): Promise<boolean>;

  /**
   * Deletes multiple objects by ID.
   */
  deleteMany(objectIds: string[]): Promise<void>;

  /**
   * Returns metadata for an object without loading the entire buffer.
   */
  headObject(objectId: string): Promise<ObjectMetadata | null>;
}
