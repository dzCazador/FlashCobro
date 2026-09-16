import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { PaymentService } from './payment.service.js';

@UseGuards(AuthGuard)
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

  @Get('summary')
  async getDailyTotals(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.paymentService.getDailyTotals({ fromDate, toDate });
  }
}
