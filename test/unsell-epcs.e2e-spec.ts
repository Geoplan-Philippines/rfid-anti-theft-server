import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import type { UnsellResult } from '../src/modules/anti-theft/anti-theft.service';

const UNSELL_URL = '/api/v1/anti-theft/epcs/unsell';

type ApiResponse<T> = {
  data: T;
};

function randomEpc(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
}

describe('Unsell EPCs (e2e)', () => {
  const soldEpc = randomEpc();
  const otherSoldEpc = randomEpc();
  const alreadyUnsoldEpc = randomEpc();
  const eventIds: string[] = [];

  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await prisma.knownEpc.createMany({ data: [{ epc: soldEpc }, { epc: otherSoldEpc }] });
  });

  afterAll(async () => {
    await prisma.unsellEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.knownEpc.deleteMany({ where: { epc: { in: [soldEpc, otherSoldEpc, alreadyUnsoldEpc] } } });
    await app.close();
  });

  it('unsells a normalized batch, reports existing state and persists an audit event', async () => {
    const response = await request(server)
      .post(UNSELL_URL)
      .send({
        epcs: [`${soldEpc.slice(0, 8)} ${soldEpc.slice(8)}`.toLowerCase(), alreadyUnsoldEpc, soldEpc],
        reason: '  Customer refund  ',
      })
      .expect(201);
    const body = response.body as ApiResponse<UnsellResult>;

    eventIds.push(body.data.id);
    expect(body.data).toMatchObject({
      actorEmail: 'unauthenticated',
      reason: 'Customer refund',
      requestedEpcs: [soldEpc, alreadyUnsoldEpc],
      unsoldEpcs: [soldEpc],
      alreadyUnsoldEpcs: [alreadyUnsoldEpc],
      duplicateEpcsIgnored: 1,
    });
    expect(await prisma.knownEpc.findUnique({ where: { epc: soldEpc } })).toBeNull();
    expect(await prisma.knownEpc.findUnique({ where: { epc: otherSoldEpc } })).not.toBeNull();

    const audit = await prisma.unsellEvent.findUnique({ where: { id: body.data.id } });
    expect(audit).toMatchObject({
      actorUserId: body.data.actorUserId,
      actorEmail: 'unauthenticated',
      reason: 'Customer refund',
      unsoldEpcs: [soldEpc],
      alreadyUnsoldEpcs: [alreadyUnsoldEpc],
    });
  });

  it('reports an already-unsold EPC on retry', async () => {
    const response = await request(server)
      .post(UNSELL_URL)
      .send({ epcs: [soldEpc] })
      .expect(201);
    const body = response.body as ApiResponse<UnsellResult>;

    eventIds.push(body.data.id);
    expect(body.data.unsoldEpcs).toEqual([]);
    expect(body.data.alreadyUnsoldEpcs).toEqual([soldEpc]);
    expect(body.data.reason).toBeNull();
  });

  it.each([
    ['no fields', {}],
    ['an empty EPC list', { epcs: [] }],
    ['more than 200 EPCs', { epcs: Array.from({ length: 201 }, () => randomEpc()) }],
    ['a blank EPC', { epcs: ['   '] }],
    ['a blank reason', { epcs: [otherSoldEpc], reason: '   ' }],
    ['an unknown field', { epcs: [otherSoldEpc], cashier: 'Ana' }],
  ])('rejects %s with 400', async (_label, body) => {
    await request(server).post(UNSELL_URL).send(body).expect(400);
  });
});
