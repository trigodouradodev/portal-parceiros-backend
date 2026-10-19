import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { GetPerformanceQueryDto } from './dto/get-performance-query.dto';
import {
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
} from './dto/performance-response.dto';

// Temporário para validação local. Restaurar user.sub antes de publicar.
const PERFORMANCE_TEST_PARTNER_ID = '2e95c324-bd29-4f42-896c-2c8f0a1e1c94';

@ApiTags('performance')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @ApiOperation({
    summary: 'Competências disponíveis do parceiro autenticado.',
  })
  @ApiOkResponse({ type: PerformanceMonthsResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'Fonte Analytics indisponível.',
  })
  @Get('months')
  getMonths() {
    return this.performanceService.getMonths(PERFORMANCE_TEST_PARTNER_ID);
  }

  @ApiOperation({ summary: 'Nível e indicadores oficiais por competência.' })
  @ApiOkResponse({ type: PerformanceResponseDto })
  @ApiBadRequestResponse({
    description: 'Competência inválida ou parâmetro desconhecido.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Fonte Analytics indisponível.',
  })
  @Get()
  getPerformance(@Query() query: GetPerformanceQueryDto) {
    return this.performanceService.getPerformance(
      PERFORMANCE_TEST_PARTNER_ID,
      query.month,
    );
  }
}
