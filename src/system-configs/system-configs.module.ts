import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigsService } from './system-configs.service';

@Module({
  imports: [PrismaModule],
  providers: [SystemConfigsService],
  exports: [SystemConfigsService],
})
export class SystemConfigsModule {}
