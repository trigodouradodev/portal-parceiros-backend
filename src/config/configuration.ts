export interface AppConfig {
  nodeEnv: string;
  port: number;
}

export interface DatabaseConfig {
  url: string;
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
}

export default (): Configuration => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
  database: {
    url: process.env.DATABASE_URL as string,
    host: process.env.DB_HOST as string,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
    name: process.env.DB_NAME as string,
    ssl: process.env.DB_SSL !== 'false',
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
