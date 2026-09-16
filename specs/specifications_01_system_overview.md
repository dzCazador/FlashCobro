# 01. Visión General del Sistema y Arquitectura

## Propósito
El objetivo del proyecto es proporcionar un sistema de notificaciones de cobro en tiempo real para un mostrador comercial (kiosco), emulando la funcionalidad de alerta visual y sonora de plataformas como LlegoPagos. 

El sistema vincula la cuenta de Mercado Pago con una interfaz web en la computadora de cobro. Detecta los cobros por dos vías complementarias:

1. **Webhooks entrantes:** pago integrado (checkout, QR, enlace) — Mercado Pago notifica al backend, que valida la firma, consulta el detalle y empuja la alerta al frontend mediante Server-Sent Events (SSE).
2. **Polling de transferencias recibidas (CVU):** las transferencias que llegan a la cuenta/cvu **no generan webhook**; el backend consulta periódicamente la API `/v1/payments/search`, persiste las nuevas (con deduplicación) y emite la misma alerta en tiempo real.

Ambas vías convergen en el mismo evento interno `payment.approved`, que se difunde al frontend por SSE.

---

## Diagrama de Flujo de Información

```text
                       ┌──────────────────────────────────────────────┐
                       │            API de Mercado Pago               │
                       └──────────────┬───────────────┬───────────────┘
                                      │              │
             1. POST Webhook          │              │  2. GET /v1/payments/search
             (pago integrado)         │              │  (polling c/ 10 s - transferencias CVU)
                                      ▼              ▼
                             [Backend: NestJS Gateway]
                                      │
                        ├─► Valida firma HMAC-SHA256 (solo webhook firmado)
                        ├─► 2b. GET /v1/payments/{id} (detalle, solo webhook)
                        ├─► Filtra: status=approved y monto > 0
                        ├─► Deduplica por mercadoPagoPaymentId (DB única vs webhook+polling)
                        ├─► Persiste evento en MySQL (Prisma)
                        ├─► Backfill de arranque: últimas 24 h (configurable)
                        └─► 3. Emite evento interno (EventEmitter2 / RxJS Subject)
                                        │
                                        │ 4. SSE Stream (GET /api/v1/payments/stream)
                                        ▼
                        [Frontend: Next.js (PC del Kiosco)]
                                        │
                                        ├─► Alerta sonora (Audio API) — activa por defecto
                                        ├─► Alerta visual (Overlay / Modal / Toast)
                                        ├─► Modo diurno / nocturno (toggle ☀/☾)
                                        └─► Actualización del listado y caja diaria
```

---

## Componentes del Stack Tecnológico

| Componente | Tecnología | Responsabilidad |
| :--- | :--- | :--- |
| **Backend** | NestJS (TypeScript) | Recepción de Webhooks (firma HMAC), consulta SDK/HTTP MP, **polling de transferencias CVU**, backfill, broadcast SSE. |
| **Frontend** | Next.js (App Router, TS, Tailwind v4) | Conexión `EventSource`, audio por defecto con toggle, pantalla de mostrador de alto contraste, modo diurno/nocturno, logs ocultos (doble clic en logo). |
| **Persistencia** | MySQL (AlwaysData) + Prisma ORM | Histórico de pagos persistido, deduplicación por `mercadoPagoPaymentId`. |
| **Especificación** | OpenAPI 3.1 & AsyncAPI 3.0 (Markdown/YAML) | Contratos estrictos de datos para desacoplar el desarrollo de back y front. |
| **Túnel Local** | Cloudflare Tunnel / ngrok | Exposición de la URL pública para recibir webhooks durante desarrollo (no aplica a transferencias CVU). |

---

## Principios Spec-Driven Adoptados
1. **Contrato Único de Datos:** Los tipos del frontend y backend se derivan directamente de las especificaciones OpenAPI y AsyncAPI.
2. **Idempotencia:** El backend rechaza o ignora notificaciones duplicadas de Mercado Pago basándose en el identificador único del pago (`mercadoPagoPaymentId`), tanto las que vienen por webhook como las detectadas por polling.
3. **Resiliencia de Conexión:** El canal SSE implementa reconexión automática en el cliente y heartbeat cada 30 segundos en el servidor.
4. **Doble vía de captura:** Un mismo evento `payment.approved` aglutina pagos integrados (webhook) y transferencias recibidas (polling), con persistencia y deduplicación compartidas.
