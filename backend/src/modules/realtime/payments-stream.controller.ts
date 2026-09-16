import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, interval, map, merge } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard.js';

@UseGuards(AuthGuard)
@Controller()
export class PaymentsStreamController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Sse('api/v1/payments/stream')
  streamPayments(): Observable<MessageEvent> {
    const paymentStream = new Observable<MessageEvent>((observer) => {
      const listener = (payload: any) => {
        observer.next({
          data: {
            event: 'payment_received',
            data: payload,
          },
        } as MessageEvent);
      };

      this.eventEmitter.on('payment.approved', listener);

      return () => {
        this.eventEmitter.removeListener('payment.approved', listener);
      };
    });

    const heartbeatStream = interval(30000).pipe(
      map(() => ({
        data: {
          event: 'ping',
          data: {
            serverTime: new Date().toISOString(),
          },
        },
      } as MessageEvent)),
    );

    return merge(paymentStream, heartbeatStream);
  }
}
