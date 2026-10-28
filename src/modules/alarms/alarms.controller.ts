import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AlarmEvent } from '@prisma/client';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { AlarmsService } from './alarms.service';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Get()
  @UseGuards(PassportJwtGuard)
  async getAlarmEvents(
    @Query() query: ListAlarmEventsQueryDto,
  ): Promise<PaginatedResponse<AlarmEvent>> {
    return this.alarmsService.getAlarmEvents(query);
  }

  // TODO: replace this open route with a per-device key once the widget and the gate bridge can log in.
  @Post()
  async receiveAlarm(
    @Body() body: ReceiveAlarmDto,
  ): Promise<{ ok: boolean; message: string; id: string; captured: boolean }> {
    return this.alarmsService.receiveAlarm(body);
  }
}
