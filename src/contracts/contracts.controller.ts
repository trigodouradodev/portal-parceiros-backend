import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
import { CollectionDetail } from '../collections/interfaces/collection-detail.interface';
import { ContractDetailQueryDto } from './dto/contract-detail-query.dto';
import { ContractsQueryDto } from './dto/contracts-query.dto';
import { ContractInstallmentsList } from './interfaces/contract-installment.interface';
import { ContractsPage } from './interfaces/contracts-list.interface';
import { ContractsService } from './contracts.service';

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @ApiOperation({
    summary: 'Lista contratos vinculados diretamente ao usuário autenticado.',
  })
  @ApiOkResponse({ type: ContractsPage })
  @RequirePermissions(
    PermissionKey.CONTRACT_VIEW,
    PermissionKey.CONTRACT_VIEW_ALL,
  )
  @Get()
  getContracts(
    @CurrentUser('sub') userId: string,
    @Query() query: ContractsQueryDto,
  ) {
    return this.contractsService.getContracts(userId, query);
  }

  /**
   * AUREA-346: todas as parcelas do contrato com status de exibição (paga /
   * atrasada / vence hoje / a vencer), pra tela de lista de parcelas da
   * Carteira — de lá o consultor escolhe uma parcela real pra ver o detalhe
   * completo (`GET /contracts/:id?installmentNumber=`).
   */
  @ApiOperation({
    summary:
      'Lista as parcelas do contrato com status de exibição (paga/atrasada/vence hoje/a vencer).',
  })
  @ApiOkResponse({ type: ContractInstallmentsList })
  @ApiNotFoundResponse({ description: 'Contrato não encontrado.' })
  @RequirePermissions(
    PermissionKey.CONTRACT_VIEW,
    PermissionKey.CONTRACT_VIEW_ALL,
  )
  @Get(':id/installments')
  getContractInstallments(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contractsService.getContractInstallments(
      { userId: user.sub, permissions: user.permissions },
      id,
    );
  }

  /**
   * AUREA-330: detalhe de contrato pra tela de visualização da Carteira.
   * Resolve a parcela a mostrar no backend (próxima em aberto; sem nenhuma
   * aberta, a última) — o chamador só precisa do contractId.
   *
   * AUREA-346: aceita `installmentNumber` opcional pra pedir uma parcela
   * específica (ex.: escolhida em `GET /contracts/:id/installments`).
   */
  @ApiOperation({
    summary:
      'Detalhe do contrato (Carteira): resolve a parcela mais relevante automaticamente, ou usa a informada em installmentNumber.',
  })
  @ApiOkResponse({ type: CollectionDetail })
  @ApiNotFoundResponse({ description: 'Contrato ou parcela não encontrados.' })
  @RequirePermissions(
    PermissionKey.CONTRACT_VIEW,
    PermissionKey.CONTRACT_VIEW_ALL,
  )
  @Get(':id')
  getContractDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ContractDetailQueryDto,
  ) {
    return this.contractsService.getContractDetail(
      { userId: user.sub, permissions: user.permissions },
      id,
      query.installmentNumber,
    );
  }
}
