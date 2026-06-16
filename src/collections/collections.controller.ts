import { Controller, Get, Query } from '@nestjs/common';
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
import { CollectionsService } from './collections.service';
import { OverdueCollectionQueryDto } from './dto/overdue-collection-query.dto';
import { PreventiveCollectionQueryDto } from './dto/preventive-collection-query.dto';
import { OverdueCollectionPage } from './interfaces/overdue-collection.interface';
import { PreventiveCollectionPage } from './interfaces/preventive-collection.interface';

@ApiTags('collections')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * Aba Cobrança: lista paginada de contratos atrasados, do mais atrasado
   * para o menos. Acesso: INSTALLMENT_VIEW ou INSTALLMENT_VIEW_ALL (ROLE_ADMIN
   * por bypass); scope por hierarquia aplicado no service.
   */
  @ApiOperation({
    summary: 'Aba Cobrança: contratos atrasados (mais atrasado primeiro).',
  })
  @ApiOkResponse({ type: OverdueCollectionPage })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get('overdue')
  getOverdue(
    @CurrentUser() user: JwtPayload,
    @Query() query: OverdueCollectionQueryDto,
  ) {
    return this.collectionsService.getOverdue(
      { userId: user.sub, permissions: user.permissions },
      query.page,
      query.limit,
    );
  }

  /**
   * Aba Preventivo: contratos com parcela a vencer nos próximos `withinDays`
   * dias (default 15), do vencimento mais próximo primeiro. Mesmo acesso/scope
   * da Cobrança.
   */
  @ApiOperation({
    summary:
      'Aba Preventivo: contratos a vencer (vencimento mais próximo primeiro).',
  })
  @ApiOkResponse({ type: PreventiveCollectionPage })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get('preventive')
  getPreventive(
    @CurrentUser() user: JwtPayload,
    @Query() query: PreventiveCollectionQueryDto,
  ) {
    return this.collectionsService.getPreventive(
      { userId: user.sub, permissions: user.permissions },
      query.page,
      query.limit,
      query.withinDays,
    );
  }
}
