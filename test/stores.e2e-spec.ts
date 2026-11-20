import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { existsSync, readdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import request from 'supertest';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { serveUploads } from '../src/common/files/uploads';
import { PrismaService } from '../src/core/database/prisma.service';
import { STORE_PHOTO_DIR } from '../src/modules/stores/store-photo.storage';
import type { StoreResponse } from '../src/modules/stores/stores.service';
import type { TransactionDetail, TransactionSummary } from '../src/modules/transactions/transactions.service';

const STORES_URL = '/api/v1/stores';
const TRANSACTIONS_URL = '/api/v1/transactions';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const STORE_KEYS = ['address', 'code', 'createdAt', 'id', 'name', 'photoUrl'];
const PHOTO_URL_PATTERN = /^\/uploads\/stores\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
// Start-of-image marker and an APP0 segment header: enough for the JPG signature check.
const JPEG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const SIX_MEGABYTES = 6 * 1024 * 1024;

type ApiBody<T> = { statusCode: number; message: string; data: T };
type ErrorBody = { statusCode: number; message: string | string[]; error: string };
type Paginated<T> = { data: T[]; meta: { total: number; page: number; limit: number; lastPage: number } };

function photoPath(photoUrl: string): string {
  return join(STORE_PHOTO_DIR, basename(photoUrl));
}

function storePhotoFileCount(): number {
  return existsSync(STORE_PHOTO_DIR) ? readdirSync(STORE_PHOTO_DIR).length : 0;
}

function randomEpc(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
}

describe('Stores (e2e)', () => {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const nuvaliCode = `E2E-NUVALI-${suffix}`;
  const marikinaCode = `E2E-MARIKINA-${suffix}`;
  const unregisteredCode = `E2E-POC-${suffix}`;
  const createdStoreIds: string[] = [];
  const postedSaleIds: string[] = [];
  const postedEpcs: string[] = [];

  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;
  let token = '';
  let nuvali: StoreResponse;
  let marikina: StoreResponse;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    serveUploads(app);
    await app.init();

    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    token = (login.body as ApiBody<{ accessToken: string }>).data.accessToken;
  });

  afterAll(async () => {
    const leftovers = await prisma.store.findMany({ where: { id: { in: createdStoreIds } } });
    await Promise.all(
      leftovers.filter((store) => store.photoUrl).map((store) => unlink(photoPath(store.photoUrl!)).catch(() => undefined)),
    );
    await prisma.store.deleteMany({ where: { id: { in: createdStoreIds } } });
    await prisma.transaction.deleteMany({ where: { id: { in: postedSaleIds } } });
    await prisma.knownEpc.deleteMany({ where: { epc: { in: postedEpcs } } });
    await app.close();
  });

  function auth(): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  function rememberStore(store: StoreResponse): StoreResponse {
    createdStoreIds.push(store.id);
    return store;
  }

  async function postSale(storeCode: string): Promise<string> {
    const epc = randomEpc();
    const clientTransactionId = crypto.randomUUID();
    const response = await request(server)
      .post(TRANSACTIONS_URL)
      .send({
        clientTransactionId,
        storeCode,
        deviceId: 'POS-03-HAX7700',
        startedAt: '2026-11-19T02:00:00.000Z',
        endedAt: '2026-11-19T02:01:00.000Z',
        tags: [{ epc, scannedAt: '2026-11-19T02:00:30.000Z' }],
      })
      .expect(201);

    const body = response.body as ApiBody<{ id: string; clientTransactionId: string }>;
    expect(body.data.clientTransactionId).toBe(clientTransactionId);
    postedSaleIds.push(body.data.id);
    postedEpcs.push(epc);
    return body.data.id;
  }

  async function listedSale(storeCode: string, saleId: string): Promise<TransactionSummary> {
    const response = await request(server)
      .get(TRANSACTIONS_URL)
      .query({ storeCode, limit: 50 })
      .set(auth())
      .expect(200);
    const sales = (response.body as ApiBody<Paginated<TransactionSummary>>).data.data;
    const sale = sales.find((item) => item.id === saleId);
    expect(sale).toBeDefined();
    return sale!;
  }

  it('requires a JWT', async () => {
    await request(server).get(STORES_URL).expect(401);
    await request(server).post(STORES_URL).field('code', nuvaliCode).field('name', 'Nope').expect(401);
    await request(server).delete(`${STORES_URL}/${MISSING_ID}`).expect(401);
  });

  it('creates a store with a photo and serves the photo from /uploads/stores', async () => {
    const response = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', nuvaliCode)
      .field('name', 'MUJI SM Nuvali')
      .field('address', '  SM City Nuvali, Santa Rosa, Laguna  ')
      .attach('photo', PNG_PIXEL, { filename: 'nuvali.png', contentType: 'image/png' })
      .expect(201);

    nuvali = rememberStore((response.body as ApiBody<StoreResponse>).data);
    expect(Object.keys(nuvali).sort()).toEqual(STORE_KEYS);
    expect(nuvali).toMatchObject({
      code: nuvaliCode,
      name: 'MUJI SM Nuvali',
      address: 'SM City Nuvali, Santa Rosa, Laguna',
    });
    expect(nuvali.photoUrl).toMatch(PHOTO_URL_PATTERN);
    expect(nuvali.photoUrl!.endsWith('.png')).toBe(true);
    expect(existsSync(photoPath(nuvali.photoUrl!))).toBe(true);

    const photo = await request(server).get(nuvali.photoUrl!).expect(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(photo.body as Buffer, PNG_PIXEL)).toBe(0);
  });

  it('creates a store without a photo', async () => {
    const response = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', marikinaCode)
      .field('name', 'MUJI SM City Marikina')
      .expect(201);

    marikina = rememberStore((response.body as ApiBody<StoreResponse>).data);
    expect(marikina).toMatchObject({ code: marikinaCode, name: 'MUJI SM City Marikina', address: null, photoUrl: null });
  });

  it('returns 409 for a code that differs only in case or surrounding spaces, and saves no photo', async () => {
    const filesBefore = storePhotoFileCount();
    const response = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `  ${nuvaliCode.toLowerCase()} `)
      .field('name', 'Duplicate')
      .attach('photo', PNG_PIXEL, { filename: 'dup.png', contentType: 'image/png' })
      .expect(409);

    const body = response.body as ErrorBody;
    expect(body.message).toBe(`A store with code "${nuvaliCode}" already exists. Store codes are not case-sensitive.`);
    expect(storePhotoFileCount()).toBe(filesBefore);
  });

  it('rejects a missing code or a blank name with a clear message', async () => {
    const missingCode = await request(server).post(STORES_URL).set(auth()).field('name', 'No code').expect(400);
    expect((missingCode.body as ErrorBody).message).toContain('Store code is required.');

    const blankName = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `E2E-BLANK-${suffix}`)
      .field('name', '   ')
      .expect(400);
    expect((blankName.body as ErrorBody).message).toContain('Store name is required.');
  });

  it('accepts only JPG, PNG or WebP up to 5 MB and writes nothing for a rejected photo', async () => {
    const filesBefore = storePhotoFileCount();

    const textFile = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `E2E-TEXT-${suffix}`)
      .field('name', 'Text photo')
      .attach('photo', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' })
      .expect(400);
    expect((textFile.body as ErrorBody).message).toBe('Photo must be a JPG, PNG or WebP image.');

    const disguised = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `E2E-FAKE-${suffix}`)
      .field('name', 'Fake PNG')
      .attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
    expect((disguised.body as ErrorBody).message).toBe('Photo must be a JPG, PNG or WebP image.');

    const oversized = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `E2E-BIG-${suffix}`)
      .field('name', 'Big photo')
      .attach('photo', Buffer.concat([PNG_PIXEL, Buffer.alloc(SIX_MEGABYTES)]), { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect((oversized.body as ErrorBody).message).toBe('Photo must be 5 MB or smaller.');

    expect(storePhotoFileCount()).toBe(filesBefore);
    const stored = await prisma.store.count({
      where: { code: { in: [`E2E-TEXT-${suffix}`, `E2E-FAKE-${suffix}`, `E2E-BIG-${suffix}`] } },
    });
    expect(stored).toBe(0);
  });

  it('gets one store and lists stores', async () => {
    const one = await request(server).get(`${STORES_URL}/${nuvali.id}`).set(auth()).expect(200);
    expect((one.body as ApiBody<StoreResponse>).data).toMatchObject({ id: nuvali.id, code: nuvaliCode });

    const list = await request(server).get(STORES_URL).query({ limit: 50 }).set(auth()).expect(200);
    const page = (list.body as ApiBody<Paginated<StoreResponse>>).data;
    const ids = page.data.map((store) => store.id);
    expect(ids).toEqual(expect.arrayContaining([nuvali.id, marikina.id]));
    expect(page.meta).toMatchObject({ page: 1, limit: 50 });

    await request(server).get(`${STORES_URL}/${MISSING_ID}`).set(auth()).expect(404);
    await request(server).get(`${STORES_URL}/not-a-uuid`).set(auth()).expect(400);
  });

  it('replaces the photo and removes the old file', async () => {
    const oldPhotoUrl = nuvali.photoUrl!;
    const response = await request(server)
      .patch(`${STORES_URL}/${nuvali.id}`)
      .set(auth())
      .attach('photo', JPEG_HEADER, { filename: 'nuvali.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const updated = (response.body as ApiBody<StoreResponse>).data;
    expect(updated.photoUrl).toMatch(PHOTO_URL_PATTERN);
    expect(updated.photoUrl!.endsWith('.jpg')).toBe(true);
    expect(updated.photoUrl).not.toBe(oldPhotoUrl);
    expect(updated.name).toBe('MUJI SM Nuvali');
    expect(existsSync(photoPath(updated.photoUrl!))).toBe(true);
    expect(existsSync(photoPath(oldPhotoUrl))).toBe(false);
    await request(server).get(oldPhotoUrl).expect(404);
    nuvali = updated;
  });

  it('edits text fields and keeps the photo', async () => {
    const response = await request(server)
      .patch(`${STORES_URL}/${nuvali.id}`)
      .set(auth())
      .field('name', 'MUJI Nuvali')
      .field('address', '')
      .expect(200);

    const updated = (response.body as ApiBody<StoreResponse>).data;
    expect(updated).toMatchObject({ name: 'MUJI Nuvali', address: null, photoUrl: nuvali.photoUrl });
    expect(existsSync(photoPath(updated.photoUrl!))).toBe(true);
    nuvali = updated;
  });

  it('refuses another store\'s code on edit but lets a store change the case of its own', async () => {
    const taken = await request(server)
      .patch(`${STORES_URL}/${marikina.id}`)
      .set(auth())
      .field('code', nuvaliCode.toLowerCase())
      .expect(409);
    expect((taken.body as ErrorBody).message).toContain(`"${nuvaliCode}" already exists`);

    const recased = await request(server)
      .patch(`${STORES_URL}/${marikina.id}`)
      .set(auth())
      .field('code', marikinaCode.toLowerCase())
      .expect(200);
    expect((recased.body as ApiBody<StoreResponse>).data.code).toBe(marikinaCode.toLowerCase());
  });

  it('removes the photo on request', async () => {
    const photoUrl = nuvali.photoUrl!;
    const response = await request(server)
      .patch(`${STORES_URL}/${nuvali.id}`)
      .set(auth())
      .field('removePhoto', 'true')
      .expect(200);

    expect((response.body as ApiBody<StoreResponse>).data.photoUrl).toBeNull();
    expect(existsSync(photoPath(photoUrl))).toBe(false);
  });

  it('deletes a store together with its photo', async () => {
    const created = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', `E2E-DELETE-${suffix}`)
      .field('name', 'To delete')
      .attach('photo', PNG_PIXEL, { filename: 'delete.png', contentType: 'image/png' })
      .expect(201);
    const store = rememberStore((created.body as ApiBody<StoreResponse>).data);
    expect(existsSync(photoPath(store.photoUrl!))).toBe(true);

    const deleted = await request(server).delete(`${STORES_URL}/${store.id}`).set(auth()).expect(200);
    expect((deleted.body as ApiBody<StoreResponse>).data.id).toBe(store.id);
    expect(existsSync(photoPath(store.photoUrl!))).toBe(false);

    await request(server).get(`${STORES_URL}/${store.id}`).set(auth()).expect(404);
    await request(server).delete(`${STORES_URL}/${store.id}`).set(auth()).expect(404);
  });

  it('shows the store name on a sale whose code is registered', async () => {
    const saleId = await postSale(nuvaliCode);
    const sale = await listedSale(nuvaliCode, saleId);

    expect(sale).toMatchObject({ storeCode: nuvaliCode, storeName: 'MUJI Nuvali', registered: true });
  });

  it('accepts a sale with an unregistered code and reports it as registered: false', async () => {
    const saleId = await postSale(unregisteredCode);
    const sale = await listedSale(unregisteredCode, saleId);

    expect(sale).toMatchObject({ storeCode: unregisteredCode, storeName: null, registered: false });
  });

  it('links old sales when their code is registered later, and unlinks them when the store is deleted', async () => {
    const saleId = await postSale(unregisteredCode);
    const before = await prisma.transaction.findUniqueOrThrow({ where: { id: saleId } });

    const created = await request(server)
      .post(STORES_URL)
      .set(auth())
      .field('code', ` ${unregisteredCode.toLowerCase()} `)
      .field('name', 'Proof of concept store')
      .expect(201);
    const store = rememberStore((created.body as ApiBody<StoreResponse>).data);

    const linked = await listedSale(unregisteredCode.toLowerCase(), saleId);
    expect(linked).toMatchObject({ storeCode: unregisteredCode, storeName: 'Proof of concept store', registered: true });

    const detail = await request(server).get(`${TRANSACTIONS_URL}/${saleId}`).set(auth()).expect(200);
    expect((detail.body as ApiBody<TransactionDetail>).data).toMatchObject({
      storeCode: unregisteredCode,
      storeName: 'Proof of concept store',
      registered: true,
    });

    await request(server).delete(`${STORES_URL}/${store.id}`).set(auth()).expect(200);
    const unlinked = await listedSale(unregisteredCode, saleId);
    expect(unlinked).toMatchObject({ storeCode: unregisteredCode, storeName: null, registered: false });

    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: saleId } });
    expect(after).toEqual(before);
  });
});
