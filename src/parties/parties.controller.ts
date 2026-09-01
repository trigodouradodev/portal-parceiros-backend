import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { LookupPartyDto } from './dto/lookup-party.dto';
import { PartyLookupResponse } from './interfaces/party-lookup-response.interface';
import { PartiesService } from './parties.service';

@ApiTags('parties')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @ApiOperation({
    summary: 'Consulta os dados básicos de uma pessoa por CPF.',
  })
  @ApiOkResponse({ type: PartyLookupResponse })
  @ApiBadRequestResponse({ description: 'CPF inválido.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post('lookup')
  lookupByCpf(@Body() dto: LookupPartyDto) {
    return this.partiesService.lookupByCpf(dto.document);
  }
}
