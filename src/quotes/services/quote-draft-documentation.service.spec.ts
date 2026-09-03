import { BadRequestException, ConflictException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteEventType } from '../../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../../quote-events/quote-events.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { SystemConfigsService } from '../../system-configs/system-configs.service';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  IncomeProofType,
  QuoteAttachmentType,
} from '../enums/quote-documentation.enum';
import { AvailableIncomeProof } from '../enums/quote-income.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteDraftDocumentationService } from './quote-draft-documentation.service';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

const QUOTE_ID = '4ffa541a-a6da-11f1-9a36-0ae8736937f3';
const USER_ID = '2a6686f1-b5af-4309-a8af-e52eb8505966';
const BUCKET = 'quotes-test';

const actor: JwtPayload = {
  sub: USER_ID,
  email: 'partner@example.com',
  permissions: ['QUOTE_CREATE'],
};

const pdf = Buffer.from('%PDF-1.7 test');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: '120a16a2-f805-4c7f-9f07-7de05f2f87a6',
    filename: 'document.pdf',
    mimetype: 'application/pdf',
    size: pdf.length,
    s3Key: 'quotes/key/document.pdf',
    createdAt: '2026-09-03T12:00:00.000Z',
    createdBy: USER_ID,
    ...overrides,
  };
}

function editableQuote(overrides: Record<string, unknown> = {}) {
  return {
    quote_status: QuoteStatus.DRAFT,
    current_sales_agent_id: USER_ID,
    available_income_proof: AvailableIncomeProof.PAYSLIP,
    document_attachment: [],
    proof_of_residence_attachment: [],
    activity_photos_attachment: [],
    proof_of_income_attachment: [],
    ...overrides,
  };
}

function uploadedFile(
  buffer: Buffer,
  originalname = 'document.pdf',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
  };
}

function build(initialQuote = editableQuote()) {
  const tx = {
    quotes: {
      findUnique: jest.fn().mockResolvedValue(initialQuote),
      update: jest.fn().mockResolvedValue({}),
    },
    quote_draft_steps: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    quotes: {
      findUnique: jest.fn().mockResolvedValue(initialQuote),
    },
    $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
      Promise.resolve(operation(tx)),
    ),
  };
  const quoteDraftSteps = {
    completeWithinTransaction: jest.fn().mockResolvedValue({
      completed_at: new Date('2026-09-03T12:00:00.000Z'),
      updated_at: new Date('2026-09-03T12:00:00.000Z'),
    }),
  };
  const quoteEvents = {
    createWithinTransaction: jest.fn().mockResolvedValue({}),
  };
  const systemConfigs = {
    getRequiredValues: jest
      .fn()
      .mockResolvedValue({ S3_QUOTES_ATTACHMENTS_BUCKET: BUCKET }),
  };
  const storage = {
    upload: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    getSignedDownloadUrl: jest
      .fn()
      .mockImplementation((_bucket: string, key: string) =>
        Promise.resolve(`https://signed.test/${key}`),
      ),
  };
  const service = new QuoteDraftDocumentationService(
    prisma as unknown as PrismaService,
    quoteDraftSteps as unknown as QuoteDraftStepsService,
    quoteEvents as unknown as QuoteEventsService,
    systemConfigs as unknown as SystemConfigsService,
    storage as unknown as ObjectStorageService,
  );

  return {
    service,
    prisma,
    tx,
    quoteDraftSteps,
    quoteEvents,
    systemConfigs,
    storage,
  };
}

describe('QuoteDraftDocumentationService', () => {
  it('envia o arquivo ao S3, persiste o metadata e invalida a conclusão anterior', async () => {
    const { service, tx, storage, quoteEvents } = build();

    const result = await service.upload(
      QUOTE_ID,
      { attachmentType: QuoteAttachmentType.IDENTIFICATION_DOCUMENT },
      uploadedFile(pdf, 'RG frente.pdf'),
      actor,
    );

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: BUCKET,
        body: pdf,
        contentType: 'application/pdf',
      }),
    );
    expect(tx.quotes.update).toHaveBeenCalledWith({
      where: { id: QUOTE_ID },
      data: expect.objectContaining({
        document_attachment: [
          expect.objectContaining({
            id: expect.any(String) as unknown,
            filename: 'RG frente.pdf',
            mimetype: 'application/pdf',
            createdBy: USER_ID,
          }),
        ],
      }) as unknown,
    });
    expect(tx.quote_draft_steps.deleteMany).toHaveBeenCalledWith({
      where: { quote_id: QUOTE_ID, step: QuoteDraftStep.DOCUMENTATION },
    });
    expect(quoteEvents.createWithinTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: QuoteEventType.ATTACHMENT_ADDED,
        actorUserId: USER_ID,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        attachmentType: QuoteAttachmentType.IDENTIFICATION_DOCUMENT,
        filename: 'RG frente.pdf',
      }),
    );
    expect(result).not.toHaveProperty('s3Key');
  });

  it('exige a classificação do comprovante de renda', async () => {
    const { service, storage } = build();

    await expect(
      service.upload(
        QUOTE_ID,
        { attachmentType: QuoteAttachmentType.PROOF_OF_INCOME },
        uploadedFile(pdf),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('remove o objeto do S3 quando a persistência do metadata falha', async () => {
    const { service, tx, storage } = build();
    tx.quotes.update.mockRejectedValueOnce(new Error('database offline'));

    await expect(
      service.upload(
        QUOTE_ID,
        { attachmentType: QuoteAttachmentType.IDENTIFICATION_DOCUMENT },
        uploadedFile(pdf),
        actor,
      ),
    ).rejects.toThrow('database offline');
    const uploadCalls = storage.upload.mock.calls as unknown as [
      [{ key: string }],
    ];
    const uploadedKey = uploadCalls[0][0].key;
    expect(storage.delete).toHaveBeenCalledWith(BUCKET, uploadedKey);
  });

  it('aceita somente imagem real nas fotos da atividade', async () => {
    const { service, storage } = build();

    await expect(
      service.upload(
        QUOTE_ID,
        { attachmentType: QuoteAttachmentType.ACTIVITY_PHOTO },
        uploadedFile(pdf),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('aceita comprovante de renda somente em PDF', async () => {
    const { service, storage } = build();

    await expect(
      service.upload(
        QUOTE_ID,
        {
          attachmentType: QuoteAttachmentType.PROOF_OF_INCOME,
          incomeProofType: IncomeProofType.PAYSLIP,
        },
        uploadedFile(png, 'holerite.png'),
        actor,
      ),
    ).rejects.toThrow('Comprovantes de renda devem estar em formato PDF.');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('lista os grupos com URL assinada sem expor a chave do S3', async () => {
    const id = '120a16a2-f805-4c7f-9f07-7de05f2f87a6';
    const { service, storage } = build(
      editableQuote({ document_attachment: [attachment({ id })] }),
    );

    const result = await service.list(QUOTE_ID, actor);

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      BUCKET,
      'quotes/key/document.pdf',
    );
    expect(result.identificationDocuments[0]).toEqual(
      expect.objectContaining({
        id,
        signedUrl: 'https://signed.test/quotes/key/document.pdf',
      }),
    );
    expect(result.identificationDocuments[0]).not.toHaveProperty('s3Key');
  });

  it('remove o metadata e o objeto físico pelo ID opaco do anexo', async () => {
    const id = '120a16a2-f805-4c7f-9f07-7de05f2f87a6';
    const { service, tx, storage, quoteEvents } = build(
      editableQuote({ document_attachment: [attachment({ id })] }),
    );

    await service.remove(QUOTE_ID, id, actor);

    expect(tx.quotes.update).toHaveBeenCalledWith({
      where: { id: QUOTE_ID },
      data: expect.objectContaining({ document_attachment: [] }) as unknown,
    });
    expect(storage.delete).toHaveBeenCalledWith(
      BUCKET,
      'quotes/key/document.pdf',
    );
    expect(quoteEvents.createWithinTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: QuoteEventType.ATTACHMENT_REMOVED }),
    );
  });

  it('conclui a documentação quando todos os grupos obrigatórios existem', async () => {
    const { service, quoteDraftSteps } = build(
      editableQuote({
        document_attachment: [attachment()],
        proof_of_residence_attachment: [attachment()],
        activity_photos_attachment: [
          attachment({ filename: 'activity.png', mimetype: 'image/png' }),
        ],
        proof_of_income_attachment: [
          attachment({ incomeProofType: IncomeProofType.PAYSLIP }),
        ],
      }),
    );

    const result = await service.complete(QUOTE_ID, actor);

    expect(quoteDraftSteps.completeWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      QUOTE_ID,
      QuoteDraftStep.DOCUMENTATION,
      expect.any(Date),
    );
    expect(result.step).toBe(QuoteDraftStep.DOCUMENTATION);
  });

  it('dispensa arquivo de renda somente quando o passo 2 declarou none', async () => {
    const required = editableQuote({
      document_attachment: [attachment()],
      proof_of_residence_attachment: [attachment()],
      activity_photos_attachment: [attachment()],
    });
    const missingIncome = build(required);
    await expect(
      missingIncome.service.complete(QUOTE_ID, actor),
    ).rejects.toBeInstanceOf(BadRequestException);

    const noProofAvailable = build({
      ...required,
      available_income_proof: AvailableIncomeProof.NONE,
    });
    await expect(
      noProofAvailable.service.complete(QUOTE_ID, actor),
    ).resolves.toEqual(expect.objectContaining({ id: QUOTE_ID }));
  });

  it('recusa alterações quando a quote já saiu de draft', async () => {
    const { service, storage } = build(
      editableQuote({ quote_status: QuoteStatus.CLIENT_REVIEW }),
    );

    await expect(
      service.upload(
        QUOTE_ID,
        { attachmentType: QuoteAttachmentType.ACTIVITY_PHOTO },
        uploadedFile(png, 'activity.png'),
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
