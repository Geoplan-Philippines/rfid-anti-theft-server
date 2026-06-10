import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { AlarmEvent } from '@prisma/client';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { AlarmsService } from './alarms.service';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Get()
  getAlarmEvents(
    @Query() query: ListAlarmEventsQueryDto,
  ): Promise<PaginatedResponse<AlarmEvent>> {
    return this.alarmsService.getAlarmEvents(query);
  }

  @Post()
  async receiveAlarm(
    @Body() body: ReceiveAlarmDto,
  ): Promise<{ ok: boolean; message: string; id: string }> {
    return this.alarmsService.receiveAlarm(body);
  }
}
