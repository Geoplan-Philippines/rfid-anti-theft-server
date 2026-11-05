import { Injectable, Logger } from '@nestjs/common';
import type { AlarmEvent, Prisma } from '@prisma/client';

import { env } from '../../core/config/env.config';
import { PrismaService } from '../../core/database/prisma.service';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';
import { CctvCaptureService } from './cctv-capture.service';

const MILLISECONDS_PER_SECOND = 1000;
const ALARM_LOCK_KEY_PREFIX = 'alarm:';

export type AlarmOutcome = 'ignored_sold' | 'duplicate' | 'alarm_created';

export type AlarmReceipt = {
  ok: true;
  outcome: AlarmOutcome;
  message: string;
  id: string | null;
  captured: boolean;
};

type AlarmClaim = {
  isNew: boolean;
  event: AlarmEvent;
};

@Injectable()
export class AlarmsService {
  private readonly logger = new Logger(AlarmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cctvCapture: CctvCaptureService,
  ) {}

  async receiveAlarm(body: ReceiveAlarmDto): Promise<AlarmReceipt> {
    const normalizedEpc = this.normalizeEpc(body.epc);

    if (await this.isEpcSold(normalizedEpc)) {
      this.logger.debug(`Sold EPC scanned: ${normalizedEpc} — ignored`);
      return { ok: true, outcome: 'ignored_sold', message: 'Sold tag, ignored', id: null, captured: false };
    }

    const claim = await this.claimAlarmEvent(body, normalizedEpc);

    if (!claim.isNew) {
      this.logger.debug(`Repeat scan of EPC ${normalizedEpc} inside the cooldown — alarm ${claim.event.id} kept`);
      return {
        ok: true,
        outcome: 'duplicate',
        message: 'Repeat scan, alarm already recorded',
        id: claim.event.id,
        captured: claim.event.captureImageUrl !== null,
      };
    }

    this.logger.warn(`Unsold EPC detected: ${normalizedEpc} — triggering CCTV capture`);
    const captureImageUrl = await this.cctvCapture.captureSnapshot(normalizedEpc);

    if (captureImageUrl !== null) {
      await this.saveCaptureImageUrl(claim.event.id, captureImageUrl);
    }

    return {
      ok: true,
      outcome: 'alarm_created',
      message: 'Unsold tag, alarm created',
      id: claim.event.id,
      captured: captureImageUrl !== null,
    };
  }

  async getAlarmEvents(query: ListAlarmEventsQueryDto): Promise<PaginatedResponse<AlarmEvent>> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const where = this.buildAlarmEventWhere(query.search);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.alarmEvent.count({ where }),
      this.prisma.alarmEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  private async isEpcSold(normalizedEpc: string): Promise<boolean> {
    const found = await this.prisma.knownEpc.findUnique({
      where: { epc: normalizedEpc },
      select: { id: true },
    });

    return found !== null;
  }

  // Returns the alarm row from the last ALARM_COOLDOWN_SECONDS for this EPC, or writes a new one.
  // The capture is not run here, so the transaction (and its pooled connection) stays short.
  private claimAlarmEvent(body: ReceiveAlarmDto, normalizedEpc: string): Promise<AlarmClaim> {
    return this.prisma.$transaction(async (tx) => {
      // One lock per EPC, released at commit. Concurrent reads of the same tag wait here,
      // so the lookup below and the insert never interleave. Different EPCs do not block each other.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ALARM_LOCK_KEY_PREFIX + normalizedEpc}::text, 0))`;

      const recentEvent = await tx.alarmEvent.findFirst({
        where: {
          epc: normalizedEpc,
          createdAt: { gte: new Date(Date.now() - env.ALARM_COOLDOWN_SECONDS * MILLISECONDS_PER_SECOND) },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentEvent) {
        return { isNew: false, event: recentEvent };
      }

      const event = await tx.alarmEvent.create({
        data: {
          epc: normalizedEpc,
          readerName: body.readerName?.trim() || null,
          scannedAt: body.scannedAt ? new Date(body.scannedAt) : null,
        },
      });

      return { isNew: true, event };
    });
  }

  private saveCaptureImageUrl(id: string, captureImageUrl: string): Promise<AlarmEvent> {
    return this.prisma.alarmEvent.update({
      where: { id },
      data: { captureImageUrl },
    });
  }

  private buildAlarmEventWhere(search?: string): Prisma.AlarmEventWhereInput {
    const normalizedSearch = search?.trim();

    if (!normalizedSearch) {
      return {};
    }

    return {
      OR: [
        { epc: { contains: normalizedSearch.replace(/\s/g, '').toUpperCase() } },
        { readerName: { contains: normalizedSearch } },
      ],
    };
  }

  private normalizeEpc(epc: string) {
    return epc.replace(/\s/g, '').trim().toUpperCase();
  }
}
