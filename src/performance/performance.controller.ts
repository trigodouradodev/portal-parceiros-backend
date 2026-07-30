import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PerformanceService } from './performance.service';
import { PartnerProfile } from './interfaces/partner-profile.interface';

@ApiTags('performance')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /**
   * Barra de identidade do parceiro, nível contratado e posição na trilha de
   * permanência. Alimenta também o ponto de partida do simulador no front.
   *
   * Sem `@RequirePermissions` de propósito: é dado próprio do viewer (nível e
   * remuneração dele), então o gate é o guard de autenticação global mais a
   * inscrição no programa. Não há scope hierárquico aqui — um gerente não vê o
   * nível do subordinado por esta rota.
   */
  @ApiOperation({
    summary: 'Identidade, nível e mês de parceria do parceiro logado.',
  })
  @ApiOkResponse({ type: PartnerProfile })
  @ApiNotFoundResponse({
    description:
      'Viewer não inscrito no Programa de Parceiros Exclusivos (ou com ' +
      'parceria de início futuro). O front esconde a aba Desempenho.',
  })
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.performanceService.getPartnerProfile(
      user.sub,
      user.permissions,
    );
  }
}
