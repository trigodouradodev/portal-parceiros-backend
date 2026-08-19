import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

@Module({
  imports: [ScopeModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, QuoteActivityPermissionsService],
  exports: [QuoteActivityPermissionsService],
})
export class ActivitiesModule {}
