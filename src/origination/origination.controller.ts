import { Body, Controller, Get, Post } from '@nestjs/common';
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
import { SimulationSnapshot } from './interfaces/simulation.interface';
import { OriginationService } from './origination.service';

@ApiTags('origination')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('origination')
export class OriginationController {
  constructor(private readonly originationService: OriginationService) {}

  @ApiOperation({
    summary: 'Lista as simulações persistidas do parceiro autenticado.',
  })
  @ApiOkResponse({ type: [SimulationSnapshot] })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Get('simulations')
  listSimulations(@CurrentUser('sub') userId: string) {
    return this.originationService.listSimulations(userId);
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
  @Post('simulations')
  createSimulation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSimulationDto,
  ) {
    return this.originationService.createSimulation(user, dto);
  }
}
