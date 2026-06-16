import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { DashboardService } from './dashboard.service';
import { PortfolioDashboard } from './interfaces/portfolio-dashboard.interface';
import { MonthPerformance } from './interfaces/month-performance.interface';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * KPIs de carteira para o Resumo Home (contratos ativos, vencendo hoje,
   * em atraso e renovações próximas). Acesso: INSTALLMENT_VIEW ou
   * INSTALLMENT_VIEW_ALL (ROLE_ADMIN passa por bypass). O scope por hierarquia
   * é aplicado no service para quem não tem visão global.
   */
  @ApiOperation({ summary: 'Summary cards da Home (KPIs de carteira).' })
  @ApiOkResponse({ type: PortfolioDashboard })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get()
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboard({
      userId: user.sub,
      permissions: user.permissions,
    });
  }

  /**
   * "Meu Desempenho do Mês": originação, taxa média, inadimplência e
   * renovações do mês corrente, no scope de hierarquia do viewer.
   */
  @ApiOperation({
    summary:
      'Meu Desempenho do Mês (originação, taxa, inadimplência, renovações).',
  })
  @ApiOkResponse({ type: MonthPerformance })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get('performance')
  getPerformance(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getMonthPerformance({
      userId: user.sub,
      permissions: user.permissions,
    });
  }
}
