import { Injectable } from '@nestjs/common';
import type { AlarmEvent, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';

@Injectable()
export class AlarmsService {
  constructor(private readonly prisma: PrismaService) {}

  async receiveAlarm(body: ReceiveAlarmDto): Promise<{ ok: boolean; message: string; id: string }> {
    const event = await this.recordAlarmEvent(body);

    return {
      ok: true,
      message: 'Alarm received',
      id: event.id,
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

  private recordAlarmEvent(body: ReceiveAlarmDto): Promise<AlarmEvent> {
    return this.prisma.alarmEvent.create({
      data: {
        epc: this.normalizeEpc(body.epc),
        readerName: body.readerName?.trim() || null,
        scannedAt: body.scannedAt ? new Date(body.scannedAt) : null,
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
