import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().max(2000).optional(),
  MP_WEBHOOK_SECRET: Joi.string().min(10).required(),
  DATABASE_URL: Joi.string().uri({ scheme: ['mysql', 'mysql2'] }).required(),
  MP_PUBLIC_KEY: Joi.string().optional(),
  MP_ACCESS_TOKEN: Joi.string().optional(),
  MP_POLL_INTERVAL_MS: Joi.number().positive().optional(),
  MP_POLL_WINDOW_SECONDS: Joi.number().positive().optional(),
  MP_BACKFILL_HOURS: Joi.number().positive().optional(),
});