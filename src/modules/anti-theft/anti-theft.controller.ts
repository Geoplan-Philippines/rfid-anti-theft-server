import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { KnownEpc } from '@prisma/client';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { AntiTheftService } from './anti-theft.service';
import { CreateKnownEpcDto } from './dto/create-known-epc.dto';
import { ListKnownEpcsQueryDto } from './dto/list-known-epcs-query.dto';
import { UpdateKnownEpcDto } from './dto/update-known-epc.dto';

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
