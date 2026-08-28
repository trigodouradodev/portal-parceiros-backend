import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { CreateSimulationDto } from './dto/create-simulation.dto';
import { ListSimulationsQueryDto } from './dto/list-simulations-query.dto';
import { SimulationSnapshot } from './interfaces/simulation.interface';
import { SimulationsService } from './simulations.service';

@ApiTags('simulations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('simulations')
export class SimulationsController {
  constructor(private readonly simulationsService: SimulationsService) {}

  @ApiOperation({
    summary: 'Lista as simulações persistidas do parceiro autenticado.',
    description:
      'Filtros opcionais `name` (contains, case-insensitive) e `document` (CPF, só dígitos). Combinam com AND no recorte do parceiro.',
  })
  @ApiOkResponse({ type: [SimulationSnapshot] })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Get()
  listSimulations(
    @CurrentUser('sub') userId: string,
    @Query() query: ListSimulationsQueryDto,
  ) {
    return this.simulationsService.listSimulations(userId, query);
  }

  @ApiOperation({
    summary: 'Cria e persiste uma simulação de cotação do parceiro.',
  })
  @ApiCreatedResponse({ type: SimulationSnapshot })
  @ApiBadRequestResponse({
    description: 'Payload ou regra de negócio inválida.',
  })
  @ApiForbiddenResponse({
    description: 'Fila de cobrança impede simular proposta.',
  })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post()
  createSimulation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSimulationDto,
  ) {
    return this.simulationsService.createSimulation(user, dto);
  }
}
