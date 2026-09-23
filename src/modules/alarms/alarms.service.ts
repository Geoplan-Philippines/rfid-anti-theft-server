import { Injectable, Logger } from '@nestjs/common';
import type { AlarmEvent, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';
import { CctvCaptureService } from './cctv-capture.service';

@Injectable()
export class AlarmsService {
  private readonly logger = new Logger(AlarmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cctvCapture: CctvCaptureService,
  ) {}

  async receiveAlarm(body: ReceiveAlarmDto): Promise<{ ok: boolean; message: string; id: string; captured: boolean }> {
    const normalizedEpc = this.normalizeEpc(body.epc);

    // Check if this EPC is whitelisted
    const isWhitelisted = await this.isEpcWhitelisted(normalizedEpc);

    let captureImageUrl: string | null = null;

    if (!isWhitelisted) {
      this.logger.warn(`Unwhitelisted EPC detected: ${normalizedEpc} — triggering CCTV capture`);
      captureImageUrl = await this.cctvCapture.captureSnapshot(normalizedEpc);
    } else {
      this.logger.log(`Whitelisted EPC scanned: ${normalizedEpc} — no capture needed`);
    }

    const event = await this.recordAlarmEvent(body, normalizedEpc, captureImageUrl);

    return {
      ok: true,
      message: isWhitelisted ? 'Whitelisted tag — logged only' : 'Unwhitelisted tag — alarm triggered & captured',
      id: event.id,
      captured: !isWhitelisted && captureImageUrl !== null,
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

  private async isEpcWhitelisted(normalizedEpc: string): Promise<boolean> {
    const found = await this.prisma.knownEpc.findUnique({
      where: { epc: normalizedEpc },
      select: { id: true },
    });

    return found !== null;
  }

  private recordAlarmEvent(
    body: ReceiveAlarmDto,
    normalizedEpc: string,
    captureImageUrl: string | null,
  ): Promise<AlarmEvent> {
    return this.prisma.alarmEvent.create({
      data: {
        epc: normalizedEpc,
        readerName: body.readerName?.trim() || null,
        scannedAt: body.scannedAt ? new Date(body.scannedAt) : null,
        captureImageUrl,
      },
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
