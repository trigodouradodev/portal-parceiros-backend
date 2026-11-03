import { Module } from '@nestjs/common';
import { PartnerRestrictionsService } from './partner-restrictions.service';

@Module({
  providers: [PartnerRestrictionsService],
  exports: [PartnerRestrictionsService],
})
export class PartnersModule {}
