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

export type DailyTotal = {
  date: string;
  total: number;
  count: number;
};

function buildCreatedAtRange(fromDate?: string, toDate?: string): object {
  const range: { gte?: Date; lte?: Date } = {};

  if (fromDate) {
    range.gte = new Date(`${fromDate}T00:00:00`);
  }
  if (toDate) {
    range.lte = new Date(`${toDate}T23:59:59.999`);
  }

  return range;
}

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

  async findByMercadoPagoId(
    mercadoPagoPaymentId: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { mercadoPagoPaymentId },
    });
  }

  async findHistory(query: PaymentHistoryQuery = {}): Promise<Payment[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? { createdAt: buildCreatedAtRange(query.fromDate, query.toDate) }
        : {}),
    };

    return this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getDailyTotals(query: { fromDate?: string; toDate?: string } = {}): Promise<DailyTotal[]> {
    const where =
      query.fromDate || query.toDate
        ? { createdAt: buildCreatedAtRange(query.fromDate, query.toDate) }
        : {};

    const payments = await this.prisma.payment.findMany({
      where,
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const totals = new Map<string, { total: number; count: number }>();

    for (const payment of payments) {
      const date = payment.createdAt.toLocaleDateString('en-CA');
      const entry = totals.get(date) ?? { total: 0, count: 0 };
      entry.total += Number(payment.amount);
      entry.count += 1;
      totals.set(date, entry);
    }

    return [...totals.entries()]
      .map(([date, { total, count }]) => ({
        date,
        total: Math.round(total * 100) / 100,
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
