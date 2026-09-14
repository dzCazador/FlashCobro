# 02. Requerimientos Funcionales y No Funcionales

## Requerimientos Funcionales (RF)

### Módulo Webhook e Integración Mercado Pago
- **RF-01 (Recepción de Webhook):** El backend debe exponer un endpoint HTTP POST público para recibir notificaciones automáticas de Mercado Pago (`topic=payment` o `type=payment`).
- **RF-02 (Validación Criptográfica):** Cada webhook entrante debe validar obligatoriamente la cabecera `x-signature` calculando el hash HMAC-SHA256 con la clave secreta provista por Mercado Pago Developers. Si la firma no coincide, se descarta la solicitud con código HTTP 401.
- **RF-03 (Consulta de Detalle):** Al recibir un identificador de pago válido, el backend debe consultar la API oficial de Mercado Pago (`GET /v1/payments/{id}`) para obtener los atributos completos: monto exacto, moneda, estado final, método de cobro y datos del pagador.
- **RF-04 (Filtrado de Estados):** El sistema debe emitir alertas sonoras y visuales únicamente cuando el estado de la transacción sea `approved` (aprobado).
- **RF-05 (Idempotencia y Registro):** Se debe prevenir el procesamiento múltiple de un mismo pago en caso de reintentos de la red de webhooks.

### Módulo Comunicación en Tiempo Real (SSE / WebSocket)
- **RF-06 (Canal de Difusión):** El backend debe proveer un canal de streaming unidireccional (Server-Sent Events) accesible desde la interfaz web.
- **RF-07 (Heartbeat / Keep-Alive):** El servidor debe enviar pings periódicos (cada 30 segundos) para evitar el cierre por timeout de proxies o routers intermedios.

### Módulo Frontend (Pantalla de Mostrador)
- **RF-08 (Alerta Sonora Inmediata):** Al ingresar un evento `payment_received`, el navegador debe reproducir un tono auditivo configurable y distintivo.
- **RF-09 (Alerta Visual de Impacto):** Debe desplegar un cartel o modal emergente de alto contraste que detalle claramente el monto recibido (ej: `$ 4.500,00`) y se oculte tras un lapso o confirmación manual con la tecla espaciadora / clic.
- **RF-10 (Historial de Turno):** La pantalla principal debe mantener una lista actualizada de todos los cobros recibidos durante la sesión actual con su suma total acumulada.
- **RF-11 (Indicador de Estado de Conexión):** Debe mostrar claramente si la conexión en vivo está activa (verde) o desconectada (rojo con reintento automático).

---

## Requerimientos No Funcionales (RNF)

- **RNF-01 (Latencia):** El tiempo total desde que Mercado Pago dispara el webhook hasta que se activa la alerta auditiva y visual en la PC no debe superar los 1200 milisegundos en condiciones normales.
- **RNF-02 (Autonomía de Audio):** Manejar la política de "Autoplay Restriction" de navegadores modernos mediante un botón inicial explícito de "Iniciar Turno / Activar Audio".
- **RNF-03 (Tipado Estricto):** Uso total de TypeScript en modo estricto en ambos lados (NestJS y Next.js), compartiendo interfaces declaradas en la especificación.
- **RNF-04 (Simplicidad Operativa):** Interfaz diseñada para operar con pantalla completa y sin necesidad de usar mouse para descartar avisos.
