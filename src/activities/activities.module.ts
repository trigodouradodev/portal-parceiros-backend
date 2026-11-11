import { Module } from '@nestjs/common';
import { FollowUpModule } from '../follow-up/follow-up.module';
import { ScopeModule } from '../scope/scope.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityCollectionGuard } from './activity-collection.guard';
import { ContractPendingActionsService } from './pending-actions/contract-pending-actions.service';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

@Module({
  imports: [ScopeModule, FollowUpModule],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    ActivityCollectionGuard,
    ContractPendingActionsService,
    QuoteActivityPermissionsService,
  ],
  exports: [QuoteActivityPermissionsService],
})
export class ActivitiesModule {}
