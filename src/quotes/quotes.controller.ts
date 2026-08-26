import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { QuoteStatusResponse } from './interfaces/quote-status-response.interface';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({
  description: 'Permissão insuficiente ou proposta de outro parceiro.',
})
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

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
