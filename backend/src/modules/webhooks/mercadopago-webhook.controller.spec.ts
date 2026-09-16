import { EventEmitter2 } from '@nestjs/event-emitter';
import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller.js';

const originalSecret = process.env.MP_WEBHOOK_SECRET;

function buildValidBody(dataId: string) {
  return {
    id: dataId,
    live_mode: false,
    type: 'payment',
    date_created: '2021-11-01T02:02:02Z',
    user_id: 3689035785,
    api_version: 'v1',
    action: 'payment.updated',
    data: { id: dataId },
  };
}

function buildSignature(dataId: string, requestId: string): string {
  const ts = '1726315200';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto
    .createHmac('sha256', 'test-secret')
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function createController({
  fetchDetail,
  findExisting,
  saved,
}: {
  fetchDetail?: ReturnType<typeof vi.fn>;
  findExisting?: ReturnType<typeof vi.fn>;
  saved?: Record<string, unknown>;
} = {}) {
  const eventEmitter = new EventEmitter2();
  const controller = new MercadoPagoWebhookController(
    new MercadoPagoSecurityService(),
    eventEmitter,
    {
      findByMercadoPagoId: findExisting ?? vi.fn().mockResolvedValue(null),
      saveApprovedPayment: vi.fn().mockResolvedValue(saved),
    } as any,
    {
      fetchPaymentDetail: fetchDetail ?? vi.fn(),
    } as any,
  );
  return { controller, eventEmitter };
}

describe('MercadoPagoWebhookController', () => {
  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.MP_WEBHOOK_SECRET;
      return;
    }
    process.env.MP_WEBHOOK_SECRET = originalSecret;
  });

  it('persists and emits only approved payments with the stream payload', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const savedPayment = {
      id: 'pay_1',
      mercadoPagoPaymentId: '892341829',
      amount: 4500,
      currency: 'ARS',
      status: 'approved',
      statusDetail: 'accredited',
      paymentMethod: 'Billetera (Saldo en cuenta)',
      payerName: 'Juan Pérez',
      payerEmail: 'juan@example.com',
      createdAt: new Date('2026-09-14T10:15:30.000Z'),
      updatedAt: new Date('2026-09-14T10:15:30.000Z'),
    };

    const { controller, eventEmitter } = createController({
      fetchDetail: vi.fn().mockResolvedValue({
        mercadoPagoPaymentId: '892341829',
        amount: 4500,
        currency: 'ARS',
        status: 'approved',
        statusDetail: 'accredited',
        paymentMethod: 'Billetera (Saldo en cuenta)',
        payerName: 'Juan Pérez',
        payerEmail: 'juan@example.com',
        timestamp: '2026-09-14T10:15:30.000Z',
      }),
      saved: savedPayment,
    });

    eventEmitter.on('payment.approved', (payload) => emitted.push(payload));

    const response = await controller.receiveWebhook(
      buildSignature('892341829', 'req_1'),
      'req_1',
      buildValidBody('892341829'),
    );

    expect(response).toEqual({ received: true });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].paymentId).toBe('892341829');
    expect(emitted[0].amount).toBe(4500);
    expect(emitted[0].status).toBe('approved');
    expect(emitted[0].formattedAmount).toContain('4.500');
    expect(emitted[0]).toHaveProperty('timestamp');
  });

  it('does not persist or emit when the payment is not approved', async () => {
    const { controller, eventEmitter } = createController({
      fetchDetail: vi.fn().mockResolvedValue({
        mercadoPagoPaymentId: '892341829',
        amount: 100,
        currency: 'ARS',
        status: 'pending',
      }),
    });

    eventEmitter.on('payment.approved', () => {
      throw new Error('No debería emitirse un pago no aprobado');
    });

    const response = await controller.receiveWebhook(
      buildSignature('892341829', 'req_1'),
      'req_1',
      buildValidBody('892341829'),
    );

    expect(response).toEqual({ received: true });
  });

  it('ignores duplicate webhooks for idempotency', async () => {
    const { controller, eventEmitter } = createController({
      findExisting: vi.fn().mockResolvedValue({ id: 'pay_1' }),
    });

    eventEmitter.on('payment.approved', () => {
      throw new Error('No debería emitirse un pago duplicado');
    });

    const response = await controller.receiveWebhook(
      buildSignature('892341829', 'req_1'),
      'req_1',
      buildValidBody('892341829'),
    );

    expect(response).toEqual({ received: true });
  });

  it('processes an unsigned IPN POST payload by payment id', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const savedPayment = {
      id: 'pay_2',
      mercadoPagoPaymentId: '178287230979',
      amount: 4500,
      currency: 'ARS',
      status: 'approved',
      statusDetail: null,
      paymentMethod: 'Billetera (Saldo en cuenta)',
      payerName: null,
      payerEmail: null,
      createdAt: new Date('2026-09-16T01:12:53.000Z'),
      updatedAt: new Date('2026-09-16T01:12:53.000Z'),
    };

    const { controller, eventEmitter } = createController({
      fetchDetail: vi.fn().mockResolvedValue({
        mercadoPagoPaymentId: '178287230979',
        amount: 4500,
        currency: 'ARS',
        status: 'approved',
        paymentMethod: 'Billetera (Saldo en cuenta)',
        timestamp: '2026-09-16T01:12:53.000Z',
      }),
      saved: savedPayment,
    });

    eventEmitter.on('payment.approved', (payload) => emitted.push(payload));

    const response = await controller.receiveWebhook(
      '',
      '',
      { topic: 'payment', id: '178287230979' },
    );

    expect(response).toEqual({ received: true });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].paymentId).toBe('178287230979');
    expect(emitted[0].amount).toBe(4500);
  });

  it('processes an IPN GET query notification', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const savedPayment = {
      id: 'pay_3',
      mercadoPagoPaymentId: '178287230979',
      amount: 4500,
      currency: 'ARS',
      status: 'approved',
      statusDetail: null,
      paymentMethod: 'Billetera (Saldo en cuenta)',
      payerName: null,
      payerEmail: null,
      createdAt: new Date('2026-09-16T01:12:53.000Z'),
      updatedAt: new Date('2026-09-16T01:12:53.000Z'),
    };

    const { controller, eventEmitter } = createController({
      fetchDetail: vi.fn().mockResolvedValue({
        mercadoPagoPaymentId: '178287230979',
        amount: 4500,
        currency: 'ARS',
        status: 'approved',
        paymentMethod: 'Billetera (Saldo en cuenta)',
        timestamp: '2026-09-16T01:12:53.000Z',
      }),
      saved: savedPayment,
    });

    eventEmitter.on('payment.approved', (payload) => emitted.push(payload));

    const response = await controller.receiveIpnQuery({
      topic: 'payment',
      id: '178287230979',
    });

    expect(response).toEqual({ received: true });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].paymentId).toBe('178287230979');
  });

  it('returns received for an IPN GET without a payment id', async () => {
    const { controller } = createController();

    const response = await controller.receiveIpnQuery({ topic: 'payment' });

    expect(response).toEqual({ received: true });
  });
});