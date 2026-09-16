# TODO — Multi-comercio (cada comercio con su login y sus cobros)

Hoy FlashCobro es de un solo mostrador: un `admin`/`admin123` global, una sola cuenta de
Mercado Pago (`MP_ACCESS_TOKEN`), y todos los cobros van a una misma tabla. El objetivo es
que cada comercio se registre/loguee, conecte **su propia cuenta de Mercado Pago**, y vea
**solo sus cobros** (últimos, caja diaria, totales).

> Base actual: `backend` NestJS + Prisma/MySQL, `frontend` Next.js estático servido por el backend.
> Sesión: cookie `flashcobro_session` (HMAC `ts.hmac`). Webhooks firmados con `x-signature` + `x-request-id`.
> Poller: barre `v1/payments/search` cada 10 s con backfill de 24 h al boot. SSE global por `payment.approved`.

## Fase 1 — Modelo de datos

- [ ] Crear modelo `Merchant` en `backend/prisma/schema.prisma`:
  - `id` (cuid), `name`, `email` (único), `passwordHash`, `createdAt`, `updatedAt`.
  - Credenciales MP cifradas: `mpAccessTokenEnc`, `mpPublicKeyEnc`, `mpWebhookSecretEnc` (nullable al crear, se setean en onboarding).
- [ ] Agregar `merchantId` (FK) a `Payment` + índice/único compuesto `[merchantId, mercadoPagoPaymentId]`
  (la idempotencia y el `@unique` actual quedan por comercio).
- [ ] Correr `prisma migrate` + regenerar cliente (`@prisma/client`).

## Fase 2 — Autenticación de comercios (reemplaza admin fijo)

- [ ] `POST /api/v1/auth/register`: crea comercio (nombre, email, password ≥ 8).
- [ ] `POST /api/v1/auth/login` → devuelve la cookie de sesión con `merchantId` en el token (no solo `admin`).
- [ ] `POST /api/v1/auth/logout` y `GET /api/v1/auth/me` → incluir `merchantId` + `name` en la respuesta.
- [ ] Hashear passwords (argon2/bcrypt); anteponer salt; nunca loggear el hash.
- [ ] `AuthGuard`: resolver `req.merchant` desde la sesión (inyectable por `@CurrentMerchant()` decorator).
- [ ] Eliminar credenciales default `admin/admin123` y variables `AUTH_USER`/`AUTH_PASSWORD` en prod
  (dejar solo `AUTH_SECRET` para firmar sesiones; `MP_*` globales del backend desaparecen de la config del show).

## Fase 3 — Aislamiento de datos

- [ ] `PaymentService.findHistory`, `getDailyTotals`, `findByMercadoPagoId`, `saveApprovedPayment`
  reciben `merchantId` y filtran por él (`backend/src/modules/payments/payment.service.ts`).
- [ ] `PaymentController` (`history`/`summary`) usa `req.merchant.id` (no query params del cliente).
- [ ] SSE filtra por comercio (ver Fase 7).

## Fase 4 — Onboarding de Mercado Pago por comercio

- [ ] Endpoints `GET/POST/PUT /api/v1/merchants/me/mercadopago`: guardar `accessToken`, `publicKey`, `webhookSecret`.
- [ ] Cifrar en reposo los 3 valores (AES-256-GCM con `AUTH_SECRET` como clave maestra) — nunca en claro ni en logs.
- [ ] Validación: al guardar, llamar `GET /v1/users/me` con el token y mostrar el nombre de la cuenta conectada.
- [ ] Sección en el frontend para pegar/editar credenciales MP y probar la conexión.

## Fase 5 — Webhooks multi-comercio

- [ ] Nueva ruta por comercio: `POST /api/v1/webhooks/mercadopago/:merchantId`.
  - Resolver comercio por parámetro → usar **su** `mpWebhookSecret` para verificar `x-signature` (+ `x-request-id`).
- [ ] Refactor `MercadoPagoSecurityService.validateSignature(secret, xSignature, xRequestId, dataId)`
  (hoy valida con un solo secret global — `backend/src/modules/webhooks/`).
- [ ] `processPayment`: fetch con el `mpAccessToken` del comercio y guardar con su `merchantId`.
- [ ] Decidir destino de la ruta antigua `/webhooks/mercadopago` (deprecar o 410) y documentar la nueva URL en el onboarding.
- [ ] En Mercado Pago, cada comercio configura su webhook apuntando a `https://<host>/api/v1/webhooks/mercadopago/<su id>`.

## Fase 6 — Polling multi-comercio

- [ ] Sustituir el poller único por un scheduler que itere los comercios activos cada N segundos:
  - usar `mpAccessToken` del comercio para `v1/payments/search`;
  - backfill de 24 h por comercio al boot;
  - dedupe por `[merchantId, mercadoPagoPaymentId]`.
- [ ] Mover la config del poller (`MP_POLL_INTERVAL_MS`, `MP_BACKFILL_HOURS`) a valores de aplicación/por comercio.
- [ ] Manejar comercios sin credenciales (skip) y errores por token inválido (log + estado "conexión MP fallida").
- [ ] Cuidar concurrencia: no duplicar ejecución por comercio (flag de "corriendo" por merchant).

## Fase 6b — Polling condicional (solo si hay cliente conectado)

- [ ] El poller de un comercio consulta Mercado Pago **solo si ese comercio tiene al menos un SSE conectado**
  (bandeja abierta del mostrador), para no consumir cuota ni rate-limit de MP cuando nadie mira.
- [ ] Contador de conexiones SSE por comercio: la 1ª conexión enciende el polling de ese comercio, la última desconexión lo apaga.
- [ ] Mientras no hay clientes conectados, los cobros se registran igual vía **webhook** (persistencia siempre activa);
  el polling condicional queda como respaldo/backfill.
- [ ] Al encenderse por primera vez en el día, correr un backfill (ej. 24 h) que recupere movimientos ocurridos sin nadie conectado.
- [ ] Reconexión del frontend (caída de red) reactiva el polling automáticamente al volver el SSE.

## Fase 7 — SSE por comercio

- [ ] Emitir con tenant: `eventEmitter.emit(`payment.approved.${merchantId}`, payload)`.
- [ ] `PaymentsStreamController` se suscribe solo a `payment.approved.${req.merchant.id}` (filtrado por sesión),
  no al evento global (`backend/src/modules/realtime/payments-stream.controller.ts`).
- [ ] Mantener las credenciales `withCredentials: true` del frontend (ya lo hace).

## Fase 8 — Frontend

- [ ] Screens/auth: pantalla de registro + login de comercio; header con nombre del comercio y "Salir".
- [ ] Mantener la pantalla actual de mostrador (SSE/historial/caja) sin cambios de URLs — el backend ya aísla por sesión.
- [ ] Vista "Mi cuenta / Mercado Pago": conectar credenciales, ver nombre de la cuenta MP conectada, estado del webhook.
- [ ] Si se quiere pruebita local multi-comercio: el seed actual (`backend/scripts/seed-movements.ts`) debe asociar filas a un comercio demo.

## Fase 9 — Seguridad y QA

- [ ] Rate limiting en login/register; política de contraseñas; (opcional) 2FA.
- [ ] Cifrado + rotación de `AUTH_SECRET` documentados; token de sesión con expiración por comercio.
- [ ] Tests:
  - e2e: registro → login → webhook firmado con secret del comercio A → solo A ve el cobro (B no);
  - e2e: history/summary aislados por sesión;
  - unit: cifrado/descifrado de credenciales, SDK de firma por secret.
- [ ] Actualizar specs (`specs/`), `README.md` y `.env.example` (nueva semántica de variables).

## Fase 10 — Ops / deploy

- [ ] En Render se mantiene 1 servicio; los comercios se crean por la UI (sin tocar env por comercio).
- [ ] Monitoreo: log de "conexión MP ok/error" por comercio en el dashboard.
- [ ] (Si crece) considerar una instancia/worker dedicada al polling.

## Decisiones abiertas (definir antes de arrancar)

- [ ] ¿El registro es abierto o por invitación (el dueño crea los comercios)?
- [ ] ¿Plan gratuito/de pago por comercio y límite de cobros?
- [ ] ¿Un comercio puede tener más de una cuenta MP (varios mostradores/cajas)?
- [ ] ¿Base de datos compartida (una MariaDB/MySQL de Render) o una por comercio?