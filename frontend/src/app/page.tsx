'use client';

import { useEffect, useRef, useState } from 'react';

type PaymentPayload = {
  paymentId?: string;
  amount?: number;
  formattedAmount?: string;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  payerName?: string;
  timestamp?: string;
  serverTime?: string;
};

type StreamMessage = {
  event: 'payment_received' | 'ping';
  data: PaymentPayload;
};

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [lastPayment, setLastPayment] = useState<PaymentPayload | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [totalSales, setTotalSales] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    'Sistema listo. Esperando eventos del backend...',
  ]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-9), `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const eventSource = new EventSource(`${apiBaseUrl}/api/v1/payments/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
      appendLog(`SSE conectado a ${apiBaseUrl}/api/v1/payments/stream`);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      appendLog('Error de conexión SSE. Reintentando...');
    };

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamMessage;
      appendLog(`Evento recibido: ${payload.event}`);
      appendLog(`Respuesta del backend: ${JSON.stringify(payload)}`);

      if (payload.event === 'payment_received') {
        const payment = payload.data;
        setLastPayment(payment);
        setShowBanner(true);
        setTotalSales((prev) => prev + Number(payment.amount ?? 0));

        if (audioUnlocked) {
          playCashRegisterTone();
        }
      }
    };

    return () => eventSource.close();
  }, [audioUnlocked]);

  useEffect(() => {
    if (!showBanner) {
      return;
    }

    const timeout = window.setTimeout(() => setShowBanner(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showBanner]);

  const playCashRegisterTone = () => {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor) {
      return;
    }

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(900, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  };

  const enableAudio = async () => {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor) {
      return;
    }

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;
    await context.resume();
    setAudioUnlocked(true);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
              Mostrador
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
              Cobros en vivo
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {!audioUnlocked && (
              <button
                type="button"
                onClick={enableAudio}
                className="rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
              >
                Activar audio
              </button>
            )}

            <div className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}
              />
              <span className={isConnected ? 'text-emerald-300' : 'text-rose-300'}>
                {isConnected ? 'Conectado' : 'Reconectando'}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-200">Turno actual</h2>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                Sesión activa
              </span>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-8 text-center">
              {lastPayment ? (
                <>
                  <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                    Último cobro
                  </p>
                  <p className="mt-4 text-6xl font-black tracking-tight text-white">
                    {lastPayment.formattedAmount ?? `$ ${(Number(lastPayment.amount ?? 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                  <p className="mt-4 text-sm text-slate-300">
                    {lastPayment.paymentMethod ?? 'Mercado Pago'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                    Esperando cobros
                  </p>
                  <p className="mt-4 text-4xl font-bold text-slate-400">
                    $ 0,00
                  </p>
                </>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Total del turno
            </p>
            <p className="mt-4 text-4xl font-black text-emerald-400">
              {new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
              }).format(totalSales)}
            </p>
            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Estado</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {lastPayment?.status ?? 'Esperando'}
              </p>
            </div>
          </aside>
        </section>
      </div>

      <section className="mx-auto mt-6 w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
            Log de depuración
          </h3>
          <span className="text-xs text-slate-400">Últimos 10 eventos</span>
        </div>

        <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200">
          {logs.map((log, index) => (
            <div key={`${log}-${index}`} className="border-b border-slate-800 pb-1 last:border-b-0 last:pb-0">
              {log}
            </div>
          ))}
        </div>
      </section>

      {showBanner && lastPayment && (
        <div className="fixed inset-x-0 top-6 flex justify-center px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-emerald-500/40 bg-emerald-600/95 px-8 py-6 shadow-2xl shadow-emerald-900/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">
                  Pago recibido
                </p>
                <p className="mt-2 text-4xl font-black text-white sm:text-5xl">
                  {lastPayment.formattedAmount ??
                    new Intl.NumberFormat('es-AR', {
                      style: 'currency',
                      currency: lastPayment.currency ?? 'ARS',
                    }).format(Number(lastPayment.amount ?? 0))}
                </p>
              </div>

              <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-emerald-50">
                {lastPayment.paymentMethod ?? 'Mercado Pago'}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
