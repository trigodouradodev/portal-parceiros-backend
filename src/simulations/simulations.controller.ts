import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireExplicitPermissions,
  RequirePermissions,
} from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ListSimulationsQueryDto } from './dto/list-simulations-query.dto';
import { SimulateDto } from './dto/simulate.dto';
import { SimulationSnapshot } from './interfaces/simulation.interface';
import { SimulateResult } from './interfaces/simulate-result.interface';
import { SimulationsService } from './simulations.service';

@ApiTags('simulations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@RequireExplicitPermissions(PermissionKey.QUOTE_NEW_ORIGINATION_FLOW)
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
    summary: 'Avalia, calcula e persiste uma simulação em uma única operação.',
    description:
      'Sem simulationId cria uma simulação; com simulationId atualiza a simulação do parceiro. Clientes inelegíveis não acionam a Celcoin nem geram persistência.',
  })
  @ApiOkResponse({ type: SimulateResult })
  @ApiBadRequestResponse({
    description: 'Payload ou regra de negócio inválida.',
  })
  @ApiForbiddenResponse({
    description: 'Fila de cobrança impede simular proposta.',
  })
  @ApiNotFoundResponse({
    description: 'Simulação não encontrada para o parceiro autenticado.',
  })
  @ApiConflictResponse({
    description: 'A simulação já originou uma proposta e não pode ser editada.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'A Celcoin recusou as condições financeiras informadas.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Integração Celcoin não configurada ou indisponível.',
  })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  simulate(@CurrentUser() user: JwtPayload, @Body() dto: SimulateDto) {
    return this.simulationsService.simulate(user, dto);
  }
}
