import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { BureauConfigService } from './bureau-config.service';
import { BureauService } from './bureau.service';
import { CreditRiskConfigService } from './credit-risk-config.service';

@Module({
  imports: [SystemConfigsModule],
  providers: [BureauConfigService, CreditRiskConfigService, BureauService],
  exports: [BureauService, CreditRiskConfigService],
})
export class BureauModule {}
