import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { BrazilLocationsService } from './brazil-locations.service';
import { PostalCodeParamsDto } from './dto/postal-code-params.dto';
import { PostalCodeAddress } from './interfaces/postal-code-address.interface';
import { StateCities } from './interfaces/state-cities.interface';
import { PostalCodeService } from './postal-code.service';

@ApiTags('locations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@RequirePermissions(PermissionKey.QUOTE_CREATE)
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly postalCodes: PostalCodeService,
    private readonly brazilLocations: BrazilLocationsService,
  ) {}

  @ApiOperation({ summary: 'Consulta um endereço brasileiro pelo CEP.' })
  @ApiOkResponse({ type: PostalCodeAddress })
  @ApiBadRequestResponse({ description: 'CEP inválido.' })
  @ApiNotFoundResponse({ description: 'CEP não encontrado.' })
  @ApiServiceUnavailableResponse({ description: 'ViaCEP indisponível.' })
  @Get('postal-code/:zipCode')
  findPostalCode(
    @Param() params: PostalCodeParamsDto,
  ): Promise<PostalCodeAddress> {
    return this.postalCodes.find(params.zipCode);
  }

  @ApiOperation({ summary: 'Lista estados brasileiros com suas cidades.' })
  @ApiOkResponse({ type: [StateCities] })
  @ApiServiceUnavailableResponse({ description: 'IBGE indisponível.' })
  @Get('states-cities')
  listStatesWithCities(): Promise<StateCities[]> {
    return this.brazilLocations.listStatesWithCities();
  }
}
