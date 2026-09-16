import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export type MercadoPagoPaymentDetail = {
  mercadoPagoPaymentId: string;
  amount: number;
  currency: string;
  status: string;
  statusDetail?: string | null;
  paymentMethod?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  timestamp: string;
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  wallet: 'Billetera',
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  bank_transfer: 'Transferencia bancaria',
  atm: 'Cajero',
  ticket: 'Efectivo',
  crypto_transfer: 'Transferencia crypto',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  account_money: 'Saldo en cuenta',
};

function formatPaymentMethod(
  paymentTypeId?: string,
  paymentMethodId?: string,
): string {
  const typeLabel = paymentTypeId
    ? (PAYMENT_TYPE_LABELS[paymentTypeId] ?? paymentTypeId)
    : undefined;
  const methodLabel = paymentMethodId
    ? (PAYMENT_METHOD_LABELS[paymentMethodId] ?? paymentMethodId)
    : undefined;

  if (typeLabel && methodLabel) {
    return `${typeLabel} (${methodLabel})`;
  }

  return typeLabel ?? methodLabel ?? 'Mercado Pago';
}

function mapMercadoPagoPayment(payment: Record<string, any>): MercadoPagoPaymentDetail {
  const payer = payment.payer ?? {};
  const firstName = payer.first_name as string | undefined;
  const lastName = payer.last_name as string | undefined;
  const nickname = payer.nickname as string | undefined;

  const payerName =
    (firstName && lastName && `${firstName} ${lastName}`.trim()) ||
    firstName ||
    lastName ||
    nickname ||
    null;

  return {
    mercadoPagoPaymentId: String(payment.id),
    amount: Number(payment.transaction_amount ?? 0),
    currency: (payment.currency_id as string) ?? 'ARS',
    status: (payment.status as string) ?? 'unknown',
    statusDetail: (payment.status_detail as string) ?? null,
    paymentMethod: formatPaymentMethod(
      payment.payment_type_id as string | undefined,
      payment.payment_method_id as string | undefined,
    ),
    payerName: payerName as string | null,
    payerEmail: (payer.email as string) ?? null,
    timestamp: (payment.date_approved ?? payment.date_created) ?? new Date().toISOString(),
  };
}

@Injectable()
export class MercadoPagoApiService {
  private readonly logger = new Logger(MercadoPagoApiService.name);
  private readonly accessToken = process.env.MP_ACCESS_TOKEN;
  private readonly baseUrl = 'https://api.mercadopago.com';

  async fetchPaymentDetail(
    paymentId: string,
  ): Promise<MercadoPagoPaymentDetail | null> {
    if (!this.accessToken) {
      this.logger.warn(
        'MP_ACCESS_TOKEN no configurado. No se puede consultar el detalle del pago.',
      );
      return null;
    }

    try {
      const { data } = await axios.get(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        timeout: 5000,
      });

      return mapMercadoPagoPayment(data);
    } catch (error) {
      this.logger.error(
        `No se pudo obtener el pago ${paymentId} desde Mercado Pago`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}