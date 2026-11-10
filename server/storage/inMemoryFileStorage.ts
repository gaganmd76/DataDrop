import { FileStorage, StoredObject, ObjectMetadata } from './fileStorage.interface.js';

/**
 * In-memory implementation of FileStorage using a Map.
 * Used for development and sandbox environments.
 * Note: Data is volatile and will reset on process restart.
 */
export class InMemoryFileStorage implements FileStorage {
  private files = new Map<string, StoredObject>();

  async putObject(
    objectId: string,
    data: Buffer,
    metadata: { contentType: string; filename: string }
  ): Promise<void> {
    this.files.set(objectId, {
      buffer: data,
      contentType: metadata.contentType,
      size: data.length,
      filename: metadata.filename,
    });
  }

  async getObject(objectId: string): Promise<StoredObject | null> {
    const file = this.files.get(objectId);
    return file || null;
  }

  async deleteObject(objectId: string): Promise<boolean> {
    return this.files.delete(objectId);
  }

  async deleteMany(objectIds: string[]): Promise<void> {
    for (const id of objectIds) {
      this.files.delete(id);
    }
  }

  async headObject(objectId: string): Promise<ObjectMetadata | null> {
    const file = this.files.get(objectId);
    if (!file) return null;
    return {
      size: file.size,
      contentType: file.contentType,
      filename: file.filename,
    };
  }
}
