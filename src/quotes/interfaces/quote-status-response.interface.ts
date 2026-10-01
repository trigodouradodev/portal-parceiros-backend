import { ApiProperty } from '@nestjs/swagger';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteStatusResponse {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    enum: QuoteStatus,
    example: QuoteStatus.CLIENT_REVIEW,
  })
  status: QuoteStatus;

  @ApiProperty({ example: '2026-08-26T18:30:00.000Z' })
  updatedAt: Date;
}
