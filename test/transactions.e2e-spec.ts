import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../prisma/seed';

const EPC_A = '30351597B03DAA10A02DD561';
const EPC_B = '30351597B03DAA10A02DD562';
const EPC_C = '30351597B03DAA10A02DD563';
const STARTED_AT = '2026-11-02T10:14:05.000Z';
const ENDED_AT = '2026-11-02T10:15:12.000Z';

type SaleTag = { epc: string; scannedAt: string };

type SaleBody = {
  clientTransactionId: string;
  storeCode: string;
  deviceId: string;
  cashierName?: string | null;
  startedAt: string;
  endedAt: string;
  tags: SaleTag[];
};

function epcFromNumber(value: number): string {
  return value.toString(16).toUpperCase().padStart(24, '0');
}

function randomEpc(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
}

function sale(body: Pick<SaleBody, 'clientTransactionId' | 'tags'> & Partial<SaleBody>): SaleBody {
  return {
    storeCode: 'MUJI-NUVALI',
    deviceId: 'POS-03-HAX7700',
    cashierName: 'Ana',
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    ...body,
  };
}

describe('Transactions (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;
  let token = '';

  const clientTransactionId = crypto.randomUUID();
  const primaryBody = sale({
    clientTransactionId,
    tags: [
      { epc: EPC_A, scannedAt: '2026-11-02T10:14:30.000Z' },
      { epc: EPC_B, scannedAt: '2026-11-02T10:14:10.000Z' },
      { epc: '3035 1597 b03daa10 a02dd563', scannedAt: '2026-11-02T10:14:20.000Z' },
    ],
  });
  const rejectedStoreCodes: string[] = [];
  let transactionId = '';
  let alreadySoldEpcs: string[] = [];
  let duplicateTransactionId = '';
  let duplicateEpc = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores three tags and lists each EPC once on known-epcs', async () => {
    const response = await request(server).post('/api/v1/transactions').send(primaryBody).expect(201);

    expect(response.body.statusCode).toBe(201);
    expect(response.body.message).toBe('Success');
    expect(response.body.data.itemCount).toBe(3);
    expect(response.body.data.duplicateEpcsIgnored).toBe(0);
    expect(response.body.data.clientTransactionId).toBe(clientTransactionId);

    transactionId = response.body.data.id;
    alreadySoldEpcs = response.body.data.alreadySoldEpcs;

    const known = await request(server).get('/api/v1/anti-theft/known-epcs').expect(200);
    const listed = known.body.data.knownEpcs as string[];
    for (const epc of [EPC_A, EPC_B, EPC_C]) {
      expect(listed.filter((value) => value === epc)).toHaveLength(1);
    }
  });

  it('returns the stored sale when the same body is posted again', async () => {
    const response = await request(server).post('/api/v1/transactions').send(primaryBody).expect(200);

    expect(response.body.statusCode).toBe(200);
    expect(response.body.data.id).toBe(transactionId);
    expect(response.body.data.itemCount).toBe(3);
    expect(response.body.data.alreadySoldEpcs).toEqual(alreadySoldEpcs);

    const known = await request(server).get('/api/v1/anti-theft/known-epcs').expect(200);
    const listed = known.body.data.knownEpcs as string[];
    for (const epc of [EPC_A, EPC_B, EPC_C]) {
      expect(listed.filter((value) => value === epc)).toHaveLength(1);
    }
  });

  it('treats equivalent timestamps as the same sale', async () => {
    const response = await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId,
          startedAt: '2026-11-02T18:14:05.000+08:00',
          endedAt: '2026-11-02T18:15:12.000+08:00',
          tags: [
            { epc: EPC_C, scannedAt: '2026-11-02T18:14:20.000+08:00' },
            { epc: EPC_A.toLowerCase(), scannedAt: '2026-11-02T18:14:30.000+08:00' },
            { epc: EPC_B, scannedAt: '2026-11-02T18:14:10.000+08:00' },
          ],
        }),
      )
      .expect(200);

    expect(response.body.statusCode).toBe(200);
    expect(response.body.data.id).toBe(transactionId);
    expect(response.body.data.alreadySoldEpcs).toEqual(alreadySoldEpcs);
  });

  it('rejects the same clientTransactionId when the cashier changes', async () => {
    await request(server)
      .post('/api/v1/transactions')
      .send(sale({ ...primaryBody, cashierName: 'Bea' }))
      .expect(409);
  });

  it('rejects an invalid body and does not store it', async () => {
    const badEpcStore = rememberRejectedStore();
    const emptyStore = rememberRejectedStore();
    const tooManyStore = rememberRejectedStore();
    const unknownStore = rememberRejectedStore();

    const badEpc = await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId: crypto.randomUUID(),
          storeCode: badEpcStore,
          tags: [{ epc: 'NOT-A-VALID-EPC', scannedAt: STARTED_AT }],
        }),
      )
      .expect(400);
    expect(badEpc.body.message).toBe('EPC must be 24 hexadecimal characters');

    await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId: crypto.randomUUID(),
          storeCode: emptyStore,
          tags: [],
        }),
      )
      .expect(400);

    await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId: crypto.randomUUID(),
          storeCode: tooManyStore,
          tags: Array.from({ length: 201 }, (_, index) => ({
            epc: epcFromNumber(index + 1),
            scannedAt: STARTED_AT,
          })),
        }),
      )
      .expect(400);

    await request(server)
      .post('/api/v1/transactions')
      .send({
        ...sale({
          clientTransactionId: crypto.randomUUID(),
          storeCode: unknownStore,
          tags: [{ epc: epcFromNumber(9000), scannedAt: STARTED_AT }],
        }),
        lane: 'extra',
      })
      .expect(400);
  });

  it('collapses duplicate EPCs and counts the copies it drops', async () => {
    duplicateEpc = randomEpc();
    const otherEpc = randomEpc();
    const response = await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId: crypto.randomUUID(),
          tags: [
            { epc: duplicateEpc, scannedAt: '2026-11-02T10:14:10.000Z' },
            { epc: duplicateEpc, scannedAt: '2026-11-02T10:14:50.000Z' },
            { epc: otherEpc, scannedAt: '2026-11-02T10:14:20.000Z' },
          ],
        }),
      )
      .expect(201);

    expect(response.body.data.itemCount).toBe(2);
    expect(response.body.data.duplicateEpcsIgnored).toBe(1);
    duplicateTransactionId = response.body.data.id;

    const known = await request(server).get('/api/v1/anti-theft/known-epcs').expect(200);
    const listed = known.body.data.knownEpcs as string[];
    expect(listed.filter((value) => value === duplicateEpc)).toHaveLength(1);
  });

  it('reports an EPC that was already on known-epcs and still stores the sale', async () => {
    const freshEpc = randomEpc();
    const response = await request(server)
      .post('/api/v1/transactions')
      .send(
        sale({
          clientTransactionId: crypto.randomUUID(),
          tags: [
            { epc: EPC_A, scannedAt: STARTED_AT },
            { epc: freshEpc, scannedAt: ENDED_AT },
          ],
        }),
      )
      .expect(201);

    expect(response.body.data.alreadySoldEpcs).toEqual([EPC_A]);
    expect(response.body.data.itemCount).toBe(2);
  });

  it('converges when the same new sale is posted twice at once', async () => {
    const payload = sale({
      clientTransactionId: crypto.randomUUID(),
      tags: [{ epc: randomEpc(), scannedAt: STARTED_AT }],
    });
    const [first, second] = await Promise.all([
      request(server).post('/api/v1/transactions').send(payload),
      request(server).post('/api/v1/transactions').send(payload),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.statusCode).toBe(first.status);
    expect(second.body.statusCode).toBe(second.status);
    expect(first.body.data.id).toBe(second.body.data.id);
    expect(first.body.data.itemCount).toBe(1);
    expect(second.body.data.itemCount).toBe(1);
  });

  it('requires a JWT for dashboard reads and allows them after login', async () => {
    await request(server).get('/api/v1/anti-theft/epcs').expect(401);
    await request(server).get('/api/v1/transactions').expect(401);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(201);
    expect(typeof login.body.data.accessToken).toBe('string');
    token = login.body.data.accessToken;

    await request(server).get('/api/v1/anti-theft/epcs').set(authHeader(token)).expect(200);
    const transactions = await request(server).get('/api/v1/transactions').set(authHeader(token)).expect(200);
    const listed = transactions.body.data.data.find((item: { id: string }) => item.id === transactionId);
    expect(Object.keys(listed).sort()).toEqual(
      ['cashierName', 'deviceId', 'endedAt', 'id', 'itemCount', 'startedAt', 'storeCode'].sort(),
    );
  });

  it('requires a JWT to list alarms', async () => {
    await request(server).get('/api/v1/alarms').expect(401);
  });

  it('returns the stored tags in scannedAt order and 404 for an unknown id', async () => {
    const response = await request(server)
      .get(`/api/v1/transactions/${transactionId}`)
      .set(authHeader(token))
      .expect(200);

    expect(response.body.data.clientTransactionId).toBe(clientTransactionId);
    expect(response.body.data.cashierName).toBe('Ana');
    expect(response.body.data.duplicateEpcsIgnored).toBeUndefined();
    expect(response.body.data.alreadySoldEpcs).toBeUndefined();
    expect(response.body.data.tags.map((tag: SaleTag) => tag.epc)).toEqual([EPC_B, EPC_C, EPC_A]);

    const duplicate = await request(server)
      .get(`/api/v1/transactions/${duplicateTransactionId}`)
      .set(authHeader(token))
      .expect(200);
    const duplicateTag = duplicate.body.data.tags.find((tag: SaleTag) => tag.epc === duplicateEpc);
    expect(duplicateTag.scannedAt).toBe('2026-11-02T10:14:10.000Z');

    await request(server)
      .get('/api/v1/transactions/00000000-0000-4000-8000-000000000000')
      .set(authHeader(token))
      .expect(404);

    for (const storeCode of rejectedStoreCodes) {
      const listed = await request(server)
        .get('/api/v1/transactions')
        .query({ storeCode, limit: 50 })
        .set(authHeader(token))
        .expect(200);
      expect(listed.body.data.meta).toEqual({
        total: 0,
        page: 1,
        limit: 50,
        lastPage: 0,
      });
    }
  });

  function rememberRejectedStore(): string {
    const storeCode = `REJECT-${crypto.randomUUID()}`;
    rejectedStoreCodes.push(storeCode);
    return storeCode;
  }
});

function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}
