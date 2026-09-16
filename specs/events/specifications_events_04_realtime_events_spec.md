# 04. Especificación de Eventos en Tiempo Real (AsyncAPI)

Contrato de transmisión de eventos Server-Sent Events (SSE) hacia el frontend de Next.js.

```yaml
asyncapi: 3.0.0
info:
  title: FlashCobro Realtime Payment Stream
  version: 1.1.0
  description: |
    Canal Server-Sent Events para transmitir pagos confirmados y transferencias recibidas al frontend.
    Cada evento `payment.approved` puede provenir de dos orígenes: webhook (pagos integrados) o
    polling de transferencias CVU. El frontend recibe ambos de forma transparente.

channels:
  paymentNotificationChannel:
    address: /api/v1/payments/stream
    messages:
      paymentReceivedMessage:
        $ref: '#/channels/paymentNotificationChannel/messages/PaymentReceivedMessage'
      heartbeatMessage:
        $ref: '#/channels/paymentNotificationChannel/messages/HeartbeatMessage'

operations:
  subscribeToPaymentNotifications:
    action: receive
    channel:
      $ref: '#/channels/paymentNotificationChannel'
    summary: Suscripción SSE de la PC de cobro para recibir alertas de pagos instantáneos.

components:
  messages:
    PaymentReceivedMessage:
      name: payment_received
      title: Pago Aprobado Notificado
      summary: |
        Emitido al detectar un pago aprobado, sea vía webhook (pagos integrados) o
        polling de transferencias CVU. El backend deduplica automáticamente por mercadoPagoPaymentId.
      payload:
        type: object
        required:
          - event
          - data
        properties:
          event:
            type: string
            const: "payment_received"
          data:
            type: object
            required:
              - paymentId
              - amount
              - formattedAmount
              - currency
              - status
              - paymentMethod
              - timestamp
            properties:
              paymentId:
                type: string
                example: "892341829"
              amount:
                type: number
                example: 4500.00
              formattedAmount:
                type: string
                example: "$ 4.500,00"
              currency:
                type: string
                example: "ARS"
              status:
                type: string
                example: "approved"
              paymentMethod:
                type: string
                example: "Mercado Pago (Saldo en cuenta / QR)"
              payerName:
                type: string
                nullable: true
                example: "Juan Pérez"
              timestamp:
                type: string
                format: date-time
                example: "2026-09-14T10:15:32Z"

    HeartbeatMessage:
      name: ping
      title: Ping de Mantención de Conexión
      payload:
        type: object
        properties:
          event:
            type: string
            const: "ping"
          data:
            type: object
            properties:
              serverTime:
                type: string
                format: date-time
```
