import { RequireExplicitPermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  GetPerformanceQueryDto,
  GetPerformanceMonthsQueryDto,
} from './dto/get-performance-query.dto';
import {
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
} from './dto/performance-response.dto';

@ApiTags('performance')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({
  description:
    'Sem PERFORMANCE_VIEW ou pessoa fora do escopo permitido na Home.',
})
@ApiBadRequestResponse({ description: 'Parâmetro inválido ou desconhecido.' })
@RequireExplicitPermissions(PermissionKey.PERFORMANCE_VIEW)
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @ApiOperation({
    summary: 'Competências disponíveis da pessoa selecionada.',
  })
  @ApiOkResponse({ type: PerformanceMonthsResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'Fonte Analytics indisponível.',
  })
  @Get('months')
  getMonths(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetPerformanceMonthsQueryDto,
  ) {
    return this.performanceService.getMonths(
      { userId: user.sub, permissions: user.permissions },
      query.partnerId,
    );
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
  getPerformance(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetPerformanceQueryDto,
  ) {
    return this.performanceService.getPerformance(
      { userId: user.sub, permissions: user.permissions },
      query.month,
      query.partnerId,
    );
  }
}
