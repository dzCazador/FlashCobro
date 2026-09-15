import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [PaymentController],
  providers: [PrismaService, PaymentService],
  exports: [PaymentService],
})
export class PaymentsModule {}
