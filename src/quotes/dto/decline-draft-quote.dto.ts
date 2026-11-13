import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { QuoteDeclineReason } from '../enums/quote-decline-reason.enum';

export const DECLINE_NOTE_MAX_LENGTH = 500;

/** Recusa de um rascunho da Canal Digital pelo parceiro responsável. */
export class DeclineDraftQuoteDto {
  @ApiProperty({
    enum: QuoteDeclineReason,
    example: QuoteDeclineReason.NO_RESPONSE,
  })
  @IsEnum(QuoteDeclineReason, { message: 'Informe o motivo da recusa.' })
  reason: QuoteDeclineReason;

  @ApiPropertyOptional({
    maxLength: DECLINE_NOTE_MAX_LENGTH,
    description:
      'Complemento do motivo. Obrigatório quando o motivo é "other" ou ' +
      '"product_criteria_not_met" (qual critério).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DECLINE_NOTE_MAX_LENGTH, {
    message: `A observação deve ter no máximo ${DECLINE_NOTE_MAX_LENGTH} caracteres.`,
  })
  note?: string;
}
