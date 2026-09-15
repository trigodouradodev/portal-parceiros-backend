import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDetail } from './quote-detail.interface';

export class QuoteRenewalPrefillResponse {
  @ApiProperty({
    description: 'True quando a cópia foi realizada nesta requisição.',
  })
  applied: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  sourceContractId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  sourceQuoteId: string | null;

  @ApiProperty({ type: QuoteDetail })
  quote: QuoteDetail;
}
