import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PaymentsStreamController } from './payments-stream.controller.js';

@Module({
  imports: [EventEmitterModule],
  controllers: [PaymentsStreamController],
})
export class RealtimeModule {}
