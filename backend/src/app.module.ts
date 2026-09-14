import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';

@Module({
  imports: [EventEmitterModule.forRoot(), WebhooksModule, RealtimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
