# 03. Especificación OpenAPI (REST & Webhooks)

A continuación se detalla la especificación OpenAPI 3.1 para el manejo de webhooks entrantes y los endpoints de consulta de pagos y estado de salud.

```yaml
openapi: 3.1.0
info:
  title: Kiosco Payments Core API
  version: 1.0.0
  description: API backend en NestJS para la recepción de pagos vía Mercado Pago y suministro de datos a la terminal Next.js.

paths:
  /api/v1/webhooks/mercadopago:
    post:
      summary: Endpoint receptor de notificaciones de Mercado Pago
      description: |
        Recibe el webhook emitido por Mercado Pago. Valida la firma HMAC incluida en x-signature.
        Responde 200/202 de inmediato para evitar reintentos del emisor.
      parameters:
        - name: x-signature
          in: header
          required: true
          description: Firma criptográfica enviada por Mercado Pago (contiene ts y v1).
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
          description: Evento recibido y validado con éxito.
          content:
            application/json:
              schema:
                type: object
                properties:
                  received:
                    type: boolean
                    example: true
        '401':
          description: Firma inválida o ausente.
        '500':
          description: Error interno de procesamiento.

  /api/v1/payments/history:
    get:
      summary: Listado de pagos aprobados del día
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 50
      responses:
        '200':
          description: Colección de pagos registrados localmente.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/PaymentDTO'

  /api/v1/health:
    get:
      summary: Verificación de estado del servidor
      responses:
        '200':
          description: Servicio saludable.
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "ok"
                  timestamp:
                    type: string
                    format: date-time

components:
  schemas:
    MercadoPagoWebhookPayload:
      type: object
      required:
        - id
        - live_mode
        - type
        - date_created
        - user_id
        - api_version
        - action
        - data
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
          example: "payment.created"
        data:
          type: object
          required:
            - id
          properties:
            id:
              type: string
              example: "892341829"

    PaymentDTO:
      type: object
      required:
        - id
        - amount
        - currencyId
        - status
        - paymentMethodId
        - paymentTypeId
        - createdAt
      properties:
        id:
          type: string
          example: "892341829"
        amount:
          type: number
          format: float
          example: 4500.50
        currencyId:
          type: string
          example: "ARS"
        status:
          type: string
          enum: [approved, pending, rejected, refunded]
          example: "approved"
        statusDetail:
          type: string
          example: "accredited"
        paymentMethodId:
          type: string
          example: "account_money"
        paymentTypeId:
          type: string
          example: "wallet"
        payerEmail:
          type: string
          nullable: true
          example: "cliente@gmail.com"
        payerName:
          type: string
          nullable: true
          example: "Juan Pérez"
        createdAt:
          type: string
          format: date-time
          example: "2026-09-14T10:15:30Z"
```
