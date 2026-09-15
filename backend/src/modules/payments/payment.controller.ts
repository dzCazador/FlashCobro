import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { PaymentService } from './payment.service.js';

@Controller('api/v1/payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.paymentService.findHistory({
      limit: limit ? Number(limit) : 50,
      status,
      fromDate,
      toDate,
    });
  }
}
