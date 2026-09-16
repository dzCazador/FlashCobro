import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadoPagoApiService } from './mercadopago-api.service.js';

describe('MercadoPagoApiService', () => {
  const originalToken = process.env.MP_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = 'TEST-ACCESS-TOKEN';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) {
      delete process.env.MP_ACCESS_TOKEN;
      return;
    }
    process.env.MP_ACCESS_TOKEN = originalToken;
  });

  it('maps an approved payment returned by the Mercado Pago API', async () => {
    const mpPayment = {
      id: '892341829',
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 4500.5,
      currency_id: 'ARS',
      payment_type_id: 'wallet',
      payment_method_id: 'account_money',
      payer: {
        first_name: 'Juan',
        last_name: 'Pérez',
        email: 'juan@example.com',
      },
      date_approved: '2026-09-14T10:15:32Z',
    };

    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: mpPayment });
    const service = new MercadoPagoApiService();

    const detail = await service.fetchPaymentDetail('892341829');

    expect(detail).toMatchObject({
      mercadoPagoPaymentId: '892341829',
      amount: 4500.5,
      currency: 'ARS',
      status: 'approved',
      statusDetail: 'accredited',
      paymentMethod: 'Billetera (Saldo en cuenta)',
      payerName: 'Juan Pérez',
      payerEmail: 'juan@example.com',
      timestamp: '2026-09-14T10:15:32Z',
    });
    expect(get).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/892341829',
      expect.objectContaining({
        headers: { Authorization: 'Bearer TEST-ACCESS-TOKEN' },
      }),
    );
  });

  it('returns null when an API error occurs', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('not found'));
    const service = new MercadoPagoApiService();

    await expect(service.fetchPaymentDetail('123')).resolves.toBeNull();
  });

  it('returns null when MP_ACCESS_TOKEN is not configured', async () => {
    delete process.env.MP_ACCESS_TOKEN;
    const service = new MercadoPagoApiService();

    await expect(service.fetchPaymentDetail('123')).resolves.toBeNull();
  });
});