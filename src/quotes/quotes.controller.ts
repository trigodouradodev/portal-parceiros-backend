import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { CreateDraftQuoteDto } from './dto/create-draft-quote.dto';
import { SaveQuoteRegistrationDto } from './dto/save-quote-registration.dto';
import { QuoteDraftSnapshot } from './interfaces/quote-draft-snapshot.interface';
import { QuoteRegistrationSnapshot } from './interfaces/quote-registration-snapshot.interface';
import { QuoteStatusResponse } from './interfaces/quote-status-response.interface';
import { QuotesService } from './quotes.service';
import { QuoteDraftRegistrationService } from './services/quote-draft-registration.service';

@ApiTags('quotes')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({
  description: 'Permissão insuficiente ou proposta de outro parceiro.',
})
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly quoteDraftRegistration: QuoteDraftRegistrationService,
  ) {}

  @ApiOperation({
    summary: 'Inicia uma proposta draft a partir de uma simulação.',
    description:
      'A simulação deve pertencer ao parceiro autenticado e ainda não pode ter originado outra proposta.',
  })
  @ApiCreatedResponse({ type: QuoteDraftSnapshot })
  @ApiNotFoundResponse({
    description: 'Simulação não encontrada para o parceiro autenticado.',
  })
  @ApiConflictResponse({
    description: 'A simulação já originou uma proposta.',
  })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post('draft')
  createDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDraftQuoteDto,
  ): Promise<QuoteDraftSnapshot> {
    return this.quotesService.createDraftFromSimulation(dto.simulationId, user);
  }

  @ApiOperation({ summary: 'Salva o passo Cadastro da proposta draft.' })
  @ApiOkResponse({ type: QuoteRegistrationSnapshot })
  @ApiBadRequestResponse({
    description: 'Campos ou combinações condicionais inválidos.',
  })
  @ApiNotFoundResponse({ description: 'Proposta não encontrada.' })
  @ApiConflictResponse({ description: 'A proposta não está mais em draft.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Patch('draft/:quoteId/registration')
  saveDraftRegistration(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: SaveQuoteRegistrationDto,
  ): Promise<QuoteRegistrationSnapshot> {
    return this.quoteDraftRegistration.save(quoteId, dto, user);
  }

  @ApiOperation({
    summary:
      'Finaliza o preenchimento e envia a proposta para revisão do cliente.',
  })
  @ApiOkResponse({ type: QuoteStatusResponse })
  @ApiNotFoundResponse({ description: 'Proposta não encontrada.' })
  @ApiConflictResponse({
    description: 'A proposta não está mais no status draft.',
  })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Put('draft/:quoteId/submit')
  @HttpCode(HttpStatus.OK)
  submitDraft(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteStatusResponse> {
    return this.quotesService.submitDraftForClientReview(quoteId, user);
  }
}
