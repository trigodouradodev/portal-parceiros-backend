import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { ScopeModule } from '../scope/scope.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [CollectionsModule, ScopeModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
