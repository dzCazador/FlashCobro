import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentService } from '../payments/payment.service.js';
import { toStreamPayload } from '../payments/stream-payload.js';
import {
  MercadoPagoApiService,
  type MercadoPagoPaymentDetail,
} from './mercadopago-api.service.js';

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_WINDOW_SECONDS = 120;
const DEFAULT_BACKFILL_HOURS = 24;
const BACKFILL_PAGE_SIZE = 50;
const BACKFILL_MAX_PAGES = 10;

@Injectable()
export class MercadoPagoTransferPollerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MercadoPagoTransferPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly api: MercadoPagoApiService,
    private readonly paymentService: PaymentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    void this.backfill().finally(() => {
      const intervalMs = Number(
        process.env.MP_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS,
      );
      this.poll();
      this.timer = setInterval(() => void this.poll(), intervalMs);
      this.timer.unref?.();
    });
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async backfill(): Promise<void> {
    const hours = Number(process.env.MP_BACKFILL_HOURS ?? DEFAULT_BACKFILL_HOURS);
    const end = new Date();
    const begin = new Date(end.getTime() - hours * 3600_000);
    this.logger.log(`Backfill: buscando transferencias de las últimas ${hours}h`);

    let totalPersisted = 0;

    for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
      const transfers = await this.api.searchIncomingTransfers(
        begin,
        end,
        page * BACKFILL_PAGE_SIZE,
        BACKFILL_PAGE_SIZE,
      );

      for (const transfer of transfers) {
        const persisted = await this.handle(transfer);
        if (persisted) {
          totalPersisted++;
        }
      }

      if (transfers.length < BACKFILL_PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(`Backfill completado: ${totalPersisted} transferencias nuevas persistidas`);
  }

  private async poll(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const windowSeconds = Number(
        process.env.MP_POLL_WINDOW_SECONDS ?? DEFAULT_WINDOW_SECONDS,
      );
      const end = new Date();
      const begin = new Date(end.getTime() - windowSeconds * 1000);

      const transfers = await this.api.searchIncomingTransfers(begin, end);
      for (const transfer of transfers) {
        await this.handle(transfer);
      }
    } catch (error) {
      this.logger.error(
        'Error consultando transferencias en Mercado Pago',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async handle(detail: MercadoPagoPaymentDetail): Promise<boolean> {
    if (detail.status !== 'approved') {
      return false;
    }

    const alreadyProcessed = await this.paymentService.findByMercadoPagoId(
      detail.mercadoPagoPaymentId,
    );
    if (alreadyProcessed) {
      return false;
    }

    const saved = await this.paymentService.saveApprovedPayment(detail);
    this.logger.log(
      `Transferencia aprobada persistida: ${saved.mercadoPagoPaymentId} (monto ${saved.amount})`,
    );
    this.eventEmitter.emit('payment.approved', toStreamPayload(saved));
    return true;
  }
}