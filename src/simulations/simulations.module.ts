import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CelcoinModule } from '../celcoin/celcoin.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { PartiesModule } from '../parties/parties.module';
import { SimulationsController } from './simulations.controller';
import { SimulationsService } from './simulations.service';

@Module({
  imports: [ActivitiesModule, CelcoinModule, EligibilityModule, PartiesModule],
  controllers: [SimulationsController],
  providers: [SimulationsService],
})
export class SimulationsModule {}
