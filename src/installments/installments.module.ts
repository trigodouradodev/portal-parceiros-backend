import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module';
import { InstallmentsController } from './installments.controller';
import { InstallmentsService } from './installments.service';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

@Module({
  imports: [ScopeModule],
  controllers: [InstallmentsController, CollectionsController],
  providers: [InstallmentsService, CollectionsService],
})
export class InstallmentsModule {}
