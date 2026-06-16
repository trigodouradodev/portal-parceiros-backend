import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module';
import { InstallmentsController } from './installments.controller';
import { InstallmentsService } from './installments.service';

@Module({
  imports: [ScopeModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
})
export class InstallmentsModule {}
