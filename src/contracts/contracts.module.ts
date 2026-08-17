import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [CollectionsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
