# FlashCobro

Proyecto full-stack para recibir pagos de Mercado Pago, validar webhooks, emitir eventos internos y mostrar una pantalla de mostrador con SSE.

## Stack

- Backend: NestJS + TypeScript
- Frontend: Next.js + Tailwind CSS
- Realtime: Server-Sent Events (SSE)
- Webhook validation: HMAC SHA256

## Requisitos

- Node.js 20+
- npm
- Una secret de Mercado Pago configurada como `MP_WEBHOOK_SECRET`

## Configuración

### Backend
Crear un archivo `.env` dentro de la carpeta `backend`:

```env
MP_WEBHOOK_SECRET=tu_secret_de_mercado_pago
PORT=3000
```

### Frontend
Crear un archivo `.env.local` dentro de la carpeta `frontend`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
PORT=3001
```

## Ejecutar el proyecto

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## URL de la app

- Backend: http://localhost:3000
- Frontend: http://localhost:3001
- Stream SSE: http://localhost:3000/api/v1/payments/stream

## Probar el webhook

Usar una request POST a:

```http
POST http://localhost:3000/api/v1/webhooks/mercadopago
Content-Type: application/json
x-request-id: test-123
x-signature: ts=1700000000,v1=<hash_generado>
```

Body ejemplo:

```json
{
  "id": "123456",
  "live_mode": false,
  "type": "payment",
  "date_created": "2021-11-01T02:02:02Z",
  "user_id": 80101603,
  "api_version": "v1",
  "action": "payment.updated",
  "data": {
    "id": "123456"
  }
}
```

La firma `v1` se calcula con HMAC-SHA256 sobre:

```text
id:123456;request-id:test-123;ts:1700000000;
```

usando la misma `MP_WEBHOOK_SECRET`.

## Verificar flujo

1. Levantar backend y frontend.
2. Abrir la vista del mostrador en `http://localhost:3001`.
3. Enviar un webhook válido a `POST /api/v1/webhooks/mercadopago`.
4. Confirmar que aparece el evento `payment_received` en el stream SSE.
5. Verificar que el banner verde del pago se muestre y reproduzca el sonido.

## Scripts útiles

```bash
cd backend
npm test
```

```bash
cd frontend
npm run build
```
