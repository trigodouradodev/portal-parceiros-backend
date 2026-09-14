import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteEventType } from '../../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../../quote-events/quote-events.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { MissingSystemConfigError } from '../../system-configs/errors/missing-system-config.error';
import { SystemConfigsService } from '../../system-configs/system-configs.service';
import { UploadQuoteAttachmentDto } from '../dto/upload-quote-attachment.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  IncomeProofType,
  QuoteAttachmentType,
} from '../enums/quote-documentation.enum';
import { AvailableIncomeProof } from '../enums/quote-income.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import {
  QuoteAttachmentSnapshot,
  QuoteDocumentationAttachments,
  QuoteDocumentationSnapshot,
} from '../interfaces/quote-documentation.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

const ATTACHMENTS_BUCKET_KEY = 'S3_QUOTES_ATTACHMENTS_BUCKET';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TRANSACTION_ATTEMPTS = 3;

type AttachmentColumn =
  | 'document_attachment'
  | 'proof_of_residence_attachment'
  | 'activity_photos_attachment'
  | 'proof_of_income_attachment';

interface QuoteAttachmentRecord {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  s3Key: string;
  createdAt: string;
  createdBy: string;
  incomeProofType?: IncomeProofType;
}

interface EditableQuote {
  quote_status: string;
  current_sales_agent_id: string;
  available_income_proof: string | null;
  document_attachment: unknown;
  proof_of_residence_attachment: unknown;
  activity_photos_attachment: unknown;
  proof_of_income_attachment: unknown;
}

const COLUMN_BY_TYPE: Record<QuoteAttachmentType, AttachmentColumn> = {
  [QuoteAttachmentType.IDENTIFICATION_DOCUMENT]: 'document_attachment',
  [QuoteAttachmentType.PROOF_OF_RESIDENCE]: 'proof_of_residence_attachment',
  [QuoteAttachmentType.ACTIVITY_PHOTO]: 'activity_photos_attachment',
  [QuoteAttachmentType.PROOF_OF_INCOME]: 'proof_of_income_attachment',
};

@Injectable()
export class QuoteDraftDocumentationService {
  private readonly logger = new Logger(QuoteDraftDocumentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
    private readonly quoteEvents: QuoteEventsService,
    private readonly systemConfigs: SystemConfigsService,
    private readonly storage: ObjectStorageService,
  ) {}

  async upload(
    quoteId: string,
    dto: UploadQuoteAttachmentDto,
    file: Express.Multer.File | undefined,
    actor: JwtPayload,
  ): Promise<QuoteAttachmentSnapshot> {
    await this.findEditableQuote(quoteId, actor);
    const validatedFile = validateFile(file, dto);

    const bucket = await this.getBucket();
    const attachmentId = randomUUID();
    const storageKey = `quotes/${quoteId}/${dto.attachmentType}/${attachmentId}/${sanitizeFilename(validatedFile.originalname)}`;
    const attachment: QuoteAttachmentRecord = {
      id: attachmentId,
      filename: validatedFile.originalname.trim().slice(0, 255),
      mimetype: validatedFile.detectedMimeType,
      size: validatedFile.buffer.length,
      s3Key: storageKey,
      createdAt: new Date().toISOString(),
      createdBy: actor.sub,
      ...(dto.incomeProofType ? { incomeProofType: dto.incomeProofType } : {}),
    };

    await this.storage.upload({
      bucket,
      key: storageKey,
      body: validatedFile.buffer,
      contentType: validatedFile.detectedMimeType,
    });

    try {
      await this.runSerializableTransaction(async (tx) => {
        const quote = await this.findEditableQuote(quoteId, actor, tx);
        const column = COLUMN_BY_TYPE[dto.attachmentType];
        const attachments = parseAttachments(quote[column]);
        attachments.push(attachment);
        const updatedAt = new Date();

        await tx.quotes.update({
          where: { id: quoteId },
          data: {
            [column]: attachments as unknown as Prisma.InputJsonValue,
            updated_at: updatedAt,
          },
        });
        await tx.quote_draft_steps.deleteMany({
          where: { quote_id: quoteId, step: QuoteDraftStep.DOCUMENTATION },
        });
        await this.quoteEvents.createWithinTransaction(tx, {
          quoteId,
          actorUserId: actor.sub,
          type: QuoteEventType.ATTACHMENT_ADDED,
          metadata: {
            attachmentId,
            attachmentType: dto.attachmentType,
            filename: attachment.filename,
            ...(dto.incomeProofType
              ? { incomeProofType: dto.incomeProofType }
              : {}),
          },
        });
      });
    } catch (error) {
      await this.deleteCompensatingObject(bucket, storageKey);
      throw error;
    }

    return toSnapshot(attachment, dto.attachmentType);
  }

  async list(
    quoteId: string,
    actor: JwtPayload,
  ): Promise<QuoteDocumentationAttachments> {
    const quote = await this.findEditableQuote(quoteId, actor);
    const bucket = await this.getBucket();
    const groups = toGroups(quote);
    const attachments: QuoteAttachmentSnapshot[] = [
      ...groups.identificationDocuments,
      ...groups.proofOfResidence,
      ...groups.activityPhotos,
      ...groups.proofOfIncome,
    ];

    await Promise.all(
      attachments.map(async (attachment) => {
        attachment.signedUrl = await this.storage.getSignedDownloadUrl(
          bucket,
          attachmentStorageKey(quote, attachment.id),
        );
      }),
    );

    return groups;
  }

  async remove(
    quoteId: string,
    attachmentId: string,
    actor: JwtPayload,
  ): Promise<void> {
    await this.findEditableQuote(quoteId, actor);
    const bucket = await this.getBucket();
    const removed = await this.runSerializableTransaction(async (tx) => {
      const quote = await this.findEditableQuote(quoteId, actor, tx);
      const located = locateAttachment(quote, attachmentId);
      if (!located) throw new NotFoundException('Anexo não encontrado.');

      const updatedAt = new Date();
      await tx.quotes.update({
        where: { id: quoteId },
        data: {
          [located.column]: located.attachments.filter(
            (attachment) => attachment.id !== attachmentId,
          ) as unknown as Prisma.InputJsonValue,
          updated_at: updatedAt,
        },
      });
      await tx.quote_draft_steps.deleteMany({
        where: { quote_id: quoteId, step: QuoteDraftStep.DOCUMENTATION },
      });
      await this.quoteEvents.createWithinTransaction(tx, {
        quoteId,
        actorUserId: actor.sub,
        type: QuoteEventType.ATTACHMENT_REMOVED,
        metadata: {
          attachmentId,
          attachmentType: located.type,
          filename: located.attachment.filename,
        },
      });

      return located.attachment;
    });

    try {
      await this.storage.delete(bucket, removed.s3Key);
    } catch (error) {
      // O banco é a fonte de verdade. Uma falha posterior no S3 deixa apenas
      // um objeto órfão, sem expor ao usuário um anexo que já foi removido.
      this.logger.error(
        `Falha ao excluir objeto órfão ${removed.s3Key} do S3.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async complete(
    quoteId: string,
    actor: JwtPayload,
  ): Promise<QuoteDocumentationSnapshot> {
    return this.runSerializableTransaction(async (tx) => {
      const quote = await this.findEditableQuote(quoteId, actor, tx);
      const groups = toGroups(quote);
      validateRequiredDocumentation(quote, groups);

      const updatedAt = new Date();
      await tx.quotes.update({
        where: { id: quoteId },
        data: { updated_at: updatedAt },
      });
      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.DOCUMENTATION,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.DOCUMENTATION,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        ...groups,
      };
    });
  }

  private async findEditableQuote(
    quoteId: string,
    actor: JwtPayload,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<EditableQuote> {
    const quote = await client.quotes.findUnique({
      where: { id: quoteId },
      select: {
        quote_status: true,
        current_sales_agent_id: true,
        available_income_proof: true,
        document_attachment: true,
        proof_of_residence_attachment: true,
        activity_photos_attachment: true,
        proof_of_income_attachment: true,
      },
    });
    if (!quote) throw new NotFoundException('Proposta não encontrada.');

    const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);
    if (!isAdmin && quote.current_sales_agent_id !== actor.sub) {
      throw new ForbiddenException(
        'Somente o parceiro responsável pode editar esta proposta.',
      );
    }
    if (quote.quote_status !== String(QuoteStatus.DRAFT)) {
      throw new ConflictException(
        `A etapa Documentação não pode ser alterada no status ${quote.quote_status}.`,
      );
    }
    return quote;
  }

  private async getBucket(): Promise<string> {
    try {
      const values = await this.systemConfigs.getRequiredValues([
        ATTACHMENTS_BUCKET_KEY,
      ]);
      const bucket = values[ATTACHMENTS_BUCKET_KEY].trim();
      if (!bucket) {
        throw new ServiceUnavailableException(
          `Configuração ${ATTACHMENTS_BUCKET_KEY} está vazia.`,
        );
      }
      return bucket;
    } catch (error) {
      if (error instanceof MissingSystemConfigError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  private async deleteCompensatingObject(
    bucket: string,
    storageKey: string,
  ): Promise<void> {
    try {
      await this.storage.delete(bucket, storageKey);
    } catch (error) {
      this.logger.error(
        `Falha ao remover upload compensatório ${storageKey} do S3.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !isTransactionConflict(error) ||
          attempt === MAX_TRANSACTION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException('Não foi possível atualizar os anexos.');
  }
}

function validateFile(
  file: Express.Multer.File | undefined,
  dto: UploadQuoteAttachmentDto,
) {
  if (!file) throw new BadRequestException('Envie um arquivo no campo file.');
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new BadRequestException('O arquivo enviado está vazio.');
  }
  if (
    file.size > MAX_FILE_SIZE_BYTES ||
    file.buffer.length > MAX_FILE_SIZE_BYTES
  ) {
    throw new BadRequestException('O arquivo deve ter no máximo 10 MB.');
  }

  if (dto.attachmentType === QuoteAttachmentType.PROOF_OF_INCOME) {
    if (!dto.incomeProofType) {
      throw new BadRequestException(
        'Informe incomeProofType para um comprovante de renda.',
      );
    }
  } else if (dto.incomeProofType) {
    throw new BadRequestException(
      'incomeProofType só pode ser usado em comprovantes de renda.',
    );
  }

  const detectedMimeType = detectMimeType(file.buffer);
  const allowed = allowedMimeTypes(dto.attachmentType);
  if (!detectedMimeType || !allowed.includes(detectedMimeType)) {
    if (dto.attachmentType === QuoteAttachmentType.PROOF_OF_INCOME) {
      throw new BadRequestException(
        'Comprovantes de renda devem estar em formato PDF.',
      );
    }
    throw new BadRequestException(
      dto.attachmentType === QuoteAttachmentType.ACTIVITY_PHOTO
        ? 'Fotos da atividade devem ser JPEG ou PNG.'
        : 'O arquivo deve ser PDF, JPEG ou PNG.',
    );
  }

  return { ...file, detectedMimeType };
}

function allowedMimeTypes(type: QuoteAttachmentType): string[] {
  if (type === QuoteAttachmentType.ACTIVITY_PHOTO) {
    return ['image/jpeg', 'image/png'];
  }
  if (type === QuoteAttachmentType.PROOF_OF_INCOME) {
    return ['application/pdf'];
  }
  return ['application/pdf', 'image/jpeg', 'image/png'];
}

function detectMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return 'image/png';
  }
  return null;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return sanitized || 'attachment';
}

function parseAttachments(value: unknown): QuoteAttachmentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAttachmentRecord);
}

function isAttachmentRecord(value: unknown): value is QuoteAttachmentRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.filename === 'string' &&
    typeof item.mimetype === 'string' &&
    typeof item.size === 'number' &&
    typeof item.s3Key === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.createdBy === 'string'
  );
}

function locateAttachment(quote: EditableQuote, attachmentId: string) {
  const entries = Object.entries(COLUMN_BY_TYPE) as [
    QuoteAttachmentType,
    AttachmentColumn,
  ][];
  for (const [type, column] of entries) {
    const attachments = parseAttachments(quote[column]);
    const attachment = attachments.find((item) => item.id === attachmentId);
    if (attachment) return { type, column, attachments, attachment };
  }
  return null;
}

function toGroups(quote: EditableQuote): QuoteDocumentationAttachments {
  return {
    identificationDocuments: parseAttachments(quote.document_attachment).map(
      (attachment) =>
        toSnapshot(attachment, QuoteAttachmentType.IDENTIFICATION_DOCUMENT),
    ),
    proofOfResidence: parseAttachments(quote.proof_of_residence_attachment).map(
      (attachment) =>
        toSnapshot(attachment, QuoteAttachmentType.PROOF_OF_RESIDENCE),
    ),
    activityPhotos: parseAttachments(quote.activity_photos_attachment).map(
      (attachment) =>
        toSnapshot(attachment, QuoteAttachmentType.ACTIVITY_PHOTO),
    ),
    proofOfIncome: parseAttachments(quote.proof_of_income_attachment).map(
      (attachment) =>
        toSnapshot(attachment, QuoteAttachmentType.PROOF_OF_INCOME),
    ),
  };
}

function toSnapshot(
  attachment: QuoteAttachmentRecord,
  attachmentType: QuoteAttachmentType,
): QuoteAttachmentSnapshot {
  return {
    id: attachment.id,
    attachmentType,
    filename: attachment.filename,
    mimetype: attachment.mimetype,
    size: attachment.size,
    createdAt: attachment.createdAt,
    ...(attachment.incomeProofType
      ? { incomeProofType: attachment.incomeProofType }
      : {}),
  };
}

function attachmentStorageKey(
  quote: EditableQuote,
  attachmentId: string,
): string {
  const located = locateAttachment(quote, attachmentId);
  if (!located) throw new NotFoundException('Anexo não encontrado.');
  return located.attachment.s3Key;
}

function validateRequiredDocumentation(
  quote: EditableQuote,
  groups: QuoteDocumentationAttachments,
): void {
  if (groups.proofOfIncome.some((attachment) => !attachment.incomeProofType)) {
    throw new BadRequestException(
      'Classifique todos os comprovantes de renda antes de concluir.',
    );
  }

  const missing: string[] = [];
  if (groups.identificationDocuments.length === 0) {
    missing.push('documento de identificação');
  }
  if (groups.proofOfResidence.length === 0) {
    missing.push('comprovante de residência');
  }
  if (groups.activityPhotos.length === 0) {
    missing.push('foto da atividade');
  }
  if (
    quote.available_income_proof !== AvailableIncomeProof.NONE &&
    groups.proofOfIncome.length === 0
  ) {
    missing.push('comprovante de renda');
  }
  if (missing.length > 0) {
    throw new BadRequestException(
      `Documentação incompleta: envie ${missing.join(', ')}.`,
    );
  }
}

function isTransactionConflict(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2034'
  );
}
