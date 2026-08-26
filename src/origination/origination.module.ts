import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { OriginationController } from './origination.controller';
import { OriginationService } from './origination.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [OriginationController],
  providers: [OriginationService],
})
export class OriginationModule {}
