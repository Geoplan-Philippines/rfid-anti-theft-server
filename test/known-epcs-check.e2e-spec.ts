import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { CctvCaptureService } from '../src/modules/alarms/cctv-capture.service';

const CHECK_URL = '/api/v1/anti-theft/known-epcs/check';
const MAX_EPCS = 100;
const MAX_EPC_LENGTH = 128;
const RATE_LIMIT_PER_MINUTE = 3000;

type CheckBody = {
  statusCode: number;
  message: string;
  data: { results: { epc: string; sold: boolean }[] };
};

function resultsOf(response: request.Response): CheckBody['data']['results'] {
  return (response.body as CheckBody).data.results;
}

function randomEpc(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
}

async function createTestApp(captureSnapshot: jest.Mock): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CctvCaptureService)
    .useValue({ captureSnapshot })
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  await app.init();
  return app;
}

describe('Known EPC check (e2e)', () => {
  const captureSnapshot = jest.fn();
  const soldEpc = randomEpc();
  const otherSoldEpc = randomEpc();
  const unsoldEpc = randomEpc();
  const usedEpcs = [soldEpc, otherSoldEpc, unsoldEpc];

  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(captureSnapshot);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await prisma.knownEpc.createMany({ data: [{ epc: soldEpc }, { epc: otherSoldEpc }] });
  });

  beforeEach(() => {
    captureSnapshot.mockReset();
  });

  afterAll(async () => {
    await prisma.alarmEvent.deleteMany({ where: { epc: { in: usedEpcs } } });
    await prisma.knownEpc.deleteMany({ where: { epc: { in: usedEpcs } } });
    await app.close();
  });

  it('answers 200 with sold true for every sold EPC', async () => {
    const response = await check([soldEpc, otherSoldEpc]).expect(200);

    expect(response.body).toEqual({
      statusCode: 200,
      message: 'Success',
      data: {
        results: [
          { epc: soldEpc, sold: true },
          { epc: otherSoldEpc, sold: true },
        ],
      },
    });
  });

  it('answers 200 with sold false for an unsold EPC', async () => {
    const response = await check([unsoldEpc]).expect(200);

    expect(resultsOf(response)).toEqual([{ epc: unsoldEpc, sold: false }]);
  });

  it('answers a mixed batch once per normalized EPC, in first-seen order', async () => {
    const spacedSold = `${soldEpc.slice(0, 8)} ${soldEpc.slice(8)}`.toLowerCase();

    const response = await check([spacedSold, unsoldEpc.toLowerCase(), soldEpc, unsoldEpc]).expect(200);

    expect(resultsOf(response)).toEqual([
      { epc: soldEpc, sold: true },
      { epc: unsoldEpc, sold: false },
    ]);
  });

  it('writes nothing and never asks the camera, whatever it answers', async () => {
    const soldRowsBefore = await prisma.knownEpc.count({ where: { epc: { in: usedEpcs } } });

    await check([soldEpc, unsoldEpc]).expect(200);
    await check([unsoldEpc]).expect(200);

    expect(await prisma.knownEpc.count({ where: { epc: { in: usedEpcs } } })).toBe(soldRowsBefore);
    expect(await prisma.alarmEvent.count({ where: { epc: { in: usedEpcs } } })).toBe(0);
    expect(captureSnapshot).not.toHaveBeenCalled();
  });

  it(`accepts exactly ${MAX_EPCS} EPCs`, async () => {
    const epcs = [soldEpc, ...Array.from({ length: MAX_EPCS - 1 }, () => randomEpc())];

    const response = await check(epcs).expect(200);

    expect(resultsOf(response)).toHaveLength(MAX_EPCS);
    expect(resultsOf(response)[0]).toEqual({ epc: soldEpc, sold: true });
  });

  it.each([
    ['no body fields', {}],
    ['epcs not an array', { epcs: soldEpc }],
    ['an empty list', { epcs: [] }],
    [`more than ${MAX_EPCS} EPCs`, { epcs: Array.from({ length: MAX_EPCS + 1 }, () => randomEpc()) }],
    ['a number', { epcs: [123] }],
    ['null', { epcs: [null] }],
    ['an empty string', { epcs: [''] }],
    ['only whitespace', { epcs: ['   '] }],
    [`more than ${MAX_EPC_LENGTH} characters`, { epcs: ['A'.repeat(MAX_EPC_LENGTH + 1)] }],
    ['an unknown field', { epcs: [soldEpc], gate: 'GATE-1' }],
  ])('rejects %s with 400', async (_label, body) => {
    await request(server).post(CHECK_URL).send(body).expect(400);

    expect(captureSnapshot).not.toHaveBeenCalled();
  });

  function check(epcs: string[]) {
    return request(server).post(CHECK_URL).send({ epcs });
  }
});

describe('Known EPC check rate limit (e2e)', () => {
  const soldEpc = randomEpc();

  let app: INestApplication<App>;
  let baseUrl: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(jest.fn());
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
    await prisma.knownEpc.create({ data: { epc: soldEpc } });
  });

  afterAll(async () => {
    await prisma.knownEpc.deleteMany({ where: { epc: soldEpc } });
    await app.close();
  });

  it(`allows ${RATE_LIMIT_PER_MINUTE} checks per minute and then answers 429`, async () => {
    const send = () => request(baseUrl).post(CHECK_URL).send({ epcs: [soldEpc] });

    for (let sent = 0; sent < RATE_LIMIT_PER_MINUTE; sent += 1) {
      await send().expect(200);
    }

    await send().expect(429);
  }, 120_000);
});
