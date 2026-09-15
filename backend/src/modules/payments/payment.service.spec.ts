import { describe, expect, it, vi } from 'vitest';
import { PaymentService } from './payment.service.js';

describe('PaymentService', () => {
  it('upserts an approved payment and returns the history ordered by creation date', async () => {
    const persistedPayment = {
      id: 'pay_123',
      mercadoPagoPaymentId: '892341829',
      amount: 4500,
      currency: 'ARS',
      status: 'approved',
      statusDetail: 'accredited',
      paymentMethod: 'account_money',
      payerName: 'Lucía Gómez',
      payerEmail: 'lucia@example.com',
      createdAt: new Date('2026-09-14T10:15:30.000Z'),
      updatedAt: new Date('2026-09-14T10:15:30.000Z'),
    };

    const prisma = {
      payment: {
        upsert: vi.fn().mockResolvedValue(persistedPayment),
        findMany: vi.fn().mockResolvedValue([persistedPayment]),
      },
    } as any;

    const service = new PaymentService(prisma);

    const saved = await service.saveApprovedPayment({
      mercadoPagoPaymentId: '892341829',
      amount: 4500,
      currency: 'ARS',
      status: 'approved',
      statusDetail: 'accredited',
      paymentMethod: 'account_money',
      payerName: 'Lucía Gómez',
      payerEmail: 'lucia@example.com',
    });

    expect(saved.mercadoPagoPaymentId).toBe('892341829');
    expect(prisma.payment.upsert).toHaveBeenCalledTimes(1);

    const history = await service.findHistory({ limit: 10 });
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('approved');
  });
});
