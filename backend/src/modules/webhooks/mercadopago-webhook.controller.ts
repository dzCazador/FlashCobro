import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Payment } from '@prisma/client';
import { PaymentService } from '../payments/payment.service.js';
import { MercadoPagoApiService } from './mercadopago-api.service.js';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';

type IncomingBody = {
  id?: string | number;
  action?: string;
  type?: string;
  topic?: string;
  data?: { id?: string | number };
};

type IncomingQuery = {
  id?: string | number;
  'data.id'?: string | number;
  topic?: string;
  type?: string;
};

@Controller('api/v1/webhooks')
export class MercadoPagoWebhookController {
  constructor(
    private readonly securityService: MercadoPagoSecurityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly paymentService: PaymentService,
    private readonly mercadoPagoApi: MercadoPagoApiService,
  ) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Body() body: IncomingBody,
  ): Promise<{ received: boolean }> {
    console.log('[Webhook] Request recibido');

    const dataId = String(body?.data?.id ?? body?.id ?? '');

    if (!dataId) {
      throw new UnauthorizedException('Missing payment data id');
    }

    const isSignedWebhook = Boolean(body?.data?.id) && typeof body?.action === 'string';

    if (isSignedWebhook) {
      this.securityService.validateSignature(xSignature, xRequestId ?? '', dataId);
    }

    return this.processPayment(dataId);
  }

  @Get('mercadopago')
  @HttpCode(HttpStatus.OK)
  async receiveIpnQuery(@Query() query: IncomingQuery): Promise<{ received: boolean }> {
    const dataId = String(query?.['data.id'] ?? query?.id ?? '');

    if (!dataId) {
      return { received: true };
    }

    return this.processPayment(dataId);
  }

  private async processPayment(dataId: string): Promise<{ received: boolean }> {
    const alreadyProcessed = await this.paymentService.findByMercadoPagoId(dataId);

    if (alreadyProcessed) {
      console.log('[Webhook] Pago ya procesado, se ignora (idempotencia):', dataId);
      return { received: true };
    }

    const detail = await this.mercadoPagoApi.fetchPaymentDetail(dataId);

    if (!detail || detail.status !== 'approved') {
      console.log('[Webhook] Pago no aprobado o sin detalle, no se emite alerta:', dataId);
      return { received: true };
    }

    const saved = await this.paymentService.saveApprovedPayment(detail);

    console.log('[Webhook] Pago aprobado persistido:', saved.id);
    this.eventEmitter.emit('payment.approved', toStreamPayload(saved));

    return { received: true };
  }
}

function toStreamPayload(payment: Payment): Record<string, unknown> {
  const amount = Number(payment.amount);

  return {
    paymentId: payment.mercadoPagoPaymentId,
    amount,
    formattedAmount: formatCurrency(amount, payment.currency),
    currency: payment.currency,
    status: payment.status,
    paymentMethod: payment.paymentMethod ?? 'Mercado Pago',
    payerName: payment.payerName ?? null,
    timestamp: payment.createdAt.toISOString(),
  };
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(amount);
}