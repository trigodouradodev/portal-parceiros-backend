import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Usado apenas pelo Prisma CLI (db pull, studio) via prisma.config.ts.
  // Em runtime, a conexão é montada a partir das variáveis DB_* abaixo.
  DATABASE_URL: Joi.string().uri().optional(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(true),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Geocoding (location-check). Opcional: ausente desabilita o endpoint
  // (responde 503), sem impedir o boot da aplicação.
  GOOGLE_MAPS_API_KEY: Joi.string().allow('').optional(),
  // Raio máximo (metros) aceito no location-check. Geocoding raramente atinge
  // 100m em endereço BR; ajuste conforme a precisão observada.
  LOCATION_CHECK_RADIUS_METERS: Joi.number().positive().default(100),
});
