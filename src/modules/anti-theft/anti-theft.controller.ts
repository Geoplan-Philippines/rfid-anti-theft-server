import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { KnownEpc } from '@prisma/client';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AntiTheftService, type KnownEpcCheckResult, type UnsellResult } from './anti-theft.service';
import { CheckKnownEpcsDto } from './dto/check-known-epcs.dto';
import { CreateKnownEpcDto } from './dto/create-known-epc.dto';
import { ListKnownEpcsQueryDto } from './dto/list-known-epcs-query.dto';
import { UpdateKnownEpcDto } from './dto/update-known-epc.dto';
import { UnsellEpcsDto } from './dto/unsell-epcs.dto';

// The gate bridge checks every tag packet before deciding whether the gate sounds, at most one check in flight per
// gate. Several busy gates share one bridge IP, so this route gets more than the global 100 per minute.
const GATE_CHECK_LIMIT_PER_MINUTE = 3000;
const ONE_MINUTE_MS = 60_000;

@Controller('anti-theft')
export class AntiTheftController {
  constructor(private readonly antiTheftService: AntiTheftService) {}

  // TODO: replace this open route with a per-device key once the widget and the gate bridge can log in.
  @Get('known-epcs')
  async getKnownEpcs(): Promise<{ knownEpcs: string[] }> {
    return {
      knownEpcs: await this.antiTheftService.getKnownEpcs(),
    };
  }

  // TODO: replace this open route with a per-device key once the widget and the gate bridge can log in.
  @Post('known-epcs/check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: GATE_CHECK_LIMIT_PER_MINUTE, ttl: ONE_MINUTE_MS } })
  async checkKnownEpcs(@Body() body: CheckKnownEpcsDto): Promise<{ results: KnownEpcCheckResult[] }> {
    return {
      results: await this.antiTheftService.checkKnownEpcs(body.epcs),
    };
  }

  @Get('epcs')
  @UseGuards(PassportJwtGuard)
  async getEpcRecords(@Query() query: ListKnownEpcsQueryDto): Promise<PaginatedResponse<KnownEpc>> {
    return this.antiTheftService.getEpcRecords(query);
  }

  @Get('epcs/:id')
  @UseGuards(PassportJwtGuard)
  async getEpcRecord(@Param('id') id: string): Promise<KnownEpc> {
    return this.antiTheftService.getEpcRecord(id);
  }

  @Post('epcs')
  @UseGuards(PassportJwtGuard)
  async createEpcRecord(@Body() body: CreateKnownEpcDto): Promise<KnownEpc> {
    return this.antiTheftService.createEpcRecord(body);
  }

  @Post('epcs/unsell')
  @UseGuards(PassportJwtGuard)
  async unsellEpcs(
    @Body() body: UnsellEpcsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnsellResult> {
    return this.antiTheftService.unsellEpcs(body, user);
  }

  @Patch('epcs/:id')
  @UseGuards(PassportJwtGuard)
  async updateEpcRecord(@Param('id') id: string, @Body() body: UpdateKnownEpcDto): Promise<KnownEpc> {
    return this.antiTheftService.updateEpcRecord(id, body);
  }

  @Delete('epcs/:id')
  @UseGuards(PassportJwtGuard)
  async deleteEpcRecord(@Param('id') id: string): Promise<{ deleted: boolean; id: string; epc: string }> {
    return this.antiTheftService.deleteEpcRecord(id);
  }
}
