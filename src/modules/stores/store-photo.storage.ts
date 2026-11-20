import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from '../../common/files/uploads';
import { STORE_PHOTO_TYPE_MESSAGE, type UploadedStorePhoto, detectStorePhotoExtension } from './store-photo';

export const STORE_PHOTO_DIR = join(UPLOADS_DIR, 'stores');
const STORE_PHOTO_URL_PREFIX = `${UPLOADS_URL_PREFIX}/stores/`;

/** Writes store photos to uploads/stores/ and removes them again. */
@Injectable()
export class StorePhotoStorage implements OnModuleInit {
  private readonly logger = new Logger(StorePhotoStorage.name);

  async onModuleInit(): Promise<void> {
    await this.ensureStorePhotoDir();
  }

  /** Saves the photo under a fresh name and returns its public URL, e.g. /uploads/stores/<uuid>.jpg. */
  async saveStorePhoto(photo: UploadedStorePhoto): Promise<string> {
    const extension = detectStorePhotoExtension(photo.buffer);
    if (!extension) {
      throw new BadRequestException(STORE_PHOTO_TYPE_MESSAGE);
    }

    const fileName = `${randomUUID()}.${extension}`;
    await this.ensureStorePhotoDir();
    await writeFile(join(STORE_PHOTO_DIR, fileName), photo.buffer);
    return `${STORE_PHOTO_URL_PREFIX}${fileName}`;
  }

  /** Removes a photo saved by saveStorePhoto. A missing file is not an error; other failures are logged, not thrown. */
  async deleteStorePhoto(photoUrl: string | null): Promise<void> {
    if (!photoUrl?.startsWith(STORE_PHOTO_URL_PREFIX)) {
      return;
    }

    // basename keeps the delete inside uploads/stores/ whatever the stored URL holds.
    const filePath = join(STORE_PHOTO_DIR, basename(photoUrl));
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(`Could not delete store photo ${filePath}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async ensureStorePhotoDir(): Promise<void> {
    await mkdir(STORE_PHOTO_DIR, { recursive: true });
  }
}
