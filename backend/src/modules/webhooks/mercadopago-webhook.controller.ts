import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MercadoPagoWebhookPayloadDto } from './mercadopago-webhook.dto.js';
import { MercadoPagoSecurityService } from './mercadopago-security.service.js';

@Controller('api/v1/webhooks')
export class MercadoPagoWebhookController {
  constructor(
    private readonly securityService: MercadoPagoSecurityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  receiveWebhook(
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Body() payload: MercadoPagoWebhookPayloadDto,
  ): { received: boolean } {
    console.log('[Webhook] Request recibido');
    console.log('[Webhook] Headers:', { xSignature, xRequestId });
    console.log('[Webhook] Payload:', payload);

    const dataId = String(payload?.data?.id ?? '');

    if (!dataId) {
      console.log('[Webhook] Error: Missing payment data id');
      throw new UnauthorizedException('Missing payment data id');
    }

    this.securityService.validateSignature(xSignature, xRequestId ?? '', dataId);

    const normalizedPayload = {
      id: payload.id,
      type: payload.type,
      action: payload.action,
      data: payload.data,
      date_created: payload.date_created,
      live_mode: payload.live_mode,
      user_id: payload.user_id,
      api_version: payload.api_version,
    };

    console.log('[Webhook] Emitiendo evento payment.approved:', normalizedPayload);
    this.eventEmitter.emit('payment.approved', normalizedPayload);

    const response = { received: true };
    console.log('[Webhook] Respuesta:', response);
    return response;
  }
}
