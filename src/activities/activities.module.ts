import { Module } from '@nestjs/common';
import { FollowUpModule } from '../follow-up/follow-up.module';
import { ScopeModule } from '../scope/scope.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

@Module({
  imports: [ScopeModule, FollowUpModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, QuoteActivityPermissionsService],
  exports: [QuoteActivityPermissionsService],
})
export class ActivitiesModule {}
