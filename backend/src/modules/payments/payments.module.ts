import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentController],
  providers: [PrismaService, PaymentService],
  exports: [PaymentService],
})
export class PaymentsModule {}
