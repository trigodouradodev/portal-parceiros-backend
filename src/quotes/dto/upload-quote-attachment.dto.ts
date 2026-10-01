import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  IncomeProofType,
  QuoteAttachmentType,
} from '../enums/quote-documentation.enum';

export class UploadQuoteAttachmentDto {
  @ApiProperty({ enum: QuoteAttachmentType })
  @IsEnum(QuoteAttachmentType)
  attachmentType: QuoteAttachmentType;

  @ApiPropertyOptional({
    enum: IncomeProofType,
    description: 'Obrigatório quando attachmentType for proof_of_income.',
  })
  @IsOptional()
  @IsEnum(IncomeProofType)
  incomeProofType?: IncomeProofType;
}
