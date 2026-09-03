import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { BrazilLocationsService } from './brazil-locations.service';
import { PostalCodeParamsDto } from './dto/postal-code-params.dto';
import { ReverseGeocodeQueryDto } from './dto/reverse-geocode-query.dto';
import { GeocodingService } from './geocoding.service';
import { PostalCodeAddress } from './interfaces/postal-code-address.interface';
import { ReverseGeocodedAddress } from './interfaces/reverse-geocoded-address.interface';
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
    private readonly geocoding: GeocodingService,
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

  @ApiOperation({
    summary: 'Consulta o endereço brasileiro mais próximo das coordenadas.',
  })
  @ApiOkResponse({ type: ReverseGeocodedAddress })
  @ApiBadRequestResponse({ description: 'Latitude ou longitude inválida.' })
  @ApiNotFoundResponse({ description: 'Endereço não encontrado.' })
  @ApiUnprocessableEntityResponse({
    description: 'As coordenadas não pertencem a um endereço no Brasil.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Geocoding não configurado ou indisponível.',
  })
  @Get('reverse-geocode')
  async reverseGeocode(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodedAddress> {
    const address = await this.geocoding.reverseGeocode(
      query.latitude,
      query.longitude,
    );
    if (!address) {
      throw new NotFoundException(
        'Nenhum endereço foi encontrado para as coordenadas informadas.',
      );
    }
    return address;
  }
}
