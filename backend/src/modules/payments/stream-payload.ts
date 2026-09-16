import type { Payment } from '@prisma/client';

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function toStreamPayload(payment: Payment): Record<string, unknown> {
  const amount = Number(payment.amount);

  return {
    paymentId: payment.mercadoPagoPaymentId,
    amount,
    formattedAmount: formatCurrency(amount, payment.currency),
    currency: payment.currency,
    status: payment.status,
    paymentMethod: payment.paymentMethod ?? 'Mercado Pago',
    payerName: payment.payerName ?? null,
    payerEmail: payment.payerEmail ?? null,
    timestamp: payment.createdAt.toISOString(),
  };
}