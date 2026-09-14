# 05. Guía Práctica de Implementación (NestJS + Next.js)

## Validación de Firma HMAC en NestJS

Mercado Pago provee en la cabecera `x-signature` dos parámetros separados por coma: `ts` (timestamp) y `v1` (hash resultante).
La firma se genera mediante HMAC-SHA256 con tu **Webhook Secret Key** sobre el manifiesto formado por:
`id:[data.id_o_resource_id];request-id:[x-request-id];ts:[ts];`

Ejemplo de servicio de validación en NestJS:

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
      throw new UnauthorizedException('Missing signature or secret key configuration');
    }

    // Parsear ts y v1
    const parts = xSignature.split(',').reduce((acc, current) => {
      const [key, value] = current.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
      throw new UnauthorizedException('Malformed x-signature header');
    }

    // Construir manifiesto
    const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`;

    // Calcular hash HMAC-SHA256
    const calculatedHash = crypto
      .createHmac('sha256', this.secretKey)
      .update(manifest)
      .digest('hex');

    return calculatedHash === v1;
  }
}
```

---

## Controlador SSE en NestJS

```typescript
import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { Observable, map, merge, interval } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('api/v1/payments')
export class PaymentsStreamController {
  constructor(private eventEmitter: EventEmitter2) {}

  @Sse('stream')
  sendPaymentEvents(): Observable<MessageEvent> {
    const paymentStream = new Observable<any>((observer) => {
      const listener = (data: any) => observer.next(data);
      this.eventEmitter.on('payment.approved', listener);

      return () => {
        this.eventEmitter.removeListener('payment.approved', listener);
      };
    }).pipe(
      map((payment) => ({
        data: {
          event: 'payment_received',
          data: payment,
        },
      } as MessageEvent)),
    );

    const heartbeatStream = interval(30000).pipe(
      map(() => ({
        data: {
          event: 'ping',
          data: { serverTime: new Date().toISOString() },
        },
      } as MessageEvent)),
    );

    return merge(paymentStream, heartbeatStream);
  }
}
```

---

## Cliente SSE en Next.js con Reproducción Sonora

```tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';

interface PaymentNotification {
  paymentId: string;
  amount: number;
  formattedAmount: string;
  status: string;
  timestamp: string;
}

export default function CashierDashboard() {
  const [lastPayment, setLastPayment] = useState<PaymentNotification | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const enableAudio = () => {
    audioRef.current = new Audio('/sounds/cash-register.mp3');
    audioRef.current.play().then(() => {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      setAudioUnlocked(true);
    }).catch(console.error);
  };

  useEffect(() => {
    const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/stream`);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.event === 'payment_received') {
        const paymentData: PaymentNotification = payload.data;
        setLastPayment(paymentData);

        // Reproducir sonido si está habilitado
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(console.error);
        }
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 font-sans">
      <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold">Kiosco Pagos en Vivo</h1>
        <div className="flex items-center gap-4">
          {!audioUnlocked && (
            <button
              onClick={enableAudio}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm"
            >
              🔔 Activar Sonido
            </button>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {isConnected ? '● En Línea' : '○ Reconectando...'}
          </span>
        </div>
      </header>

      <main className="max-w-xl mx-auto text-center mt-12">
        {lastPayment ? (
          <div className="bg-emerald-600/30 border border-emerald-500 p-8 rounded-2xl animate-pulse">
            <p className="text-emerald-400 font-bold uppercase tracking-widest text-sm mb-2">¡Pago Recibido!</p>
            <h2 className="text-6xl font-extrabold text-white mb-4">{lastPayment.formattedAmount}</h2>
            <p className="text-slate-300 text-sm">Operación #{lastPayment.paymentId}</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-2xl text-slate-400">
            <p className="text-lg">Esperando cobros de Mercado Pago...</p>
          </div>
        )}
      </main>
    </div>
  );
}
```
