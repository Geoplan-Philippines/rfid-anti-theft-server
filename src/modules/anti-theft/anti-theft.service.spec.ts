import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { AntiTheftService } from './anti-theft.service';

const SOLD_EPC = 'E28069950000AA039398B5EA';
const UNSOLD_EPC = '3BE100003744AA2700000769';

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
