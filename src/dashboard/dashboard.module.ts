import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ScopeModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
