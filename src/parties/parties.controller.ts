import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PartyFormLookupResponse } from './interfaces/party-form-lookup-response.interface';
import { PartiesService } from './parties.service';

@ApiTags('parties')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @ApiOperation({
    summary: 'Consulta dados cadastrais de uma pessoa pelo CPF.',
    description:
      'Retorna apenas dados para pré-preenchimento. O identificador interno da party não é exposto.',
  })
  @ApiParam({ name: 'cpf', example: '52998224725' })
  @ApiOkResponse({ type: PartyFormLookupResponse })
  @ApiBadRequestResponse({ description: 'CPF inválido.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Get('by-cpf/:cpf')
  async findByCpf(@Param('cpf') cpf: string): Promise<PartyFormLookupResponse> {
    return { party: await this.partiesService.findFormDataByCpf(cpf) };
  }
}
