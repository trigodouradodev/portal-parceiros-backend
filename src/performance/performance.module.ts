import { Module } from '@nestjs/common';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PerformanceRepository } from './performance.repository';

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService, PerformanceRepository],
})
export class PerformanceModule {}
