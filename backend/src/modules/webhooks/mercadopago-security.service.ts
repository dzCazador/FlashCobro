import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class MercadoPagoSecurityService {
  private readonly secretKey = process.env.MP_WEBHOOK_SECRET;

  validateSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
  ): boolean {
    if (!xSignature || !this.secretKey) {
      throw new UnauthorizedException(
        'Missing signature or secret key configuration',
      );
    }

    const parts = xSignature.split(',').reduce<Record<string, string>>((acc, current) => {
      const [key, value] = current.trim().split('=');
      if (key && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
      throw new UnauthorizedException('Malformed x-signature header');
    }

    const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`;
    const calculatedHash = crypto
      .createHmac('sha256', this.secretKey)
      .update(manifest)
      .digest('hex');

    if (calculatedHash !== v1) {
      throw new UnauthorizedException('Invalid x-signature');
    }

    return true;
  }
}
