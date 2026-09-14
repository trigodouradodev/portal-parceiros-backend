import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { UploadQuoteAttachmentDto } from './dto/upload-quote-attachment.dto';
import {
  QuoteAttachmentSnapshot,
  QuoteDocumentationAttachments,
  QuoteDocumentationSnapshot,
} from './interfaces/quote-documentation.interface';
import { QuoteDraftDocumentationService } from './services/quote-draft-documentation.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@ApiTags('quotes')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({
  description: 'Permissão insuficiente ou proposta de outro parceiro.',
})
@Controller('quotes/draft/:quoteId')
export class QuoteDraftDocumentationController {
  constructor(private readonly documentation: QuoteDraftDocumentationService) {}

  @ApiOperation({ summary: 'Adiciona um arquivo à documentação do draft.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['attachmentType', 'file'],
      properties: {
        attachmentType: {
          type: 'string',
          enum: [
            'identification_document',
            'proof_of_residence',
            'activity_photo',
            'proof_of_income',
          ],
        },
        incomeProofType: {
          type: 'string',
          enum: ['bank_statement', 'payslip', 'inss_benefit', 'mei_das'],
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ type: QuoteAttachmentSnapshot })
  @ApiBadRequestResponse({
    description: 'Arquivo, tipo ou classificação de renda inválidos.',
  })
  @ApiNotFoundResponse({ description: 'Proposta não encontrada.' })
  @ApiConflictResponse({ description: 'A proposta não está mais em draft.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: UploadQuoteAttachmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<QuoteAttachmentSnapshot> {
    return this.documentation.upload(quoteId, dto, file, user);
  }

  @ApiOperation({
    summary: 'Lista a documentação do draft com URLs temporárias.',
  })
  @ApiOkResponse({ type: QuoteDocumentationAttachments })
  @ApiNotFoundResponse({ description: 'Proposta não encontrada.' })
  @ApiConflictResponse({ description: 'A proposta não está mais em draft.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Get('attachments')
  list(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteDocumentationAttachments> {
    return this.documentation.list(quoteId, user);
  }

  @ApiOperation({ summary: 'Remove um arquivo da documentação do draft.' })
  @ApiNoContentResponse({ description: 'Arquivo removido.' })
  @ApiNotFoundResponse({ description: 'Proposta ou anexo não encontrado.' })
  @ApiConflictResponse({ description: 'A proposta não está mais em draft.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Delete('attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    return this.documentation.remove(quoteId, attachmentId, user);
  }

  @ApiOperation({
    summary: 'Valida e conclui o passo Documentação da proposta draft.',
  })
  @ApiOkResponse({ type: QuoteDocumentationSnapshot })
  @ApiBadRequestResponse({
    description: 'Documentação obrigatória incompleta.',
  })
  @ApiNotFoundResponse({ description: 'Proposta não encontrada.' })
  @ApiConflictResponse({ description: 'A proposta não está mais em draft.' })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Patch('documentation')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteDocumentationSnapshot> {
    return this.documentation.complete(quoteId, user);
  }
}
