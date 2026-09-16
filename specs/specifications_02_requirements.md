# 02. Requerimientos Funcionales y No Funcionales

## Requerimientos Funcionales (RF)

### Módulo Webhook e Integración Mercado Pago
- **RF-01 (Recepción de Webhook):** El backend debe exponer un endpoint HTTP POST público para recibir notificaciones automáticas de Mercado Pago (`topic=payment` o `type=payment`).
- **RF-02 (Validación Criptográfica):** Cada webhook firmado (aquel que trae `data.id` y `action`) debe validar la cabecera `x-signature` calculando el hash HMAC-SHA256 con la clave secreta provista por Mercado Pago Developers. Los webhooks sin firma (IPN legacy: solo `id` o query string) se procesan directamente sin validación.
- **RF-03 (Consulta de Detalle):** Al recibir un identificador de pago válido desde un webhook, el backend debe consultar la API oficial de Mercado Pago (`GET /v1/payments/{id}`) para obtener los atributos completos: monto exacto, moneda, estado final, método de cobro y datos del pagador.
- **RF-04 (Filtrado de Estados):** El sistema debe emitir alertas sonoras y visuales únicamente cuando el estado de la transacción sea `approved` (aprobado).
- **RF-05 (Idempotencia y Registro):** Se debe prevenir el procesamiento múltiple de un mismo pago, ya sea por reintentos del webhook o por un pago detectado simultáneamente por webhook y polling. La deduplicación se realiza sobre `mercadoPagoPaymentId` (índice único en MySQL).

### Módulo Polling de Transferencias CVU
- **RF-18 (Polling Periódico de Transferencias):** Las transferencias recibidas a la cuenta/cvu de Mercado Pago **no generan webhook**. El backend debe consultar periódicamente la API `GET /v1/payments/search` (rango de fechas, `status=approved`) para detectar transferencias entrantes y agregarlas al mismo flujo de notificación que los pagos por webhook.
- **RF-19 (Configuración del Intervalo):** El intervalo de polling (`MP_POLL_INTERVAL_MS`, default 10 000 ms) y la ventana de búsqueda (`MP_POLL_WINDOW_SECONDS`, default 120 s) deben ser configurables vía variables de entorno.
- **RF-20 (Filtrado de Transferencias):** El polling solo debe capturar pagos con `operation_type` en `('account_fund', 'money_transfer')` y `payment_type_id` en `('bank_transfer', 'account_money')`, descartando inversiones, pagos con tarjeta y movimientos de salida.
- **RF-21 (Backfill de Arranque):** Al iniciar el backend, se debe ejecutar una consulta única y paginada (últimas `MP_BACKFILL_HOURS` horas, default 24, máximo 500 registros) para recuperar transferencias que ocurrieron mientras el servicio estaba apagado y que no fueron capturadas. Los pagos ya existentes en la DB se omiten (deduplicación).

### Módulo Comunicación en Tiempo Real (SSE)
- **RF-06 (Canal de Difusión):** El backend debe proveer un canal de streaming Server-Sent Events (SSE) accesible desde la interfaz web en `GET /api/v1/payments/stream`.
- **RF-07 (Heartbeat / Keep-Alive):** El servidor debe enviar pings periódicos (`ping`) cada 30 segundos para evitar el cierre por timeout de proxies o routers intermedios.

### Módulo Frontend (Pantalla de Mostrador)
- **RF-08 (Alerta Sonora):** Al recibir un evento `payment_received`, el navegador debe reproducir un tono auditivo distintivo. El audio está **habilitado por defecto** al cargar la página (con desbloqueo automático en el primer gesto del usuario).
- **RF-09 (Control de Audio):** Debe haber un botón visible de toggle "Activar Sonido" / "Desactivar Sonido" que permita al usuario silenciar o reactivar el audio en cualquier momento.
- **RF-10 (Alerta Visual de Impacto):** Debe desplegar un cartel emergente de alto contraste que detalle el monto recibido y se oculte automáticamente tras 5 segundos.
- **RF-11 (Historial de Turno):** La pantalla principal debe mantener una lista actualizada de todos los cobros recibidos durante la sesión actual con su suma total acumulada.
- **RF-12 (Totales Diarios):** Debe haber una sección consultable por rango de fechas que muestre el total y cantidad de cobros por día.
- **RF-13 (Indicador de Estado de Conexión):** Debe mostrar claramente si la conexión SSE está activa (verde) o desconectada (rojo con reintento automático).
- **RF-14 (Modo Diurno/Nocturno):** Debe incluir un botón toggle (☾ / ☀) que cambie entre tema oscuro (default) y tema claro, persistiendo la preferencia del usuario en `localStorage`.
- **RF-15 (Logo y Marca):** La interfaz debe mostrar el logo de FlashCobro (rayo SVG con gradiente amber→emerald) en el header junto con el nombre "FlashCobro · Cobros en vivo". El título de la pestaña debe ser "FlashCobro".
- **RF-16 (Logs de Depuración):** La sección de logs del sistema debe estar **oculta por defecto** y mostrarse solo al hacer doble clic en el logo de FlashCobro. Se muestra/oculta alternadamente.
- **RF-17 (Narración de Pagos):** Al recibir un pago, si el audio está activo, el navegador debe narrar en voz sintetizada: "Pago recibido por [nombre], monto [importe en palabras] pesos".

### Módulo Persistencia y Base de Datos
- **RF-22 (Persistencia en MySQL):** El backend debe almacenar todos los pagos aprobados (tanto vía webhook como polling) en una base de datos MySQL, deduplicando por `mercadoPagoPaymentId` antes de insertar.
- **RF-23 (ORM Prisma):** El acceso a la base de datos debe realizarse mediante Prisma ORM, definiendo el modelo `Payment` en `schema.prisma`.
- **RF-24 (Modelo Relacional):** La tabla `Payment` debe contener: `id` (cuid), `mercadoPagoPaymentId` (único), `amount` (Decimal), `currency`, `status`, `statusDetail`, `paymentMethod`, `payerName`, `payerEmail`, `createdAt`, `updatedAt`.
- **RF-25 (Migraciones SQL):** El esquema debe gestionarse mediante migraciones de Prisma.
- **RF-26 (Consultas):** El backend debe exponer `GET /api/v1/payments/history` (con filtros `limit`, `status`, `fromDate`, `toDate`) y `GET /api/v1/payments/summary` (agrupación diaria por rango).

### Módulo Entorno y Producción
- **RF-27 (Archivo .env.prod):** El backend debe cargar el archivo `.env.prod` en arranque usando `node --env-file-if-exists=.env.prod dist/main`. Este archivo debe contener las credenciales de producción reales (`MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `DATABASE_URL`).
- **RF-28 (Separación de Credenciales):** Las variables de entorno `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` son opcionales en validación pero requeridas en producción para el polling. El entorno de desarrollo usa las credenciales `.env` de forma transparente.

---

## Requerimientos No Funcionales (RNF)

- **RNF-01 (Latencia Webhook):** El tiempo total desde que Mercado Pago dispara el webhook hasta que se activa la alerta en la PC no debe superar los 1200 ms.
- **RNF-02 (Latencia Transferencias):** Para transferencias detectadas por polling, la latencia máxima es el intervalo de poll más el tiempo de procesamiento: ≤ `MP_POLL_INTERVAL_MS` + 2 s.
- **RNF-03 (Autonomía de Audio):** El audio se desbloquea automáticamente en el primer gesto del usuario tras cargar la página. Si falla, un botón toggle permite activarlo manualmente en cualquier momento.
- **RNF-04 (Tipado Estricto):** Uso total de TypeScript en modo estricto en ambos lados (NestJS y Next.js).
- **RNF-05 (Simplicidad Operativa):** Interfaz diseñada para pantalla completa sin necesidad de mouse para descartar avisos.
- **RNF-06 (ORM y Base de Datos):** Capa de acceso implementada con Prisma ORM conectando a MySQL.
- **RNF-07 (Persistencia Permanente):** Los pagos aprobados quedan almacenados en la base de datos para consulta histórica y recuperación tras reinicios.
- **RNF-08 (Configuración Polling):** Las variables `MP_POLL_INTERVAL_MS`, `MP_POLL_WINDOW_SECONDS` y `MP_BACKFILL_HOURS` son opcionales y validadas con Joi; valores por defecto razonables (10 s, 120 s, 24 h).
