'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type PaymentPayload = {
  paymentId?: string;
  amount?: number;
  formattedAmount?: string;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  payerName?: string;
  payerEmail?: string;
  timestamp?: string;
  serverTime?: string;
};

type StreamMessage = {
  event: 'payment_received' | 'ping';
  data: PaymentPayload;
};

type PaymentRecord = {
  id: string;
  mercadoPagoPaymentId: string;
  amount: string | number;
  currency: string;
  status: string;
  statusDetail?: string | null;
  paymentMethod?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  createdAt: string;
};

type DailyTotal = {
  date: string;
  total: number;
  count: number;
};

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIEZ_A_VEINTE = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
const DECENAS = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menoresDeCien(n: number): string {
  if (n === 0) {
    return '';
  }
  if (n <= 20) {
    return n <= 9 ? UNIDADES[n] : DIEZ_A_VEINTE[n - 10];
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 2) {
    return u === 0 ? 'veinte' : `veinti${UNIDADES[u]}`;
  }
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function menoresDeMil(n: number): string {
  if (n === 0) {
    return '';
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parteC = c === 0 ? '' : c === 1 ? (r === 0 ? 'cien' : 'ciento') : CENTENAS[c];
  const parteR = menoresDeCien(r);
  if (!parteC) {
    return parteR;
  }
  if (!parteR) {
    return parteC;
  }
  return `${parteC} ${parteR}`;
}

function numeroEnPalabras(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    return String(n);
  }
  if (n === 0) {
    return 'cero';
  }

  const partes: string[] = [];

  const millones = Math.floor(n / 1_000_000);
  let resto = n % 1_000_000;
  if (millones > 0) {
    partes.push(millones === 1 ? 'un millón' : `${numeroEnPalabras(millones)} millones`);
  }

  const miles = Math.floor(resto / 1000);
  resto = resto % 1000;
  if (miles > 0) {
    partes.push(miles === 1 ? 'mil' : `${numeroEnPalabras(miles)} mil`);
  }

  if (resto > 0) {
    partes.push(menoresDeMil(resto));
  }

  return partes.join(' ');
}

function elegirVozEspanol(): SpeechSynthesisVoice | undefined {
  const voces = window.speechSynthesis.getVoices();
  for (const lang of ['es-AR', 'es-ES', 'es-MX', 'es-US', 'es-419']) {
    const voz = voces.find((v) => v.lang === lang);
    if (voz) {
      return voz;
    }
  }
  return voces.find((v) => v.lang.toLowerCase().startsWith('es'));
}

function formatMonto(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

function capitalizePrimera(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function FlashCobroLogo({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-500 shadow-lg shadow-emerald-900/40 light:shadow-emerald-500/30 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-slate-950"
        aria-hidden="true"
      >
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastPayment, setLastPayment] = useState<PaymentPayload | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [cajaDiaria, setCajaDiaria] = useState(0);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return first.toLocaleDateString('en-CA');
  });
  const [toDate, setToDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    'Sistema listo. Esperando eventos del backend...',
  ]);
  const [showLogs, setShowLogs] = useState(false);
  const [isLight, setIsLight] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('flashcobro-theme') === 'light';
  });
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-9), `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  function speakPayment(payment: PaymentPayload) {
    if (!('speechSynthesis' in window)) {
      return;
    }

    const payerName = payment.payerName;
    const payerEmail = payment.payerEmail?.split('@')[0];
    const payer = payerName
      ? ` por ${payerName}`
      : payerEmail
        ? ` de ${payerEmail}`
        : '';
    const amountWords = numeroEnPalabras(Number(payment.amount ?? 0));
    const text = `Pago recibido${payer}, monto ${amountWords} pesos`;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = elegirVozEspanol();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'es-ES';
    }
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }

  function playCashRegisterTone() {
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
  }

  useEffect(() => {
    if (authed !== true) {
      return;
    }

    const eventSource = new EventSource(`${API_BASE_URL}/api/v1/payments/stream`, {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      setIsConnected(true);
      appendLog(`SSE conectado a ${API_BASE_URL}/api/v1/payments/stream`);
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
        setCajaDiaria((prev) => prev + Number(payment.amount ?? 0));

        setPayments((prev) => {
          const record: PaymentRecord = {
            id: `sse-${payment.paymentId}`,
            mercadoPagoPaymentId: payment.paymentId ?? String(Date.now()),
            amount: Number(payment.amount ?? 0),
            currency: payment.currency ?? 'ARS',
            status: payment.status ?? 'approved',
            paymentMethod: payment.paymentMethod ?? null,
            payerName: payment.payerName ?? null,
            payerEmail: payment.payerEmail ?? null,
            createdAt: payment.timestamp ?? new Date().toISOString(),
          };

          if (prev.some((p) => p.mercadoPagoPaymentId === record.mercadoPagoPaymentId)) {
            return prev;
          }

          return [record, ...prev].slice(0, 20);
        });

        if (audioEnabled) {
          playCashRegisterTone();
          window.setTimeout(() => speakPayment(payment), 400);
        }
      }
    };

    return () => eventSource.close();
  }, [audioEnabled, authed]);

  useEffect(() => {
    if (authed !== true) {
      return;
    }

    fetch(`${API_BASE_URL}/api/v1/payments/history?limit=10`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        return res.json() as Promise<PaymentRecord[]>;
      })
      .then((records) => {
        setPayments(records);
      })
      .catch((error: Error) => appendLog(`Error al cargar historial: ${error.message}`));
  }, [authed]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    if (authed !== true) {
      return;
    }
    fetch(`${API_BASE_URL}/api/v1/payments/summary?fromDate=${today}&toDate=${today}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        return res.json() as Promise<DailyTotal[]>;
      })
      .then((totals) => {
        const dayTotal = totals.find((item) => item.date === today);
        setCajaDiaria(dayTotal ? dayTotal.total : 0);
      })
      .catch((error: Error) => appendLog(`Error al cargar caja diaria: ${error.message}`));
  }, [authed]);

  function loadDailyTotals(desde: string = fromDate, hasta: string = toDate) {
    setLoadingTotals(true);
    fetch(`${API_BASE_URL}/api/v1/payments/summary?fromDate=${desde}&toDate=${hasta}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        return res.json() as Promise<DailyTotal[]>;
      })
      .then(setDailyTotals)
      .catch((error: Error) => appendLog(`Error al cargar totales: ${error.message}`))
      .finally(() => setLoadingTotals(false));
  }

  useEffect(() => {
    const now = new Date();
    const desde = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
    const hasta = now.toLocaleDateString('en-CA');
    if (authed !== true) {
      return;
    }
    fetch(`${API_BASE_URL}/api/v1/payments/summary?fromDate=${desde}&toDate=${hasta}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        return res.json() as Promise<DailyTotal[]>;
      })
      .then(setDailyTotals)
      .catch((error: Error) => appendLog(`Error al cargar totales: ${error.message}`));
  }, [authed]);

  useEffect(() => {
    if (!showBanner) {
      return;
    }

    const timeout = window.setTimeout(() => setShowBanner(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showBanner]);

  const unlockAudio = async () => {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor) {
      return;
    }

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;
    await context.resume();

    if ('speechSynthesis' in window) {
      const unlock = new SpeechSynthesisUtterance(' ');
      window.speechSynthesis.speak(unlock);
      window.speechSynthesis.cancel();
    }
  };

  const toggleAudio = () => {
    if (audioEnabled) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setAudioEnabled(false);
      return;
    }
    setAudioEnabled(true);
    void unlockAudio();
  };

  useEffect(() => {
    if (audioEnabled) {
      void unlockAudio();
    }
  }, [audioEnabled]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', isLight);
    window.localStorage.setItem('flashcobro-theme', isLight ? 'light' : 'dark');
  }, [isLight]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/v1/auth/me`, { credentials: 'include' })
      .then((res) => res.json() as Promise<{ authenticated: boolean }>)
      .then(({ authenticated }) => {
        if (!cancelled) {
          setAuthed(authenticated);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });

      if (!res.ok) {
        setLoginError('Credenciales incorrectas');
        return;
      }

      setAuthed(true);
      setLoginUsername('');
      setLoginPassword('');
    } catch {
      setLoginError('No se pudo conectar con el servidor');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    } catch {
      // el logout local no debe fallar por red
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setAuthed(false);
  };

  if (authed !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 light:bg-slate-100 px-6 text-white light:text-slate-900">
        {authed === null ? (
          <div className="animate-pulse text-lg font-semibold text-slate-300 light:text-slate-600">
            Cargando...
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 light:border-slate-200 bg-slate-900 light:bg-white p-8 shadow-2xl shadow-slate-950/40 light:shadow-slate-200/60">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <FlashCobroLogo className="shadow-emerald-900/40" />
              <h1 className="text-2xl font-black tracking-tight text-white light:text-slate-900">
                FlashCobro
              </h1>
              <p className="text-sm text-slate-400 light:text-slate-500">
                Acceso restringido · Ingresá tus credenciales
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <input
                type="text"
                autoComplete="username"
                placeholder="Usuario"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                className="rounded-xl border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-4 py-3 text-sm text-white light:text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 [color-scheme:dark] light:[color-scheme:light]"
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="rounded-xl border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-4 py-3 text-sm text-white light:text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 [color-scheme:dark] light:[color-scheme:light]"
              />
              {loginError && (
                <p className="text-sm font-semibold text-rose-400 light:text-rose-600">
                  {loginError}
                </p>
              )}
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Ingresar
              </button>
            </form>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 light:bg-slate-100 px-6 py-8 text-white light:text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/80 light:bg-white p-6 shadow-2xl shadow-slate-950/40 light:shadow-slate-200/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onDoubleClick={() => setShowLogs((prev) => !prev)}
              title="FlashCobro"
              className="select-none"
            >
              <FlashCobroLogo className="transition-transform hover:scale-105" />
            </button>
            <div>
              <h1 className="mt-1 flex items-baseline gap-2 text-2xl font-black tracking-tight text-white light:text-slate-900 sm:text-3xl">
                FlashCobro
                <span className="text-base font-semibold text-slate-300 light:text-slate-600">
                  · Cobros en vivo
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleAudio}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                audioEnabled
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'border border-slate-600 light:border-slate-300 bg-slate-800 light:bg-slate-100 text-slate-200 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-200'
              }`}
            >
              {audioEnabled ? 'Desactivar Sonido' : 'Activar Sonido'}
            </button>

            <button
              type="button"
              onClick={() => setIsLight((prev) => !prev)}
              title={isLight ? 'Modo nocturno' : 'Modo diurno'}
              aria-label={isLight ? 'Activar modo nocturno' : 'Activar modo diurno'}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 text-slate-200 light:text-slate-700 transition hover:bg-slate-700 light:hover:bg-slate-200"
            >
              {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-10 items-center gap-2 rounded-full border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-4 text-sm font-bold text-slate-200 light:text-slate-700 transition hover:bg-slate-700 light:hover:bg-slate-200"
            >
              <LogOut className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}
              />
              <span className={isConnected ? 'text-emerald-300 light:text-emerald-600' : 'text-rose-300 light:text-rose-600'}>
                {isConnected ? 'Conectado' : 'Reconectando'}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-800 light:border-slate-200 bg-slate-900 light:bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-200 light:text-slate-700">Turno actual</h2>
              <span className="rounded-full border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-300 light:text-slate-600">
                Sesión activa
              </span>
            </div>

            <div className="rounded-2xl border border-slate-700 light:border-slate-300 bg-slate-800/70 light:bg-slate-100 p-8 text-center">
              {lastPayment ? (
                <>
                  <p className="text-sm uppercase tracking-[0.3em] text-emerald-300 light:text-emerald-600">
                    Último cobro
                  </p>
                  <p className="mt-4 text-6xl font-black tracking-tight text-white light:text-slate-900">
                    {lastPayment.formattedAmount ?? `$ ${(Number(lastPayment.amount ?? 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                  <p className="mt-4 text-sm text-slate-300 light:text-slate-600">
                    {lastPayment.paymentMethod ?? 'Mercado Pago'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400 light:text-slate-500">
                    Esperando cobros
                  </p>
                  <p className="mt-4 text-4xl font-bold text-slate-400 light:text-slate-500">
                    $ 0,00
                  </p>
                </>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-800 light:border-slate-200 bg-slate-900 light:bg-white p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 light:text-slate-500">
              Caja Diaria
            </p>
            <p className="mt-4 text-4xl font-black text-emerald-400 light:text-emerald-600">
              {new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
              }).format(cajaDiaria)}
            </p>
            <div className="mt-6 rounded-2xl border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400 light:text-slate-500">Estado</p>
              <p className="mt-2 text-lg font-semibold text-white light:text-slate-900">
                {lastPayment?.status ?? 'Esperando'}
              </p>
            </div>
          </aside>
        </section>
      </div>

      <section className="mx-auto mt-6 w-full max-w-6xl rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/80 light:bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300 light:text-slate-600">
            Últimos cobros
          </h3>
          <span className="text-xs text-slate-400 light:text-slate-500">{payments.length} registros</span>
        </div>

        <div className="max-h-72 overflow-auto rounded-xl border border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-100">
          {payments.length === 0 ? (
            <p className="p-4 text-sm text-slate-400 light:text-slate-500">
              Todavía no hay cobros registrados.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 light:divide-slate-200">
              {payments.map((payment) => (
                <li
                  key={payment.mercadoPagoPaymentId}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                      {payment.payerName ??
                        payment.payerEmail?.split('@')[0] ??
                        'Pago'}
                    </p>
                    <p className="truncate text-xs text-slate-400 light:text-slate-500">
                      {new Date(payment.createdAt).toLocaleString('es-AR')} ·{' '}
                      {payment.paymentMethod ?? 'Mercado Pago'}
                    </p>
                  </div>
                  <p
                    className={`text-lg font-black ${
                      payment.status === 'approved' ? 'text-emerald-400 light:text-emerald-600' : 'text-slate-400 light:text-slate-500'
                    }`}
                  >
                    {formatMonto(Number(payment.amount))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-6xl rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/80 light:bg-white p-4 shadow-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300 light:text-slate-600">
            Totales diarios
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-3 py-1 text-sm text-white light:text-slate-900 [color-scheme:dark] light:[color-scheme:light]"
            />
            <span className="text-slate-400 light:text-slate-500">a</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-800 light:bg-slate-100 px-3 py-1 text-sm text-white light:text-slate-900 [color-scheme:dark] light:[color-scheme:light]"
            />
            <button
              type="button"
              onClick={() => loadDailyTotals()}
              className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Consultar
            </button>
          </div>
        </div>

        <div className="max-h-72 overflow-auto rounded-xl border border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-100">
          {loadingTotals ? (
            <p className="p-4 text-sm text-slate-400 light:text-slate-500">Consultando...</p>
          ) : dailyTotals.length === 0 ? (
            <p className="p-4 text-sm text-slate-400 light:text-slate-500">
              No hay movimientos en el período seleccionado.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 light:divide-slate-200">
              {dailyTotals.map((item) => (
                <li
                  key={item.date}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-white light:text-slate-900">
                      {capitalizePrimera(
                        new Date(`${item.date}T00:00:00`).toLocaleDateString('es-AR', {
                          weekday: 'long',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        }),
                      )}
                    </p>
                    <p className="text-xs text-slate-400 light:text-slate-500">{item.count} cobros</p>
                  </div>
                  <p className="text-lg font-black text-emerald-400 light:text-emerald-600">
                    {formatMonto(item.total)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 text-right text-sm text-slate-300 light:text-slate-600">
          Total del período:{' '}
          <span className="font-black text-emerald-400 light:text-emerald-600">
            {formatMonto(dailyTotals.reduce((acc, item) => acc + item.total, 0))}
          </span>
        </p>
      </section>

      {showLogs && (
      <section className="mx-auto mt-6 w-full max-w-6xl rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/80 light:bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300 light:text-slate-600">
            Log de depuración
          </h3>
          <span className="text-xs text-slate-400 light:text-slate-500">Últimos 10 eventos</span>
        </div>

        <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-100 p-3 font-mono text-xs text-slate-200 light:text-slate-700">
          {logs.map((log, index) => (
            <div key={`${log}-${index}`} className="border-b border-slate-800 light:border-slate-200 pb-1 last:border-b-0 last:pb-0">
              {log}
            </div>
          ))}
        </div>
      </section>
      )}

      {showBanner && lastPayment && (
        <div className="fixed inset-x-0 top-6 flex justify-center px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-emerald-500/40 bg-emerald-600/95 px-8 py-6 shadow-2xl shadow-emerald-900/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">
                  Pago recibido
                </p>
                <p className="mt-2 text-4xl font-black text-white light:text-slate-900 sm:text-5xl">
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
