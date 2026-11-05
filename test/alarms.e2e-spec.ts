import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { env } from '../src/core/config/env.config';
import { PrismaService } from '../src/core/database/prisma.service';
import { CctvCaptureService } from '../src/modules/alarms/cctv-capture.service';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../prisma/seed';

const ALARMS_URL = '/api/v1/alarms';
const CAPTURE_URL = '/uploads/captures/test-snapshot.jpg';
const SCANNED_AT = '2026-11-02T10:14:20.000Z';
const RATE_LIMIT_PER_MINUTE = 600;
const SIMULTANEOUS_READS = 25;
const MILLISECONDS_PER_SECOND = 1000;

type AlarmBody = {
  epc: string;
  readerName?: string;
  scannedAt?: string;
};

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

describe('Alarms (e2e)', () => {
  const captureSnapshot = jest.fn();
  const usedEpcs: string[] = [];
  const soldTransactionIds: string[] = [];

  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;
  let baseUrl: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(captureSnapshot);
    await app.listen(0);
    server = app.getHttpServer();
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    captureSnapshot.mockReset();
    captureSnapshot.mockResolvedValue(CAPTURE_URL);
  });

  afterAll(async () => {
    await prisma.alarmEvent.deleteMany({ where: { epc: { in: usedEpcs } } });
    await prisma.knownEpc.deleteMany({ where: { epc: { in: usedEpcs } } });
    await prisma.transaction.deleteMany({ where: { clientTransactionId: { in: soldTransactionIds } } });
    await app.close();
  });

  it('ignores a sold tag: no row, no capture, outcome ignored_sold', async () => {
    const epc = await sellTag();

    const response = await postAlarm({ epc, readerName: 'GATE-1', scannedAt: SCANNED_AT }).expect(200);

    expect(response.body.statusCode).toBe(200);
    expect(response.body.message).toBe('Success');
    expect(response.body.data).toEqual({
      ok: true,
      outcome: 'ignored_sold',
      id: null,
      captured: false,
      message: 'Sold tag, ignored',
    });
    expect(await countAlarms(epc)).toBe(0);
    expect(captureSnapshot).not.toHaveBeenCalled();
  });

  it('ignores a sold tag when the gate sends it in lowercase with spaces', async () => {
    const epc = await sellTag();
    const spaced = `${epc.slice(0, 8)} ${epc.slice(8, 16)} ${epc.slice(16)}`.toLowerCase();

    const response = await postAlarm({ epc: spaced }).expect(200);

    expect(response.body.data.outcome).toBe('ignored_sold');
    expect(await countAlarms(epc)).toBe(0);
    expect(captureSnapshot).not.toHaveBeenCalled();
  });

  it('writes one row, captures once and returns 201 for an unsold tag', async () => {
    const epc = trackEpc(randomEpc());

    const response = await postAlarm({ epc, readerName: 'GATE-1', scannedAt: SCANNED_AT }).expect(201);

    expect(response.body.statusCode).toBe(201);
    expect(response.body.message).toBe('Success');
    expect(response.body.data).toEqual({
      ok: true,
      outcome: 'alarm_created',
      id: expect.any(String),
      captured: true,
      message: expect.any(String),
    });

    const rows = await findAlarms(epc);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(response.body.data.id);
    expect(rows[0].readerName).toBe('GATE-1');
    expect(rows[0].scannedAt?.toISOString()).toBe(SCANNED_AT);
    expect(rows[0].captureImageUrl).toBe(CAPTURE_URL);
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
    expect(captureSnapshot).toHaveBeenCalledWith(epc);
  });

  it('keeps one row and does not capture again when the tag repeats inside the cooldown, whichever gate reads it', async () => {
    const epc = trackEpc(randomEpc());

    const first = await postAlarm({ epc, readerName: 'GATE-1' }).expect(201);
    const repeat = await postAlarm({ epc, readerName: 'GATE-2' }).expect(200);

    expect(repeat.body.statusCode).toBe(200);
    expect(repeat.body.data).toEqual({
      ok: true,
      outcome: 'duplicate',
      id: first.body.data.id,
      captured: true,
      message: expect.any(String),
    });
    expect(await countAlarms(epc)).toBe(1);
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reports captured false on a repeat when the first alarm has no snapshot', async () => {
    const epc = trackEpc(randomEpc());
    captureSnapshot.mockResolvedValue(null);

    const first = await postAlarm({ epc }).expect(201);
    const repeat = await postAlarm({ epc }).expect(200);

    expect(first.body.data.captured).toBe(false);
    expect(repeat.body.data).toMatchObject({ outcome: 'duplicate', id: first.body.data.id, captured: false });
    expect(await countAlarms(epc)).toBe(1);
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
  });

  it('alarms again once the cooldown has passed', async () => {
    const epc = trackEpc(randomEpc());

    const first = await postAlarm({ epc }).expect(201);

    await moveAlarmsBack(epc, env.ALARM_COOLDOWN_SECONDS - 5);
    const insideWindow = await postAlarm({ epc }).expect(200);
    expect(insideWindow.body.data).toMatchObject({ outcome: 'duplicate', id: first.body.data.id });
    expect(await countAlarms(epc)).toBe(1);

    await moveAlarmsBack(epc, env.ALARM_COOLDOWN_SECONDS + 1);
    const afterWindow = await postAlarm({ epc }).expect(201);
    expect(afterWindow.body.data.outcome).toBe('alarm_created');
    expect(afterWindow.body.data.id).not.toBe(first.body.data.id);
    expect(await countAlarms(epc)).toBe(2);
    expect(captureSnapshot).toHaveBeenCalledTimes(2);
  });

  it('writes one row when the same new tag arrives at the same moment', async () => {
    const epc = trackEpc(randomEpc());
    captureSnapshot.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return CAPTURE_URL;
    });

    // Posting to the bound URL opens every connection at once, so the requests really overlap.
    const responses = await Promise.all(
      Array.from({ length: SIMULTANEOUS_READS }, () => request(baseUrl).post(ALARMS_URL).send({ epc })),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(SIMULTANEOUS_READS - 1);
    expect(new Set(responses.map((response) => response.body.data.id)).size).toBe(1);
    expect(await countAlarms(epc)).toBe(1);
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not a hex string', 'NOT-A-VALID-EPC'],
    ['too short', 'A0'],
    ['too long', '30351597B03DAA10A02DD553FFFF'],
    ['spaces and lowercase', ' zz top 99 '],
  ])('still alarms on a malformed EPC (%s)', async (_label, shape) => {
    const suffix = randomEpc().slice(0, 8);
    const sent = `${shape}-${suffix}`;
    const epc = trackEpc(sent.replace(/\s/g, '').toUpperCase());

    const response = await postAlarm({ epc: sent }).expect(201);

    expect(response.body.data.outcome).toBe('alarm_created');
    expect(await countAlarms(epc)).toBe(1);
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown fields and a missing epc with 400 and writes nothing', async () => {
    const epc = trackEpc(randomEpc());

    await request(server).post(ALARMS_URL).send({ epc, gate: 'GATE-1' }).expect(400);
    await request(server).post(ALARMS_URL).send({ readerName: 'GATE-1' }).expect(400);
    await request(server).post(ALARMS_URL).send({ epc, scannedAt: 'not-a-date' }).expect(400);

    expect(await countAlarms(epc)).toBe(0);
    expect(captureSnapshot).not.toHaveBeenCalled();
  });

  it('shows only real alarms on the dashboard list', async () => {
    const soldEpc = await sellTag();
    const unsoldEpc = trackEpc(randomEpc());

    await postAlarm({ epc: soldEpc }).expect(200);
    await postAlarm({ epc: unsoldEpc }).expect(201);
    await postAlarm({ epc: unsoldEpc }).expect(200);

    const login = await request(server).post('/api/v1/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(201);
    const authorization = { Authorization: `Bearer ${login.body.data.accessToken}` };

    const unsoldList = await request(server).get(ALARMS_URL).query({ search: unsoldEpc }).set(authorization).expect(200);
    expect(unsoldList.body.data.meta.total).toBe(1);
    expect(unsoldList.body.data.data[0].epc).toBe(unsoldEpc);

    const soldList = await request(server).get(ALARMS_URL).query({ search: soldEpc }).set(authorization).expect(200);
    expect(soldList.body.data.meta.total).toBe(0);
  });

  function postAlarm(body: AlarmBody) {
    return request(server).post(ALARMS_URL).send(body);
  }

  function trackEpc(epc: string): string {
    usedEpcs.push(epc);
    return epc;
  }

  // Sells a fresh tag through the real transactions route, the same way the till does.
  async function sellTag(): Promise<string> {
    const epc = trackEpc(randomEpc());
    const clientTransactionId = crypto.randomUUID();
    soldTransactionIds.push(clientTransactionId);

    await request(server)
      .post('/api/v1/transactions')
      .send({
        clientTransactionId,
        storeCode: 'ALARM-TEST',
        deviceId: 'POS-TEST',
        startedAt: '2026-11-02T10:14:05.000Z',
        endedAt: '2026-11-02T10:15:12.000Z',
        tags: [{ epc, scannedAt: SCANNED_AT }],
      })
      .expect(201);

    return epc;
  }

  function findAlarms(epc: string) {
    return prisma.alarmEvent.findMany({ where: { epc }, orderBy: { createdAt: 'asc' } });
  }

  function countAlarms(epc: string): Promise<number> {
    return prisma.alarmEvent.count({ where: { epc } });
  }

  async function moveAlarmsBack(epc: string, seconds: number): Promise<void> {
    await prisma.alarmEvent.updateMany({
      where: { epc },
      data: { createdAt: new Date(Date.now() - seconds * MILLISECONDS_PER_SECOND) },
    });
  }
});

describe('Alarms rate limit (e2e)', () => {
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

  it('allows 600 requests per minute on POST /alarms and then answers 429', async () => {
    const send = () => request(baseUrl).post(ALARMS_URL).send({ epc: soldEpc });

    for (let sent = 0; sent < RATE_LIMIT_PER_MINUTE; sent += 1) {
      await send().expect(200);
    }

    await send().expect(429);
  });
});
