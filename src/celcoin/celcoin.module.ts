import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { CelcoinAuthService } from './celcoin-auth.service';
import { CelcoinConfigService } from './celcoin-config.service';
import { CelcoinSimulationService } from './celcoin-simulation.service';

@Module({
  imports: [SystemConfigsModule],
  providers: [
    CelcoinConfigService,
    CelcoinAuthService,
    CelcoinSimulationService,
  ],
  exports: [CelcoinSimulationService],
})
export class CelcoinModule {}
