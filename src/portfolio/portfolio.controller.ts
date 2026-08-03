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
import { PortfolioSummary } from './interfaces/portfolio-summary.interface';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @ApiOperation({
    summary:
      'Resumo da carteira (saldo, contratos, inadimplência e renegociação).',
  })
  @ApiOkResponse({ type: PortfolioSummary })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get('summary')
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.portfolioService.getSummary({
      userId: user.sub,
      permissions: user.permissions,
    });
  }
}
