import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsStreamController } from './payments-stream.controller.js';

@Module({
  imports: [EventEmitterModule, AuthModule],
  controllers: [PaymentsStreamController],
})
export class RealtimeModule {}
