import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { CollectionDetail } from './interfaces/collection-detail.interface';

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

  /**
   * Detalhe de um item da lista: dados do contrato (valor total, início/fim)
   * e da parcela selecionada (valor, vencimento, posição X de Y), mais o
   * histórico de follow-up dessa parcela. Mesmo acesso/scope das listas;
   * contrato fora do escopo ou inexistente → 404.
   */
  @ApiOperation({
    summary: 'Detalhe do contrato/parcela + histórico de follow-up da parcela.',
  })
  @ApiOkResponse({ type: CollectionDetail })
  @ApiNotFoundResponse({ description: 'Contrato ou parcela não encontrados.' })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get(':contractId/installments/:installmentNumber')
  getDetail(
    @CurrentUser() user: JwtPayload,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
  ) {
    return this.collectionsService.getDetail(
      { userId: user.sub, permissions: user.permissions },
      contractId,
      installmentNumber,
    );
  }
}
