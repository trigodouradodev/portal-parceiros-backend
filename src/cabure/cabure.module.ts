import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { CabureAuthService } from './cabure-auth.service';
import { CabureConfigService } from './cabure-config.service';
import { CabureService } from './cabure.service';

@Module({
  imports: [SystemConfigsModule],
  providers: [CabureConfigService, CabureAuthService, CabureService],
  exports: [CabureService],
})
export class CabureModule {}
