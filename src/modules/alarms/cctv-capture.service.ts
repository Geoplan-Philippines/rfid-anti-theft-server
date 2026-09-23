import { Injectable, Logger } from '@nestjs/common';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { env } from '../../core/config/env.config';

const execFileAsync = promisify(execFile);

@Injectable()
export class CctvCaptureService {
  private readonly logger = new Logger(CctvCaptureService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'captures');

  async captureSnapshot(epcOrId: string): Promise<string | null> {
    const snapshotUrl = env.CCTV_SNAPSHOT_URL;

    if (!snapshotUrl) {
      this.logger.warn('CCTV_SNAPSHOT_URL not configured — skipping capture');
      return null;
    }

    try {
      await mkdir(this.uploadsDir, { recursive: true });

      const safeIdentifier = epcOrId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `capture_${timestamp}_${safeIdentifier}.jpg`;
      const filepath = join(this.uploadsDir, filename);

      const args = [
        '--silent',
        '--show-error',
        '--fail',
        '--digest',
      ];

      if (env.CCTV_USERNAME && env.CCTV_PASSWORD) {
        args.push('--user', `${env.CCTV_USERNAME}:${env.CCTV_PASSWORD}`);
      }

      args.push('--max-time', '10', snapshotUrl, '--output', filepath);

      await execFileAsync('curl', args);

      const fileStats = await stat(filepath);
      if (fileStats.size === 0) {
        this.logger.error('CCTV snapshot captured an empty file');
        return null;
      }

      this.logger.log(`CCTV snapshot saved: ${filename} (${fileStats.size} bytes)`);

      // Return the relative URL path for serving
      return `/uploads/captures/${filename}`;
    } catch (error) {
      this.logger.error(`CCTV capture failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
