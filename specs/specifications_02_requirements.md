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

### Módulo Persistencia y Base de Datos
- **RF-12 (Persistencia Permanente en MySQL):** El backend debe almacenar todos los pagos aprobados en una base de datos relacional MySQL para mantener un histórico confiable y consultar transacciones en el futuro.
- **RF-13 (ORM Prisma):** El acceso a la base de datos debe realizarse mediante Prisma ORM, definiendo el modelo de datos en `schema.prisma` y generando el cliente TypeScript correspondiente.
- **RF-14 (Modelo Relacional):** El sistema debe contar con un modelo relacional de pagos con estructura mínima que incluya identificador interno, identificador externo de Mercado Pago, monto, moneda, estado, método de pago, nombre y correo del pagador, y timestamps de creación y actualización.
- **RF-15 (Migraciones SQL):** El esquema de base de datos debe gestionarse mediante migraciones de Prisma para asegurar consistencia y reproducibilidad del entorno de desarrollo, testing y producción.
- **RF-16 (Idempotencia de Persistencia):** El sistema debe garantizar que un mismo pago externo no se registre más de una vez, mediante una restricción de unicidad sobre el identificador externo del pago y validación previa antes de insertar.
- **RF-17 (Historial de Pagos):** El backend debe exponer un endpoint para consultar pagos persistidos, ordenados por fecha de creación, y permitir obtener el historial completo o filtrado por fecha y estado.

### Modelo Relacional Requerido
- La base de datos debe seguir un enfoque SQL relacional y utilizar MySQL como motor principal.
- La entidad principal será `Payment`.
- La tabla `Payment` debe contener al menos los siguientes campos: `id`, `mercadoPagoPaymentId`, `amount`, `currency`, `status`, `statusDetail`, `paymentMethod`, `payerName`, `payerEmail`, `createdAt`, `updatedAt`.
- Se debe definir un índice único sobre `mercadoPagoPaymentId` para evitar duplicados.
- El almacenamiento debe ser persistente y no efímero.

---

## Requerimientos No Funcionales (RNF)

- **RNF-01 (Latencia):** El tiempo total desde que Mercado Pago dispara el webhook hasta que se activa la alerta auditiva y visual en la PC no debe superar los 1200 milisegundos en condiciones normales.
- **RNF-02 (Autonomía de Audio):** Manejar la política de "Autoplay Restriction" de navegadores modernos mediante un botón inicial explícito de "Iniciar Turno / Activar Audio".
- **RNF-03 (Tipado Estricto):** Uso total de TypeScript en modo estricto en ambos lados (NestJS y Next.js), compartiendo interfaces declaradas en la especificación.
- **RNF-04 (Simplicidad Operativa):** Interfaz diseñada para operar con pantalla completa y sin necesidad de usar mouse para descartar avisos.
- **RNF-05 (ORM y Base de Datos):** La capa de acceso a datos debe implementarse con Prisma ORM conectando a una base de datos MySQL.
- **RNF-06 (Migraciones y Despliegue):** Todo cambio del esquema de datos debe gestionarse a través de migraciones de Prisma y debe estar versionado en el repositorio.
- **RNF-07 (Persistencia Permanente):** Los pagos aprobados deben quedar almacenados en la base de datos para consulta histórica, auditoría y recuperación posterior ante reinicios del servicio.
