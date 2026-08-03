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
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ContractsQueryDto } from './dto/contracts-query.dto';
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
}
