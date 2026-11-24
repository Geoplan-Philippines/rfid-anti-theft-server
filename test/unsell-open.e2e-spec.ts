import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

jest.mock('../src/core/config/env.config', () => ({
  env: { JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long' },
}));

import { PrismaModule } from '../src/core/database/prisma.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptors';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersService } from '../src/modules/users/users.service';
import { AntiTheftModule } from '../src/modules/anti-theft/anti-theft.module';

const EPC = 'E28011700000020F1A2B3C4D';
const URL = '/api/v1/anti-theft/epcs/unsell';

describe('Open unsell endpoint (real controller, service, validation; isolated database)', () => {
  let app: INestApplication;
  const sold = new Set<string>();
  const createEvent = jest.fn();
  const transaction = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, AntiTheftModule] })
      .overrideProvider(PrismaService).useValue({ $transaction: transaction })
      .overrideProvider(UsersService).useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    sold.clear(); sold.add(EPC);
    createEvent.mockReset().mockImplementation(({ data }) => ({ id: 'event-1', createdAt: new Date(), ...data }));
    transaction.mockReset().mockImplementation(async (callback) => callback({
      knownEpc: {
        findMany: async ({ where }) => where.epc.in.filter((epc: string) => sold.has(epc)).map((epc: string) => ({ epc })),
        deleteMany: async ({ where }) => { for (const epc of where.epc.in) sold.delete(epc); },
      },
      unsellEvent: { create: createEvent },
    }));
  });

  afterAll(async () => { await app?.close(); });

  it('posts the widget payload without credentials or IDs and persists an anonymous audit', async () => {
    const response = await request(app.getHttpServer()).post(URL).send({ epcs: [EPC], reason: 'Item Return' }).expect(201);
    expect(response.body.data).toMatchObject({
      actorUserId: 'unauthenticated', actorEmail: 'unauthenticated', reason: 'Item Return',
      requestedEpcs: [EPC], unsoldEpcs: [EPC], alreadyUnsoldEpcs: [],
    });
    expect(sold.has(EPC)).toBe(false);
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('reports an already-unsold item when a pending return retries', async () => {
    await request(app.getHttpServer()).post(URL).send({ epcs: [EPC], reason: 'Item Return' }).expect(201);
    const response = await request(app.getHttpServer()).post(URL).send({ epcs: [EPC], reason: 'Item Return' }).expect(201);
    expect(response.body.data.unsoldEpcs).toEqual([]);
    expect(response.body.data.alreadyUnsoldEpcs).toEqual([EPC]);
  });

  it('does not depend on stale authentication headers', async () => {
    await request(app.getHttpServer()).post(URL).set('Authorization', 'Bearer obsolete-token')
      .set('X-API-Key', 'obsolete-key').send({ epcs: [EPC] }).expect(201);
  });

  it.each([
    {}, { epcs: [] }, { epcs: [123] }, { epcs: ['   '] },
    { epcs: Array.from({ length: 201 }, () => EPC) },
    { epcs: [EPC], reason: '' }, { epcs: [EPC], reason: 'x'.repeat(501) },
    { epcs: [EPC], actorUserId: 'spoofed' },
  ])('still validates payloads: %p', async (body) => {
    await request(app.getHttpServer()).post(URL).send(body).expect(400);
    expect(createEvent).not.toHaveBeenCalled();
    expect(sold.has(EPC)).toBe(true);
  });

  it.each(['get', 'post', 'patch', 'delete'] as const)('keeps %s EPC-management requests protected', async (method) => {
    const path = method === 'patch' || method === 'delete' ? '/api/v1/anti-theft/epcs/record-id' : '/api/v1/anti-theft/epcs';
    await request(app.getHttpServer())[method](path).expect(401);
  });
});
