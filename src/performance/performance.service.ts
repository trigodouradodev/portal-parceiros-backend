import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mapPerformance, mapPerformanceMonths } from './performance.mapper';
import { PerformanceRepository } from './performance.repository';
import {
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
} from './dto/performance-response.dto';

@Injectable()
export class PerformanceService {
  constructor(private readonly repository: PerformanceRepository) {}

  async getMonths(userId: string): Promise<PerformanceMonthsResponseDto> {
    try {
      return mapPerformanceMonths(await this.repository.findMonths(userId));
    } catch (cause) {
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  async getPerformance(
    userId: string,
    month?: string,
  ): Promise<PerformanceResponseDto> {
    try {
      const row = await this.repository.findPerformance(userId, month);
      if (!row) throw new Error('missing_performance_reference_month');
      return mapPerformance(row);
    } catch (cause) {
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }
}
