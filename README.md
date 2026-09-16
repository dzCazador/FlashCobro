# FlashCobro

Pantalla de mostrador para cobros en vivo con Mercado Pago: detecta pagos y **transferencias recibidas a tu CVU** en tiempo real, con alerta sonora y visual.

En vivo: [https://flashcobro.onrender.com](https://flashcobro.onrender.com)

## Funcionalidades

- **Webhooks de Mercado Pago** para pagos integrados (checkout/QR), con validación HMAC-SHA256 (`x-signature`).
- **Polling de transferencias CVU**: las transferencias a cuenta no generan webhook, así que el backend consulta periódicamente `GET /v1/payments/search` y las emite igual que un pago.
- **Backfill al arrancar**: recupera transferencias aprobadas de las últimas N horas y las persiste.
- **Realtime por SSE**: el frontend recibe `payment_received` al instante (stream `/api/v1/payments/stream`, heartbeat cada 30 s).
- **Frontend de mostrador**: banner del último cobro, importe en pesos, narración por voz (activable), modo diurno/nocturno, logo con doble clic para mostrar logs, totales diarios y último historial.
- **Persistencia** en MySQL/Prisma con idempotencia por `mercadoPagoPaymentId`.

## Stack

- Backend: NestJS + TypeScript + Prisma (MySQL) + SSE
- Frontend: Next.js (export estático) + Tailwind v4
- Despliegue: Docker + Render (un solo servicio: el backend sirve el frontend)

## Arquitectura

```
┌──────────────┐   webhook firmado    ┌────────────────────┐
│ Mercado Pago │ ───────────────────▶ │  /api/v1/webhooks  │
└──────────────┘                      └────────┬───────────┘
┌────────────────┐   polling cada 10 s         │ payment.approved
│ /v1/payments/  │ ────────────────────┐       ▼
│ search (CVU)   │   backfill al boot  │  ┌───────────────┐   SSE   ┌─────────┐
└────────────────┘                     └─▶│   PaymentDB   │◀──────▶ │ Frontend│
                                          └───────────────┘  (stream)└─────────┘
```

## Configuración

### Variables de entorno (backend)

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión MySQL (`mysql://user:pass@host:3306/db`) |
| `MP_WEBHOOK_SECRET` | Sí | Secret de la app de Mercado Pago (mín 10 chars) |
| `MP_ACCESS_TOKEN` | No | Token de acceso productivo (necesario para polling/backfill y detalle webhook) |
| `MP_PUBLIC_KEY` | No | Clave pública productiva |
| `MP_POLL_INTERVAL_MS` | No | Intervalo de polling (default `10000`) |
| `MP_POLL_WINDOW_SECONDS` | No | Ventana de búsqueda de cada poll (default `120`) |
| `MP_BACKFILL_HOURS` | No | Horas a recuperar al arrancar (default `24`) |
| `CORS_ORIGINS` | No | Orígenes extra permitidos (separados por coma) |
| `AUTH_USER` / `AUTH_PASSWORD` | No | Credenciales del mostrador (default: `admin` / `admin123`) |
| `AUTH_SECRET` | No | Secret para firmar la sesión (cambiar en producción) |
| `PORT` | No | Puerto del backend (default `3000`) |

Hay dos entornos:

- **Desarrollo**: `backend/.env`
- **Producción**: `backend/.env.prod` — se carga con `npm run start:prod` (`node --env-file-if-exists=.env.prod dist/main`)

## Ejecutar en desarrollo

```bash
# Backend (NestJS, puerto 3000)
cd backend
npm install
npm run start:dev

# Frontend (Next, puerto 3001)
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev
```

O ambos juntos desde la raíz:

```bash
npm install
npm run dev
```

URLs en local:

- Backend + API: http://localhost:3000
- Frontend: http://localhost:3001
- Stream SSE: http://localhost:3000/api/v1/payments/stream

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `POST/GET` | `/api/v1/webhooks/mercadopago` | Recepta webhooks firmados e IPN legacy (**público**) |
| `POST` | `/api/v1/auth/login` | Inicia sesión (cookie httpOnly) — credenciales `admin` / `admin123` |
| `POST` | `/api/v1/auth/logout` | Cierra sesión |
| `GET` | `/api/v1/auth/me` | Estado de la sesión actual |
| `GET` | `/api/v1/payments/stream` | SSE en vivo (**requiere sesión**) |
| `GET` | `/api/v1/payments/history?limit=&status=&fromDate=&toDate=` | Historial persistido (**requiere sesión**) |
| `GET` | `/api/v1/payments/summary?fromDate=&toDate=` | Totales agrupados por día (**requiere sesión**) |

> El acceso a la pantalla y a la API (salvo webhooks) requiere iniciar sesión. Las credenciales por defecto son `admin` / `admin123`; se recomienda cambiarlas con `AUTH_USER`, `AUTH_PASSWORD` y `AUTH_SECRET`.

## Despliegue en Render

Se usa un único servicio con el `Dockerfile` de la raíz (construye el frontend estático y el backend; el backend sirve todo en `/`).

1. Subir el proyecto a GitHub.
2. En Render creá un **Web Service** apuntando al repo:
   - **Environment**: `Docker`
   - **Root Directory**: raíz del repo (vacío)
3. Definí las variables de entorno: `MP_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `DATABASE_URL` (siempre con prefijo `mysql://`), `MP_BACKFILL_HOURS=24`.
4. Al desplegar corre `prisma db push` automáticamente y el backend sirve el frontend.

> Nota: las transferencias a CVU se detectan por polling; no necesitás exponer el webhook en un túnel para probarlas, solo una transferencia real.

## Probar un cobro

1. Abrir la vista del mostrador.
2. Hacer una **transferencia real** (incluso $1) a tu CVU/alias.
3. En ≤10 s aparece el banner, el audio y se persiste el cobro (backfill 24 h recupera las del día).

Para probar el webhook con curl (pagos integrados), enviar el payload firmado a `POST /api/v1/webhooks/mercadopago`:

```bash
curl -X POST "http://localhost:3000/api/v1/webhooks/mercadopago" \
  -H "Content-Type: application/json" \
  -H "x-request-id: test-123" \
  -H "x-signature: ts=1700000000,v1=<hash>" \
  -d '{"action":"payment.created","type":"payment","data":{"id":"123456"}}'
```

La firma `v1` se calcula con HMAC-SHA256 sobre `id:123456;request-id:test-123;ts:1700000000;`.

## Tests

```bash
cd backend
npm run lint        # oxlint
npm test            # unit + integración
npm run test:e2e    # e2e (webhook → DB → SSE, polling con mocks)
```

Los e2e cubren todo el flujo sin base de datos (in-memory): firma válida/inválida, idempotencia, IPN legacy, SSE en vivo, backfill y dedupe del polling.

## Scripts útiles

| Comando | Descripción |
|---|---|
| `npm run dev` (raíz) | Backend + frontend juntos |
| `npm run start:prod` (backend) | Producción con `.env.prod` |
| `npm run build` (frontend) | Export estático a `frontend/out` |
| `docker build -t flashcobro .` (raíz) | Imagen completa para producción |

## Especificación

Los detalles técnicos (requerimientos, contratos OpenAPI, eventos AsyncAPI, guía de implementación) están en [`specs/`](./specs).