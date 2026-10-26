import { ScopeModule } from '../scope/scope.module';
import { Module } from '@nestjs/common';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PerformanceRepository } from './performance.repository';

@Module({
  imports: [ScopeModule],
  controllers: [PerformanceController],
  providers: [PerformanceService, PerformanceRepository],
})
export class PerformanceModule {}
