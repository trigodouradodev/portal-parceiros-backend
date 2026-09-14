import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';

export class QuoteConsultantSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class QuoteListItem {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  simulationId: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  document: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  financeAmount: number;

  @ApiProperty({ type: QuoteConsultantSummary })
  consultant: QuoteConsultantSummary;

  @ApiProperty({ enum: QuoteDraftStep, isArray: true })
  completedSteps: QuoteDraftStep[];

  @ApiProperty({
    description:
      'Indica se o usuário autenticado pode continuar editando a proposta.',
  })
  canEdit: boolean;

  @ApiPropertyOptional({ nullable: true })
  createdAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt: string | null;
}

export class QuotesPagination {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;
}

export class QuotesPage {
  @ApiProperty({ type: [QuoteListItem] })
  items: QuoteListItem[];

  @ApiProperty({ type: QuotesPagination })
  pagination: QuotesPagination;
}
