import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const useSsl = configService.get<boolean>('database.ssl', true);
    const rejectUnauthorized = configService.get<boolean>(
      'database.sslRejectUnauthorized',
      false,
    );

    const adapter = new PrismaPg({
      host: configService.getOrThrow<string>('database.host'),
      port: configService.get<number>('database.port', 5432),
      user: configService.getOrThrow<string>('database.user'),
      password: configService.getOrThrow<string>('database.password'),
      database: configService.getOrThrow<string>('database.name'),
      ssl: useSsl ? { rejectUnauthorized } : false,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
