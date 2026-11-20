import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Folder on disk that holds every uploaded or captured file. Kept out of git. */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

/** Public URL prefix the uploads folder is served under. */
export const UPLOADS_URL_PREFIX = '/uploads';

/** Serve the uploads folder at /uploads/* with CORS and cross-origin CORP headers, so the dashboard can load images. */
export function serveUploads(app: NestExpressApplication): void {
  app.useStaticAssets(UPLOADS_DIR, {
    prefix: UPLOADS_URL_PREFIX,
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
}
