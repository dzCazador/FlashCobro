# 05. Guía Práctica de Implementación (NestJS + Next.js)

## 1. Producción y Carga de `.env.prod`

El script `start:prod` en `package.json` carga las credenciales de producción reales al arrancar:

```json
"start:prod": "node --env-file-if-exists=.env.prod dist/main"
```

El archivo `.env.prod` contiene:

```env
NODE_ENV=production
PORT=3000
MP_WEBHOOK_SECRET=<secret_real>
MP_ACCESS_TOKEN=APP_USR-<token_real>
MP_PUBLIC_KEY=APP_USR-<clave_publica_real>
DATABASE_URL="mysql://usuario:pass@host:3306/dzcazador_flashcobro"
MP_POLL_INTERVAL_MS=10000
MP_POLL_WINDOW_SECONDS=120
MP_BACKFILL_HOURS=24
```

Las variables `MP_POLL_INTERVAL_MS`, `MP_POLL_WINDOW_SECONDS` y `MP_BACKFILL_HOURS` son opcionales (Joi las valida como `number().positive().optional()`) y tienen valores por defecto razonables. El archivo `.env` se mantiene para desarrollo local con credenciales de prueba.

---

## 2. Validación de Firma HMAC en NestJS

Mercado Pago envía en `x-signature` los parámetros `ts` y `v1`. El manifiesto para validar es:
`id:[data.id];request-id:[x-request-id];ts:[ts];`

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class MercadoPagoSecurityService {
  private readonly secretKey = process.env.MP_WEBHOOK_SECRET;

  validateSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
  ): boolean {
    if (!xSignature || !this.secretKey) {
      throw new UnauthorizedException('Missing signature or secret key');
    }

    const parts = xSignature.split(',').reduce((acc, current) => {
      const [key, value] = current.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) throw new UnauthorizedException('Malformed x-signature');

    const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`;
    const calculated = crypto
      .createHmac('sha256', this.secretKey)
      .update(manifest)
      .digest('hex');

    return calculated === v1;
  }
}
```

El controller solo ejecuta esta validación si el payload contiene `data.id` y `action` (webhooks firmados). Los IPN sin firma (GET query con `topic=payment`) se procesan directamente.

---

## 3. Polling de Transferencias CVU (sin webhook)

Las transferencias a la cuenta/cvu no generan notificación webhook de Mercado Pago. El servicio `MercadoPagoTransferPollerService` consulta periódicamente la API de pagos:

```typescript
// mercadopago-transfer-poller.service.ts
@Injectable()
export class MercadoPagoTransferPollerService
  implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly api: MercadoPagoApiService,
    private readonly paymentService: PaymentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    void this.backfill().finally(() => {
      const intervalMs = Number(process.env.MP_POLL_INTERVAL_MS ?? 10_000);
      this.poll();
      this.timer = setInterval(() => void this.poll(), intervalMs);
      this.timer.unref?.();
    });
  }

  private async backfill(): Promise<void> {
    const hours = Number(process.env.MP_BACKFILL_HOURS ?? 24);
    const end = new Date();
    const begin = new Date(end.getTime() - hours * 3_600_000);
    let totalPersisted = 0;
    for (let page = 0; page < 10; page++) {
      const transfers = await this.api.searchIncomingTransfers(begin, end, page * 50, 50);
      for (const t of transfers) {
        if (await this.handle(t)) totalPersisted++;
      }
      if (transfers.length < 50) break;
    }
    this.logger.log(`Backfill completado: ${totalPersisted} nuevas`);
  }

  private async poll(): Promise<void> { /* ... similar a backfill con window más corta */ }

  private async handle(detail: MercadoPagoPaymentDetail): Promise<boolean> {
    if (detail.status !== 'approved') return false;
    if (await this.paymentService.findByMercadoPagoId(detail.mercadoPagoPaymentId)) return false;
    const saved = await this.paymentService.saveApprovedPayment(detail);
    this.eventEmitter.emit('payment.approved', toStreamPayload(saved));
    return true;
  }
}
```

El método `searchIncomingTransfers` filtra resultados de `/v1/payments/search`:

```typescript
// Dentro de MercadoPagoApiService
async searchIncomingTransfers(begin: Date, end: Date, offset = 0, limit = 50) {
  const { data } = await axios.get(`${this.baseUrl}/v1/payments/search`, {
    headers: { Authorization: `Bearer ${this.accessToken}` },
    params: {
      status: 'approved',
      sort: 'date_created',
      criteria: 'desc',
      limit, offset,
      range: 'date_created',
      begin_date: begin.toISOString(),
      end_date: end.toISOString(),
    },
  });
  return (data?.results ?? [])
    .filter((p: any) =>
      Number(p.transaction_amount ?? 0) > 0 &&
      ['account_fund', 'money_transfer'].includes(p.operation_type) &&
      ['bank_transfer', 'account_money'].includes(p.payment_type_id),
    )
    .map(mapMercadoPagoPayment);
}
```

---

## 4. Controlador SSE

```typescript
import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, interval, map, merge } from 'rxjs';

@Controller()
export class PaymentsStreamController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Sse('api/v1/payments/stream')
  streamPayments(): Observable<MessageEvent> {
    const paymentStream = new Observable<MessageEvent>((observer) => {
      const listener = (payload: any) => {
        observer.next({
          data: { event: 'payment_received', data: payload },
        } as MessageEvent);
      };
      this.eventEmitter.on('payment.approved', listener);
      return () => this.eventEmitter.removeListener('payment.approved', listener);
    });

    const heartbeatStream = interval(30_000).pipe(
      map(() => ({
        data: { event: 'ping', data: { serverTime: new Date().toISOString() } },
      } as MessageEvent)),
    );

    return merge(paymentStream, heartbeatStream);
  }
}
```

---

## 5. Frontend: Pantalla de Mostrador

### Características implementadas

- **Audio activo por defecto**: el estado `audioEnabled` arranca en `true`. Al cargar la página, un `useEffect` intenta reanudar el `AudioContext` y desbloquear `speechSynthesis`. Si el navegador lo bloquea, el botón toggle permite activarlo manualmente.
- **Toggle "Activar/Desactivar Sonido"**: botón en el header; alterna entre estado activo (fondo ámbar) e inactivo (borde gris).
- **Modo diurno/nocturno**: botón luna/sol en el header; aplica la clase `.light` al `<html>` usando la variante personalizada `@custom-variant light` de Tailwind v4; persiste la preferencia en `localStorage` (`flashcobro-theme`); default nocturno.
- **Logo FlashCobro**: rayo SVG con gradiente amber→esmeralda en el header; doble clic en el logo muestra/oculta la sección de logs.
- **Logs ocultos por defecto**: la sección de debug (`showLogs=false`) solo se renderiza si el usuario hizo doble clic en el logo.
- **Narración de pagos**: voz sintetizada (`SpeechSynthesisUtterance`) anuncia "Pago recibido por [nombre], monto [importe en palabras] pesos" tras cada cobro con audio activo.

### Componente principal (simplificado)

```tsx
'use client';
import { useEffect, useState, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function Home() {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isLight, setIsLight] = useState(() => {
    return window?.localStorage.getItem('flashcobro-theme') === 'light';
  });
  const [showLogs, setShowLogs] = useState(false);

  // Aplicar tema
  useEffect(() => {
    document.documentElement.classList.toggle('light', isLight);
    localStorage.setItem('flashcobro-theme', isLight ? 'light' : 'dark');
  }, [isLight]);

  // Desbloquear audio al montar
  useEffect(() => {
    if (!audioEnabled) return;
    const ctx = new AudioContext();
    ctx.resume();
    const u = new SpeechSynthesisUtterance(' ');
    speechSynthesis.speak(u);
    speechSynthesis.cancel();
  }, [audioEnabled]);

  // Conexión SSE
  useEffect(() => {
    const src = new EventSource('/api/v1/payments/stream');
    src.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'payment_received') {
        // mostrar banner, reproducir sonido, narrar
      }
    };
    return () => src.close();
  }, [audioEnabled]);

  return (
    <main className="min-h-screen bg-slate-950 light:bg-slate-100 ...">
      <header>
        {/* Logo doble clic → showLogs */}
        <button onDoubleClick={() => setShowLogs(prev => !prev)}>
          <FlashCobroLogo />
        </button>
        <h1>FlashCobro · Cobros en vivo</h1>

        <button onClick={() => setAudioEnabled(prev => !prev)}>
          {audioEnabled ? 'Desactivar Sonido' : 'Activar Sonido'}
        </button>
        <button onClick={() => setIsLight(prev => !prev)}>
          {isLight ? <Sun /> : <Moon />}
        </button>
      </header>

      {/* Turno actual / último cobro */}
      {/* Caja diaria */}
      {/* Últimos cobros (lista) */}
      {/* Totales diarios (por rango de fechas) */}

      {showLogs && (
        <section className="...">Log de depuración</section>
      )}

      {showBanner && lastPayment && <Banner ... />}
    </main>
  );
}
```
