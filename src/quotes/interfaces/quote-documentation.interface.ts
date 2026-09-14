import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  IncomeProofType,
  QuoteAttachmentType,
} from '../enums/quote-documentation.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteAttachmentSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: QuoteAttachmentType })
  attachmentType: QuoteAttachmentType;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  mimetype: string;

  @ApiProperty()
  size: number;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({ enum: IncomeProofType })
  incomeProofType?: IncomeProofType;

  @ApiPropertyOptional({
    description: 'URL temporária para leitura do arquivo.',
  })
  signedUrl?: string;
}

export class QuoteDocumentationAttachments {
  @ApiProperty({ type: [QuoteAttachmentSnapshot] })
  identificationDocuments: QuoteAttachmentSnapshot[];

  @ApiProperty({ type: [QuoteAttachmentSnapshot] })
  proofOfResidence: QuoteAttachmentSnapshot[];

  @ApiProperty({ type: [QuoteAttachmentSnapshot] })
  activityPhotos: QuoteAttachmentSnapshot[];

  @ApiProperty({ type: [QuoteAttachmentSnapshot] })
  proofOfIncome: QuoteAttachmentSnapshot[];
}

export class QuoteDocumentationSnapshot extends QuoteDocumentationAttachments {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.DOCUMENTATION] })
  step: QuoteDraftStep.DOCUMENTATION;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
