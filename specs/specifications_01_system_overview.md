# 01. Visión General del Sistema y Arquitectura

## Propósito
El objetivo del proyecto es proporcionar un sistema de notificaciones de cobro en tiempo real para un mostrador comercial (kiosco), emulando la funcionalidad de alerta visual y sonora de plataformas como LlegoPagos. 

El sistema vincula la cuenta de Mercado Pago con una interfaz web en la computadora de cobro, procesando webhooks entrantes, validando su legitimidad, consultando los detalles de la transacción y empujando las notificaciones instantáneas hacia el frontend mediante Server-Sent Events (SSE) o WebSockets.

---

## Diagrama de Flujo de Información

```text
[Cliente paga con QR / Transferencia / Tarjeta]
                        │
                        ▼
            [API de Mercado Pago]
                        │
                        │ 1. POST Webhook (x-signature, x-request-id)
                        ▼
            [Backend: NestJS Gateway]
                        │
                        ├─► Valida firma criptográfica (HMAC-SHA256)
                        ├─► 2. GET /v1/payments/{id} (MP REST API)
                        ├─► Persiste evento en almacenamiento local/DB
                        └─► 3. Emite evento interno (EventEmitter2 / RxJS Subject)
                                        │
                                        │ 4. SSE Stream (GET /api/v1/payments/stream)
                                        ▼
                        [Frontend: Next.js (PC del Kiosco)]
                                        │
                                        ├─► Alerta sonora (Audio API)
                                        ├─► Notificación visual (Overlay / Modal / Toast)
                                        └─► Actualización del listado diario de ventas
```

---

## Componentes del Stack Tecnológico

| Componente | Tecnología | Responsabilidad |
| :--- | :--- | :--- |
| **Backend** | NestJS (TypeScript) | Recepción de Webhooks, validación HMAC, consulta SDK/HTTP MP, broadcast SSE. |
| **Frontend** | Next.js (App Router, TS, Tailwind) | Conexión `EventSource`, reproductor de audio, pantalla de mostrador de alto contraste. |
| **Especificación** | OpenAPI 3.1 & AsyncAPI 3.0 (Markdown/YAML) | Contratos estrictos de datos para desacoplar el desarrollo de back y front. |
| **Túnel Local** | Cloudflare Tunnel / ngrok | Exposición de la URL pública para recibir webhooks de Mercado Pago durante desarrollo. |

---

## Principios Spec-Driven Adoptados
1. **Contrato Único de Datos:** Los tipos del frontend y backend se derivan directamente de las especificaciones OpenAPI y AsyncAPI.
2. **Idempotencia:** El backend rechaza o ignora notificaciones duplicadas de Mercado Pago basándose en el identificador único del pago (`data.id`).
3. **Resiliencia de Conexión:** El canal SSE implementa reconexión automática en el cliente y soporte de `Last-Event-ID` en el servidor.
