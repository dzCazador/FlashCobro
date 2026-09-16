import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validationSchema } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema }),
    EventEmitterModule.forRoot(),
    AuthModule,
    WebhooksModule,
    RealtimeModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
