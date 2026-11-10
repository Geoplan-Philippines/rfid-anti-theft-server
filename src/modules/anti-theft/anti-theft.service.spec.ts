import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { AntiTheftService, type UnsellResult } from './anti-theft.service';

const SOLD_EPC = 'E28069950000AA039398B5EA';
const UNSOLD_EPC = '3BE100003744AA2700000769';

type UnsellTransactionMock = {
  knownEpc: {
    findMany: typeof jest.fn;
    deleteMany: typeof jest.fn;
  };
  unsellEvent: {
    create: typeof jest.fn;
  };
};

describe('AntiTheftService.checkKnownEpcs', () => {
  const findMany = jest.fn();
  let service: AntiTheftService;

  beforeEach(async () => {
    findMany.mockReset();
    // Only findMany exists, so any write the service tried would throw.
    const module: TestingModule = await Test.createTestingModule({
      providers: [AntiTheftService, { provide: PrismaService, useValue: { knownEpc: { findMany } } }],
    }).compile();

    service = module.get(AntiTheftService);
  });

  it('answers every EPC once, normalized, in first-seen order, with one read', async () => {
    findMany.mockResolvedValue([{ epc: SOLD_EPC }]);

    const results = await service.checkKnownEpcs([
      UNSOLD_EPC.toLowerCase(),
      ` ${SOLD_EPC.slice(0, 12)} ${SOLD_EPC.slice(12).toLowerCase()} `,
      UNSOLD_EPC,
      SOLD_EPC,
    ]);

    expect(results).toEqual([
      { epc: UNSOLD_EPC, sold: false },
      { epc: SOLD_EPC, sold: true },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { epc: { in: [UNSOLD_EPC, SOLD_EPC] } },
      select: { epc: true },
    });
  });

  it('reports every EPC unsold when none is on the sold list', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.checkKnownEpcs([UNSOLD_EPC])).resolves.toEqual([{ epc: UNSOLD_EPC, sold: false }]);
  });

  it('rejects an EPC that is only whitespace before querying', async () => {
    await expect(service.checkKnownEpcs([SOLD_EPC, '   '])).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lets a database failure surface, so the caller sees an error rather than a sold or unsold answer', async () => {
    findMany.mockRejectedValue(new Error('connection lost'));

    await expect(service.checkKnownEpcs([SOLD_EPC])).rejects.toThrow('connection lost');
  });
});

describe('AntiTheftService.unsellEpcs', () => {
  const findMany = jest.fn();
  const deleteMany = jest.fn();
  const createEvent = jest.fn();
  const transaction = jest.fn();
  let service: AntiTheftService;

  beforeEach(async () => {
    findMany.mockReset();
    deleteMany.mockReset();
    createEvent.mockReset();
    transaction.mockReset();
    transaction.mockImplementation((callback: (tx: UnsellTransactionMock) => unknown) => callback({
      knownEpc: { findMany, deleteMany },
      unsellEvent: { create: createEvent },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [AntiTheftService, { provide: PrismaService, useValue: { $transaction: transaction } }],
    }).compile();

    service = module.get(AntiTheftService);
  });

  it('normalizes and deduplicates EPCs, removes sold rows and writes the audit event', async () => {
    const actor = { id: 'user-1', email: 'admin@example.com', role: 'ADMIN' as const };
    const createdAt = new Date('2026-11-10T01:00:00.000Z');
    findMany.mockResolvedValue([{ epc: SOLD_EPC }]);
    deleteMany.mockResolvedValue({ count: 1 });
    createEvent.mockImplementation(({ data }) => Promise.resolve({ id: 'event-1', createdAt, ...data }));

    const result = await service.unsellEpcs(
      {
        epcs: [` ${SOLD_EPC.toLowerCase()} `, UNSOLD_EPC, SOLD_EPC],
        reason: 'Customer refund',
      },
      actor,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { epc: { in: [SOLD_EPC, UNSOLD_EPC] } },
      select: { epc: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { epc: { in: [SOLD_EPC] } } });
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        actorUserId: actor.id,
        actorEmail: actor.email,
        reason: 'Customer refund',
        requestedEpcs: [SOLD_EPC, UNSOLD_EPC],
        unsoldEpcs: [SOLD_EPC],
        alreadyUnsoldEpcs: [UNSOLD_EPC],
        duplicateEpcsIgnored: 1,
      },
    });
    expect(result).toEqual<UnsellResult>({
      id: 'event-1',
      actorUserId: actor.id,
      actorEmail: actor.email,
      reason: 'Customer refund',
      requestedEpcs: [SOLD_EPC, UNSOLD_EPC],
      unsoldEpcs: [SOLD_EPC],
      alreadyUnsoldEpcs: [UNSOLD_EPC],
      duplicateEpcsIgnored: 1,
      createdAt,
    });
  });

  it('records an idempotent retry without issuing an empty delete', async () => {
    findMany.mockResolvedValue([]);
    createEvent.mockImplementation(({ data }) => Promise.resolve({
      id: 'event-2',
      createdAt: new Date('2026-11-10T01:01:00.000Z'),
      ...data,
    }));

    const result = await service.unsellEpcs(
      { epcs: [UNSOLD_EPC] },
      { id: 'user-1', email: 'admin@example.com', role: 'ADMIN' },
    );

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.unsoldEpcs).toEqual([]);
    expect(result.alreadyUnsoldEpcs).toEqual([UNSOLD_EPC]);
    expect(result.reason).toBeNull();
  });
});
