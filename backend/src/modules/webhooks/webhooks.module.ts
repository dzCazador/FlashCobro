import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller.js';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';

@Module({
  imports: [EventEmitterModule],
  controllers: [MercadoPagoWebhookController],
  providers: [MercadoPagoSecurityService],
})
export class WebhooksModule {}
