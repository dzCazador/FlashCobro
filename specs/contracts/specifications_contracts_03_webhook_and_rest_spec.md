# 03. Especificación OpenAPI (REST & Webhooks)

A continuación se detalla la especificación OpenAPI 3.1 de los endpoints implementados en el backend NestJS.

```yaml
openapi: 3.1.0
info:
  title: FlashCobro API
  version: 1.1.0
  description: API backend para recepción de pagos Mercado Pago (webhooks) y transferencias CVU (polling), suministro SSE y consultas al frontend.

paths:
  /api/v1/webhooks/mercadopago:
    post:
      summary: Endpoint receptor de notificaciones de Mercado Pago
      description: |
        Recibe el webhook emitido por Mercado Pago. Si el payload contiene `data.id` y `action`,
        valida la firma HMAC en la cabecera `x-signature`. Si no contiene esos campos, procesa
        como IPN sin validación (legacy). Responde 200 de inmediato.
      parameters:
        - name: x-signature
          in: header
          required: false
          description: Firma criptográfica enviada por Mercado Pago (solo en webhooks firmados).
          schema:
            type: string
            example: "ts=1726315200,v1=9c90b6a22f3c4c8d..."
        - name: x-request-id
          in: header
          required: false
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MercadoPagoWebhookPayload'
      responses:
        '200':
          description: Evento recibido y procesado.
          content:
            application/json:
              schema:
                type: object
                properties:
                  received:
                    type: boolean
                    example: true
        '401':
          description: Firma inválida (solo aplica si el payload es un webhook firmado).

  /api/v1/webhooks/mercadopago:
    get:
      summary: IPN legacy por query string
      description: Endpoint receptor de IPN por GET query (topic=payment&id=...), sin firma.
      parameters:
        - name: id
          in: query
          schema:
            type: string
        - name: 'data.id'
          in: query
          schema:
            type: string
        - name: topic
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Evento recibido.

  /api/v1/payments/history:
    get:
      summary: Historial de pagos persistidos
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 50
            minimum: 1
            maximum: 200
        - name: status
          in: query
          required: false
          description: Filtrar por estado (ej: approved)
          schema:
            type: string
        - name: fromDate
          in: query
          required: false
          description: Fecha de inicio en formato YYYY-MM-DD
          schema:
            type: string
            format: date
        - name: toDate
          in: query
          required: false
          description: Fecha de fin en formato YYYY-MM-DD (inclusive al final del día)
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Pagos ordenados por fecha de creación descendente.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/PaymentDTO'

  /api/v1/payments/summary:
    get:
      summary: Totales diarios de cobros (agrupados por fecha)
      parameters:
        - name: fromDate
          in: query
          required: false
          schema:
            type: string
            format: date
        - name: toDate
          in: query
          required: false
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Array con total y cantidad por día.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/DailyTotalDTO'

components:
  schemas:
    MercadoPagoWebhookPayload:
      type: object
      required:
        - id
        - type
        - date_created
        - api_version
      properties:
        id:
          type: integer
          example: 1029384756
        live_mode:
          type: boolean
          example: true
        type:
          type: string
          example: "payment"
        date_created:
          type: string
          format: date-time
        user_id:
          type: integer
          example: 987654321
        api_version:
          type: string
          example: "v1"
        action:
          type: string
          description: Presente solo en webhooks firmados.
          example: "payment.created"
        data:
          type: object
          properties:
            id:
              type: string
              description: ID del pago. Presente en webhooks firmados y POST IPN.
              example: "892341829"

    PaymentDTO:
      type: object
      required:
        - id
        - mercadoPagoPaymentId
        - amount
        - currency
        - status
        - createdAt
      properties:
        id:
          type: string
          description: ID interno (cuid de Prisma)
          example: "cmu3olxep000kfq0408jqo6gz"
        mercadoPagoPaymentId:
          type: string
          description: ID externo de Mercado Pago (índice único)
          example: "892341829"
        amount:
          type: string
          description: Monto del pago (persistido como string de Prisma Decimal)
          example: "4500"
        currency:
          type: string
          example: "ARS"
        status:
          type: string
          enum: [approved, pending, rejected, refunded]
          example: "approved"
        statusDetail:
          type: string
          nullable: true
          example: "accredited"
        paymentMethod:
          type: string
          nullable: true
          description: Método de pago con label legible (ej: "Transferencia bancaria", "Tarjeta de crédito")
          example: "Transferencia bancaria (cvu)"
        payerName:
          type: string
          nullable: true
          example: null
        payerEmail:
          type: string
          nullable: true
          example: "dz_cazador@hotmail.com"
        createdAt:
          type: string
          format: date-time
          example: "2026-09-16T05:32:32.000Z"
        updatedAt:
          type: string
          format: date-time
          example: "2026-09-16T05:32:34.000Z"

    DailyTotalDTO:
      type: object
      properties:
        date:
          type: string
          format: date
          example: "2026-09-16"
        total:
          type: number
          example: 41
        count:
          type: integer
          example: 2
```
