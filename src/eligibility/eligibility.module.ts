import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { EligibilityController } from './eligibility.controller';
import { EligibilityService } from './eligibility.service';

@Module({
  imports: [PartiesModule],
  controllers: [EligibilityController],
  providers: [EligibilityService],
})
export class EligibilityModule {}
