import { EventEmitter2 } from '@nestjs/event-emitter';
import { vi } from 'vitest';
import { PaymentsStreamController } from './payments-stream.controller.js';

describe('PaymentsStreamController', () => {
  it('emits payment_received when the approved event is emitted', () => {
    const eventEmitter = new EventEmitter2();
    const controller = new PaymentsStreamController(eventEmitter);
    const received: any[] = [];

    const sub = controller.streamPayments().subscribe((message) => received.push(message));

    eventEmitter.emit('payment.approved', {
      paymentId: '892341829',
      amount: 4500,
      formattedAmount: '$ 4.500,00',
      currency: 'ARS',
      status: 'approved',
      paymentMethod: 'Mercado Pago (Saldo en cuenta / QR)',
      timestamp: new Date().toISOString(),
    });

    expect(received[0].data.event).toBe('payment_received');
    expect(received[0].data.data.paymentId).toBe('892341829');

    sub.unsubscribe();
  });

  it('emits a heartbeat every 30 seconds', () => {
    vi.useFakeTimers();

    const eventEmitter = new EventEmitter2();
    const controller = new PaymentsStreamController(eventEmitter);
    const received: any[] = [];

    const sub = controller.streamPayments().subscribe((message) => received.push(message));

    vi.advanceTimersByTime(30000);

    expect(received.some((message) => message.data.event === 'ping')).toBe(true);

    sub.unsubscribe();
    vi.useRealTimers();
  });
});
