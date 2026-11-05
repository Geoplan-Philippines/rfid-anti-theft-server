import { Body, Controller, Get, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AlarmEvent } from '@prisma/client';
import type { Response } from 'express';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { AlarmsService, type AlarmReceipt } from './alarms.service';
import { ListAlarmEventsQueryDto } from './dto/list-alarm-events-query.dto';
import { ReceiveAlarmDto } from './dto/receive-alarm.dto';

// A gate posts every tag in range about every 3 seconds, so this route gets more than the global 100 per minute.
const GATE_ALARM_LIMIT_PER_MINUTE = 600;
const ONE_MINUTE_MS = 60_000;

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
  @Throttle({ default: { limit: GATE_ALARM_LIMIT_PER_MINUTE, ttl: ONE_MINUTE_MS } })
  async receiveAlarm(
    @Body() body: ReceiveAlarmDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AlarmReceipt> {
    const receipt = await this.alarmsService.receiveAlarm(body);
    response.status(receipt.outcome === 'alarm_created' ? HttpStatus.CREATED : HttpStatus.OK);
    return receipt;
  }
}
