import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PaymentService } from '../payments/payment.service.js';
import { PrismaService } from '../payments/prisma.service.js';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller.js';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';

@Module({
  imports: [EventEmitterModule],
  controllers: [MercadoPagoWebhookController],
  providers: [MercadoPagoSecurityService, PrismaService, PaymentService],
  exports: [PaymentService],
})
export class WebhooksModule {}
