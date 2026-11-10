import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { KnownEpc, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CreateKnownEpcDto } from './dto/create-known-epc.dto';
import { ListKnownEpcsQueryDto } from './dto/list-known-epcs-query.dto';
import { UpdateKnownEpcDto } from './dto/update-known-epc.dto';
import { UnsellEpcsDto } from './dto/unsell-epcs.dto';
import type { AuthenticatedUser } from '../auth/types/auth.types';

export type KnownEpcCheckResult = {
  epc: string;
  sold: boolean;
};

export type UnsellResult = {
  id: string;
  actorUserId: string;
  actorEmail: string;
  reason: string | null;
  requestedEpcs: string[];
  unsoldEpcs: string[];
  alreadyUnsoldEpcs: string[];
  duplicateEpcsIgnored: number;
  createdAt: Date;
};

@Injectable()
export class AntiTheftService {
  constructor(private readonly prisma: PrismaService) {}

  async getKnownEpcs(): Promise<string[]> {
    const rows = await this.prisma.knownEpc.findMany({
      orderBy: { createdAt: 'asc' },
      select: { epc: true },
    });

    return rows.map((row) => row.epc);
  }

  // Read-only: sold means a known_epcs row exists, the same rule POST /alarms uses. One query, no writes, no capture.
  async checkKnownEpcs(epcs: string[]): Promise<KnownEpcCheckResult[]> {
    const uniqueEpcs = [...new Set(epcs.map((epc) => this.normalizeEpc(epc)))];
    const rows = await this.prisma.knownEpc.findMany({
      where: { epc: { in: uniqueEpcs } },
      select: { epc: true },
    });
    const soldEpcs = new Set(rows.map((row) => row.epc));

    return uniqueEpcs.map((epc) => ({ epc, sold: soldEpcs.has(epc) }));
  }

  async getEpcRecords(query: ListKnownEpcsQueryDto): Promise<PaginatedResponse<KnownEpc>> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const where = this.buildKnownEpcWhere(query.search);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.knownEpc.count({ where }),
      this.prisma.knownEpc.findMany({
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

  async getEpcRecord(id: string): Promise<KnownEpc> {
    const record = await this.prisma.knownEpc.findUnique({ where: { id } });

    if (!record) {
      throw new NotFoundException('Known EPC not found');
    }

    return record;
  }

  async createEpcRecord(dto: CreateKnownEpcDto): Promise<KnownEpc> {
    const epc = this.normalizeEpc(dto.epc);
    const label = this.normalizeOptionalLabel(dto.label);

    return this.prisma.knownEpc.create({
      data: { epc, label },
    });
  }

  async unsellEpcs(dto: UnsellEpcsDto, actor: AuthenticatedUser): Promise<UnsellResult> {
    const normalizedEpcs = dto.epcs.map((epc) => this.normalizeEpc(epc));
    const requestedEpcs = [...new Set(normalizedEpcs)];
    const duplicateEpcsIgnored = normalizedEpcs.length - requestedEpcs.length;

    return this.prisma.$transaction(async (tx) => {
      const soldRows = await tx.knownEpc.findMany({
        where: { epc: { in: requestedEpcs } },
        select: { epc: true },
      });
      const soldEpcs = new Set(soldRows.map((row) => row.epc));
      const unsoldEpcs = requestedEpcs.filter((epc) => soldEpcs.has(epc));
      const alreadyUnsoldEpcs = requestedEpcs.filter((epc) => !soldEpcs.has(epc));

      if (unsoldEpcs.length > 0) {
        await tx.knownEpc.deleteMany({ where: { epc: { in: unsoldEpcs } } });
      }

      return tx.unsellEvent.create({
        data: {
          actorUserId: actor.id,
          actorEmail: actor.email,
          reason: dto.reason ?? null,
          requestedEpcs,
          unsoldEpcs,
          alreadyUnsoldEpcs,
          duplicateEpcsIgnored,
        },
      });
    });
  }

  async updateEpcRecord(id: string, dto: UpdateKnownEpcDto): Promise<KnownEpc> {
    const data: Prisma.KnownEpcUpdateInput = {};

    if (dto.epc !== undefined) {
      data.epc = this.normalizeEpc(dto.epc);
    }

    if (dto.label !== undefined) {
      data.label = this.normalizeOptionalLabel(dto.label);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No EPC update fields provided');
    }

    return this.prisma.knownEpc.update({
      where: { id },
      data,
    });
  }

  async deleteEpcRecord(id: string): Promise<{ deleted: boolean; id: string; epc: string }> {
    const deleted = await this.prisma.knownEpc.delete({ where: { id } });

    return {
      deleted: true,
      id: deleted.id,
      epc: deleted.epc,
    };
  }

  private buildKnownEpcWhere(search?: string): Prisma.KnownEpcWhereInput {
    const normalizedSearch = search?.trim();

    if (!normalizedSearch) {
      return {};
    }

    return {
      OR: [
        { epc: { contains: normalizedSearch.replace(/\s/g, '').toUpperCase() } },
        { label: { contains: normalizedSearch } },
      ],
    };
  }

  private normalizeEpc(epc: string) {
    const normalizedEpc = epc.replace(/\s/g, '').trim().toUpperCase();

    if (!normalizedEpc) {
      throw new BadRequestException('EPC cannot be empty');
    }

    return normalizedEpc;
  }

  private normalizeOptionalLabel(label?: string) {
    return label?.trim() || null;
  }
}
