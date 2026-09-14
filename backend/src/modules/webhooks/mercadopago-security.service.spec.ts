import { UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';

describe('MercadoPagoSecurityService', () => {
  const originalSecret = process.env.MP_WEBHOOK_SECRET;

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

  it('accepts a valid HMAC signature', () => {
    const dataId = '892341829';
    const requestId = 'req_123';
    const ts = '1726315200';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', 'test-secret').update(manifest).digest('hex');

    const service = new MercadoPagoSecurityService();

    expect(service.validateSignature(`ts=${ts},v1=${v1}`, requestId, dataId)).toBe(true);
  });

  it('rejects malformed or mismatched signatures', () => {
    const service = new MercadoPagoSecurityService();

    expect(() => service.validateSignature('ts=1726315200,v1=invalid', 'req_123', '892341829')).toThrow(
      UnauthorizedException,
    );
  });
});
