import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import {
  STORE_PHOTO_FIELD,
  STORE_PHOTO_MAX_BYTES,
  STORE_PHOTO_MIME_TYPES,
  STORE_PHOTO_SIZE_MESSAGE,
  STORE_PHOTO_TYPE_MESSAGE,
} from './store-photo';

// No storage option, so multer keeps the file in memory and the service checks its bytes before anything is written.
const PhotoUploadInterceptor = FileInterceptor(STORE_PHOTO_FIELD, {
  limits: { fileSize: STORE_PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (STORE_PHOTO_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new BadRequestException(STORE_PHOTO_TYPE_MESSAGE), false);
  },
});

/** Reads an optional `photo` file from a multipart body. Multer's "File too large" becomes a message staff can act on. */
@Injectable()
export class StorePhotoInterceptor implements NestInterceptor {
  private readonly upload = new PhotoUploadInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.upload.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(STORE_PHOTO_SIZE_MESSAGE);
      }

      throw error;
    }
  }
}
