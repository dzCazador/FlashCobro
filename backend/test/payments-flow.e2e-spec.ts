import type { Mock } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import http from 'node:http';
import * as crypto from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/modules/payments/prisma.service.js';
import {
  MercadoPagoApiService,
  type MercadoPagoPaymentDetail,
} from '../src/modules/webhooks/mercadopago-api.service.js';
import { MercadoPagoTransferPollerService } from '../src/modules/webhooks/mercadopago-transfer-poller.service.js';
import { createInMemoryPrisma } from './helpers/in-memory-prisma.js';

process.env.MP_WEBHOOK_SECRET = 'test-secret-clave-e2e-12345';
process.env.MP_ACCESS_TOKEN = 'TEST-0000000000000000-000000-AAAAAAAAAAAAAAAAAAAAAAAA-000000000';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/flashcobro_test';
process.env.MP_POLL_INTERVAL_MS = '600000';
process.env.MP_POLL_WINDOW_SECONDS = '120';
process.env.MP_BACKFILL_HOURS = '1';

type ApiMock = {
  fetchPaymentDetail: Mock;
  searchIncomingTransfers: Mock;
};

function makeApprovedDetail(
  overrides: Partial<MercadoPagoPaymentDetail> = {},
): MercadoPagoPaymentDetail {
  return {
    mercadoPagoPaymentId: '900000001',
    amount: 2500,
    currency: 'ARS',
    status: 'approved',
    statusDetail: 'accredited',
    paymentMethod: 'Tarjeta de crédito',
    payerName: 'Juan Perez',
    payerEmail: 'juan@example.com',
    timestamp: '2026-09-16T12:00:00.000Z',
    ...overrides,
  };
}

function makeIncomingTransfer(
  overrides: Partial<MercadoPagoPaymentDetail> = {},
): MercadoPagoPaymentDetail {
  return {
    mercadoPagoPaymentId: '700000001',
    amount: 1500,
    currency: 'ARS',
    status: 'approved',
    statusDetail: 'accredited',
    paymentMethod: 'Transferencia bancaria',
    payerName: null,
    payerEmail: null,
    timestamp: '2026-09-16T13:00:00.000Z',
    ...overrides,
  };
}

function signWebhook(secret: string, dataId: string, requestId: string) {
  const ts = Math.floor(Date.now() / 1000);
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return { ts, v1 };
}

function webhookHeaders(paymentId: string, requestId = 'test-request-id'): Record<string, string> {
  const { ts, v1 } = signWebhook(process.env.MP_WEBHOOK_SECRET!, paymentId, requestId);
  return {
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': requestId,
  };
}

function webhookBody(paymentId: string): Record<string, unknown> {
  return {
    action: 'payment.created',
    type: 'payment',
    live_mode: true,
    data: { id: paymentId },
  };
}

function captureEvent<T>(emitter: EventEmitter2, eventName: string): Promise<T> {
  return new Promise<T>((resolve) => {
    emitter.once(eventName, (payload: T) => resolve(payload));
  });
}

function waitForSseData(
  port: number,
  matcher: (buffer: string) => boolean,
  timeoutMs = 5000,
  cookie = '',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/payments/stream',
        headers: cookie ? { Cookie: cookie } : {},
      },
      (res) => {
        let buffer = '';
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`[SSE] timeout esperando datos; buffer="${buffer}"`));
        }, timeoutMs);
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          if (matcher(buffer)) {
            clearTimeout(timer);
            req.destroy();
            resolve();
          }
        });
        res.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      },
    );
    req.on('error', (err) => reject(err));
  });
}

describe('FlashCobro e2e: webhook → DB → SSE', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let eventEmitter: EventEmitter2;
  let port: number;
  let apiMock: ApiMock;
  let store: ReturnType<typeof createInMemoryPrisma>;
  let agent: ReturnType<typeof request.agent>;
  let sseCookie: string;

  beforeAll(async () => {
    store = createInMemoryPrisma();
    apiMock = {
      fetchPaymentDetail: vi.fn().mockResolvedValue(null),
      searchIncomingTransfers: vi.fn().mockResolvedValue([]),
    } satisfies ApiMock;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MercadoPagoApiService)
      .useValue(apiMock)
      .overrideProvider(PrismaService)
      .useValue(store as unknown as PrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    port = address.port;
    eventEmitter = moduleRef.get(EventEmitter2);

    agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const setCookieHeader = login.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookieHeader)
      ? (setCookieHeader as unknown as string[])[0]
      : String(setCookieHeader);
    sseCookie = rawCookie.split(';')[0];
  });

  beforeEach(() => {
    store.__reset();
    apiMock.fetchPaymentDetail.mockResolvedValue(null);
    apiMock.searchIncomingTransfers.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST firmado: pago aprobado → persiste en DB → emite payment.approved → visible en history', async () => {
    const paymentId = '900000001';
    apiMock.fetchPaymentDetail.mockResolvedValue(makeApprovedDetail());

    const emitted = captureEvent<Record<string, unknown>>(eventEmitter, 'payment.approved');

    const res = await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);

    expect(res.body).toEqual({ received: true });
    expect(apiMock.fetchPaymentDetail).toHaveBeenCalledWith(paymentId);

    const payload = await emitted;
    expect(payload).toMatchObject({
      paymentId,
      amount: 2500,
      currency: 'ARS',
      status: 'approved',
      paymentMethod: 'Tarjeta de crédito',
      payerName: 'Juan Perez',
    });
    expect(payload.formattedAmount).toContain('2.500,00');

    expect(store.__count()).toBe(1);
    const saved = await store.payment.findUnique({ where: { mercadoPagoPaymentId: paymentId } });
    expect(saved).not.toBeNull();

    const { body: history } = await agent
      .get('/api/v1/payments/history')
      .expect(200);
    expect(history).toHaveLength(1);
    expect(history[0].mercadoPagoPaymentId).toBe(paymentId);
  });

  it('GET IPN legacy (sin firma) también persiste el pago', async () => {
    const paymentId = '900000002';
    apiMock.fetchPaymentDetail.mockResolvedValue(
      makeApprovedDetail({ mercadoPagoPaymentId: paymentId }),
    );

    await agent
      .get(`/api/v1/webhooks/mercadopago?data.id=${paymentId}`)
      .expect(200, { received: true });

    expect(store.__count()).toBe(1);
  });

  it('Pago rechazado → no se persiste ni se emite', async () => {
    const paymentId = '900000003';
    apiMock.fetchPaymentDetail.mockResolvedValue(
      makeApprovedDetail({ mercadoPagoPaymentId: paymentId, status: 'rejected' }),
    );

    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);

    expect(store.__count()).toBe(0);
  });

  it('Firma inválida → 401 Unauthorized', async () => {
    const paymentId = '900000004';

    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set('x-signature', 'ts=1,v1=firma-invalida')
      .set('x-request-id', 'req-invalida')
      .send(webhookBody(paymentId))
      .expect(401);

    expect(store.__count()).toBe(0);
  });

  it('Webhook duplicado → se ignora (idempotencia)', async () => {
    const paymentId = '900000005';
    apiMock.fetchPaymentDetail.mockResolvedValue(
      makeApprovedDetail({ mercadoPagoPaymentId: paymentId }),
    );

    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);
    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);

    expect(store.__count()).toBe(1);
  });

  it('SSE emite payment_received en vivo tras llegar el webhook', async () => {
    const paymentId = '900000006';
    apiMock.fetchPaymentDetail.mockResolvedValue(
      makeApprovedDetail({ mercadoPagoPaymentId: paymentId }),
    );

    let sseData = '';
    const sse = waitForSseData(
      port,
      (buffer) => {
        sseData = buffer;
        return buffer.includes('payment_received');
      },
      5000,
      sseCookie,
    );

    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);

    await expect(sse).resolves.toBeUndefined();
    expect(sseData).toContain('payerEmail":"juan@example.com');
  }, 10000);

  it('Login con credenciales incorrectas → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'password-incorrecta' })
      .expect(401);
  });

  it('Rechaza endpoints protegidos sin sesión', async () => {
    const anonymous = request(app.getHttpServer());
    await anonymous.get('/api/v1/payments/history').expect(401);
    await anonymous.get('/api/v1/payments/summary').expect(401);
  });

  it('GET /api/v1/auth/me refleja el estado de la sesión', async () => {
    const { body: authed } = await agent.get('/api/v1/auth/me').expect(200);
    expect(authed).toEqual({ authenticated: true });

    const { body: anonymous } = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(200);
    expect(anonymous).toEqual({ authenticated: false });
  });

  it('GET /api/v1/payments/summary agrupa los cobros del día', async () => {
    const paymentId = '900000007';
    apiMock.fetchPaymentDetail.mockResolvedValue(
      makeApprovedDetail({ mercadoPagoPaymentId: paymentId, amount: 100 }),
    );

    await agent
      .post('/api/v1/webhooks/mercadopago')
      .set(webhookHeaders(paymentId))
      .send(webhookBody(paymentId))
      .expect(200);

    const { body } = await agent
      .get('/api/v1/payments/summary')
      .expect(200);

    expect(body).toEqual([
      {
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        total: 100,
        count: 1,
      },
    ]);
  });
});

describe('FlashCobro e2e: polling de transferencias CVU', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let poller: MercadoPagoTransferPollerService;
  let apiMock: ApiMock;
  let store: ReturnType<typeof createInMemoryPrisma>;

  beforeAll(async () => {
    store = createInMemoryPrisma();
    apiMock = {
      fetchPaymentDetail: vi.fn().mockResolvedValue(null),
      searchIncomingTransfers: vi.fn().mockResolvedValue([makeIncomingTransfer()]),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MercadoPagoApiService)
      .useValue(apiMock)
      .overrideProvider(PrismaService)
      .useValue(store as unknown as PrismaService)
      .compile();

    eventEmitter = moduleRef.get(EventEmitter2, { strict: false });
    poller = moduleRef.get(MercadoPagoTransferPollerService);

    const emitted = captureEvent<Record<string, unknown>>(eventEmitter, 'payment.approved');

    app = moduleRef.createNestApplication();
    await app.init();

    const payload = await emitted;
    expect(payload).toMatchObject({
      paymentId: '700000001',
      amount: 1500,
      currency: 'ARS',
      status: 'approved',
      paymentMethod: 'Transferencia bancaria',
      payerName: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Backfill al arrancar persiste la transferencia (dedupe: no duplica)', async () => {
    expect(store.__count()).toBe(1);

    await (poller as unknown as { backfill: () => Promise<void> }).backfill();

    expect(store.__count()).toBe(1);
    expect(apiMock.searchIncomingTransfers).toHaveBeenCalled();
  });

  it('Transferencia rechazada en el backfill no se persiste', async () => {
    store.__reset();
    apiMock.searchIncomingTransfers.mockResolvedValue([
      makeIncomingTransfer({ mercadoPagoPaymentId: '700000002', status: 'rejected' }),
    ]);

    await (poller as unknown as { backfill: () => Promise<void> }).backfill();

    expect(store.__count()).toBe(0);
  });
});