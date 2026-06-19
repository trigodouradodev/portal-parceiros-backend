import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { VerifyLocationDto } from './dto/verify-location.dto';
import { LocationCheckResult } from './interfaces/location-check-result.interface';
import { LocationCheckService } from './location-check.service';

@ApiTags('location-check')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('location-check')
export class LocationCheckController {
  constructor(private readonly locationCheckService: LocationCheckService) {}

  /**
   * Verifica se a coordenada capturada pelo agente está a até 15m do endereço
   * cadastrado do cliente. Acesso: CONTRACT_FOLLOW_UP (ROLE_ADMIN por bypass).
   */
  @ApiOperation({
    summary: 'Verificar se a captura está no raio do endereço cadastrado.',
  })
  @ApiOkResponse({ type: LocationCheckResult })
  @ApiServiceUnavailableResponse({
    description: 'Geocoding não configurado ou indisponível.',
  })
  @RequirePermissions(PermissionKey.CONTRACT_FOLLOW_UP)
  @Post()
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyLocationDto): Promise<LocationCheckResult> {
    return this.locationCheckService.verify(dto);
  }
}
