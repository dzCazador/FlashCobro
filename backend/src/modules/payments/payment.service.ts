import { Injectable } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

export type PaymentRecordInput = {
  mercadoPagoPaymentId: string;
  amount: number;
  currency: string;
  status: string;
  statusDetail?: string | null;
  paymentMethod?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
};

export type PaymentHistoryQuery = {
  limit?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
};

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async saveApprovedPayment(input: PaymentRecordInput): Promise<Payment> {
    const status = input.status ?? 'approved';

    return this.prisma.payment.upsert({
      where: {
        mercadoPagoPaymentId: input.mercadoPagoPaymentId,
      },
      update: {
        amount: input.amount,
        currency: input.currency,
        status,
        statusDetail: input.statusDetail ?? null,
        paymentMethod: input.paymentMethod ?? null,
        payerName: input.payerName ?? null,
        payerEmail: input.payerEmail ?? null,
      },
      create: {
        mercadoPagoPaymentId: input.mercadoPagoPaymentId,
        amount: input.amount,
        currency: input.currency,
        status,
        statusDetail: input.statusDetail ?? null,
        paymentMethod: input.paymentMethod ?? null,
        payerName: input.payerName ?? null,
        payerEmail: input.payerEmail ?? null,
      },
    });
  }

  async findHistory(query: PaymentHistoryQuery = {}): Promise<Payment[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
