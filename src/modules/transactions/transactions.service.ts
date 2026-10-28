import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import {
  type CanonicalTransaction,
  canonicalFromStored,
  canonicalPayloadsMatch,
  canonicalizeTransaction,
} from './transaction-payload';
import { CreateTransactionDTO } from './dto/create-transaction.dto';
import { ListTransactionsQueryDTO } from './dto/list-transactions-query.dto';

const STORED_PAYLOAD_CONFLICT = 'This clientTransactionId was stored with a different body';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MANILA_OFFSET = '+08:00';

const recordedSelect = {
  id: true,
  clientTransactionId: true,
  itemCount: true,
  duplicateEpcsIgnored: true,
  alreadySoldEpcs: true,
  createdAt: true,
} satisfies Prisma.TransactionSelect;

const snapshotSelect = {
  clientTransactionId: true,
  storeCode: true,
  deviceId: true,
  cashierName: true,
  startedAt: true,
  endedAt: true,
  itemCount: true,
  duplicateEpcsIgnored: true,
  tags: {
    select: {
      epc: true,
      scannedAt: true,
    },
  },
} satisfies Prisma.TransactionSelect;

export type RecordedTransaction = {
  id: string;
  clientTransactionId: string;
  itemCount: number;
  duplicateEpcsIgnored: number;
  alreadySoldEpcs: string[];
  createdAt: Date;
};

export type TransactionRecordResult = {
  replayed: boolean;
  result: RecordedTransaction;
};

export type TransactionSummary = {
  id: string;
  storeCode: string;
  deviceId: string;
  cashierName: string | null;
  startedAt: Date;
  endedAt: Date;
  itemCount: number;
};

export type TransactionDetail = TransactionSummary & {
  clientTransactionId: string;
  tags: { epc: string; scannedAt: Date }[];
};

type StoreOutcome =
  | { conflict: true }
  | { replayed: boolean; result: RecordedTransaction };

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordTransaction(body: CreateTransactionDTO): Promise<TransactionRecordResult> {
    const canonical = canonicalizeTransaction(body);
    if (!canonical.ok) {
      throw new BadRequestException(canonical.message);
    }

    try {
      const outcome = await this.prisma.$transaction((tx) => this.storeOrReplay(tx, canonical.value));
      if ('conflict' in outcome) {
        throw new ConflictException(STORED_PAYLOAD_CONFLICT);
      }

      return outcome;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      const replay = await this.replayStored(canonical.value);
      if (!replay) {
        throw error;
      }

      return replay;
    }
  }

  async getTransactions(query: ListTransactionsQueryDTO): Promise<PaginatedResponse<TransactionSummary>> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const where = this.buildTransactionWhere(query);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          storeCode: true,
          deviceId: true,
          cashierName: true,
          startedAt: true,
          endedAt: true,
          itemCount: true,
        },
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

  async getTransaction(id: string): Promise<TransactionDetail> {
    const row = await this.prisma.transaction.findUnique({
      where: { id },
      select: {
        id: true,
        clientTransactionId: true,
        storeCode: true,
        deviceId: true,
        cashierName: true,
        startedAt: true,
        endedAt: true,
        itemCount: true,
        tags: {
          select: { epc: true, scannedAt: true },
          orderBy: { scannedAt: 'asc' },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Transaction not found');
    }

    return row;
  }

  private async storeOrReplay(tx: Prisma.TransactionClient, value: CanonicalTransaction): Promise<StoreOutcome> {
    const existing = await tx.transaction.findUnique({
      where: { clientTransactionId: value.clientTransactionId },
      select: {
        ...snapshotSelect,
        ...recordedSelect,
      },
    });

    if (existing) {
      if (!canonicalPayloadsMatch(value, canonicalFromStored(existing))) {
        return { conflict: true };
      }

      return { replayed: true, result: toRecorded(existing) };
    }

    return { replayed: false, result: await this.insertTransaction(tx, value) };
  }

  private async insertTransaction(tx: Prisma.TransactionClient, value: CanonicalTransaction): Promise<RecordedTransaction> {
    const epcs = value.tags.map((tag) => tag.epc);
    const existingEpcs = await tx.knownEpc.findMany({
      where: { epc: { in: epcs } },
      select: { epc: true },
    });
    const alreadySold = new Set(existingEpcs.map((row) => row.epc));
    const alreadySoldEpcs = epcs.filter((epc) => alreadySold.has(epc));

    const created = await tx.transaction.create({
      data: {
        clientTransactionId: value.clientTransactionId,
        storeCode: value.storeCode,
        deviceId: value.deviceId,
        cashierName: value.cashierName,
        startedAt: value.startedAt,
        endedAt: value.endedAt,
        itemCount: value.itemCount,
        duplicateEpcsIgnored: value.duplicateEpcsIgnored,
        alreadySoldEpcs,
        tags: {
          create: value.tags.map((tag) => ({
            epc: tag.epc,
            scannedAt: tag.scannedAt,
          })),
        },
      },
      select: recordedSelect,
    });

    await tx.knownEpc.createMany({
      data: epcs.map((epc) => ({ epc })),
      skipDuplicates: true,
    });

    return created;
  }

  private async replayStored(value: CanonicalTransaction): Promise<TransactionRecordResult | undefined> {
    const existing = await this.prisma.transaction.findUnique({
      where: { clientTransactionId: value.clientTransactionId },
      select: {
        ...snapshotSelect,
        ...recordedSelect,
      },
    });

    if (!existing) {
      return undefined;
    }

    if (!canonicalPayloadsMatch(value, canonicalFromStored(existing))) {
      throw new ConflictException(STORED_PAYLOAD_CONFLICT);
    }

    return { replayed: true, result: toRecorded(existing) };
  }

  private buildTransactionWhere(query: ListTransactionsQueryDTO): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = {};
    const storeCode = query.storeCode?.trim();
    if (storeCode) {
      where.storeCode = storeCode;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { tags: { some: { epc: { contains: search.replace(/\s/g, '').toUpperCase() } } } },
        { storeCode: { contains: search } },
        { cashierName: { contains: search } },
      ];
    }

    const startedAt = startedAtFilter(query.from, query.to);
    if (startedAt) {
      where.startedAt = startedAt;
    }

    return where;
  }
}

function toRecorded(row: RecordedTransaction): RecordedTransaction {
  return {
    id: row.id,
    clientTransactionId: row.clientTransactionId,
    itemCount: row.itemCount,
    duplicateEpcsIgnored: row.duplicateEpcsIgnored,
    alreadySoldEpcs: row.alreadySoldEpcs,
    createdAt: row.createdAt,
  };
}

function startedAtFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: parseStartedAtBound(from, 'from') } : {}),
    ...(to ? { lte: parseStartedAtBound(to, 'to') } : {}),
  };
}

function parseStartedAtBound(value: string, edge: 'from' | 'to'): Date {
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  const time = edge === 'from' ? '00:00:00.000' : '23:59:59.999';
  const candidate = dateOnly
    ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T${time}${MANILA_OFFSET}`)
    : new Date(trimmed);

  if (Number.isNaN(candidate.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  return candidate;
}
