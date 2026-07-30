import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
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
import { PartnerProgram } from './interfaces/partner-program.interface';

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

  /**
   * Parâmetros do Programa de Parceiros Exclusivos: níveis, faixas dos 3 pilares
   * de bônus, marcos de permanência e bônus de boas-vindas.
   *
   * É o insumo do simulador do front, que avalia as faixas localmente — a cada
   * arrasto de slider — em vez de bater no servidor. Também é a base da tabela
   * comparativa entre níveis.
   *
   * Sem `@RequirePermissions`: são os parâmetros do programa, iguais para todo
   * parceiro e sem nenhum dado de carteira. Vale para quem não está inscrito,
   * então não replica o 404 de `/me`.
   */
  @ApiOperation({
    summary: 'Níveis, faixas de bônus e marcos do programa (parâmetros).',
  })
  @ApiOkResponse({ type: PartnerProgram })
  @ApiInternalServerErrorResponse({
    description:
      'Parâmetros mal cadastrados no banco — régua de bônus com buraco ou ' +
      'sobreposição, ou config do bônus de boas-vindas ausente/inválida.',
  })
  @Get('program')
  getProgram() {
    return this.performanceService.getProgram();
  }
}
