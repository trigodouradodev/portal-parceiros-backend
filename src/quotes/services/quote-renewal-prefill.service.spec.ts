import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteEventType } from '../../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../../quote-events/quote-events.service';
import { QuoteStatus } from '../enums/quote-status.enum';
import { RENEWAL_PREFILL_FIELD_WHITELIST } from '../renewal/quote-renewal-prefill.fields';
import { QuoteRenewalPrefillService } from './quote-renewal-prefill.service';

const QUOTE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_QUOTE_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';
const PARTY_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';

const sourceQuote = {
  gender: 'female',
  secondary_document: '123456789',
  profession: 'Comerciante',
  business_activity_branch: 'retail_commerce',
  business_activity_subcategory: 'general_commerce',
  economic_activity_categories: ['commerce'],
  economic_activity_other: null,
  marital_status: 'single',
  spouse_document: null,
  children_count: 2,
  household_members: 4,
  housing_status: 'owned_paid_off',
  residence_duration: 'more_than_5_years',
  government_programs: ['none'],
  owns_vehicle: true,
  vehicle_financed: false,
  credit_purpose: 'business_working_capital',
  business_document: '11222333000181',
  activity_duration: 'more_than_5_years',
  personal_income: new Prisma.Decimal(4500),
  income_source: 'self_employed',
  has_multiple_income_sources: true,
  additional_incomes: [{ source: 'other', amount: 900 }],
  available_income_proof: 'bank_statement',
  client_address: {
    zipCode: '20000000',
    streetName: 'Rua da proposta anterior',
    streetNumber: '20',
    streetComplement: '',
    streetDistrict: 'Centro',
    city: 'Rio de Janeiro',
    state: 'RJ',
    referencePoint: 'Praça',
    geolocation: { latitude: -22, longitude: -43, precision: '10m' },
  },
};

const partyAddress = {
  street: 'Rua atual da party',
  number: '10',
  complement: null,
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'sp',
  zip_code: '01001000',
  landmark: 'Metrô',
};

function actor(): JwtPayload {
  return {
    sub: OWNER_ID,
    email: 'parceiro@trigo.test',
    role: 'consultant',
    permissions: [PermissionKey.QUOTE_CREATE],
  };
}

interface BuildOptions {
  previousEvent?: { metadata: Prisma.JsonValue } | null;
  address?: typeof partyAddress | null;
}

function build({
  previousEvent = null,
  address = partyAddress,
}: BuildOptions = {}) {
  const updateQuote = jest.fn(
    (input: {
      where: { id: string };
      data: Prisma.quotesUpdateInput;
    }): Promise<{ id: string }> => {
      void input;
      return Promise.resolve({ id: QUOTE_ID });
    },
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        id: QUOTE_ID,
        party_id: PARTY_ID,
        quote_status: QuoteStatus.DRAFT,
        current_sales_agent_id: OWNER_ID,
      },
    ]),
    quote_events: {
      findFirst: jest.fn().mockResolvedValue(previousEvent),
    },
    contracts: {
      findFirst: jest.fn().mockResolvedValue({
        id: CONTRACT_ID,
        quote_id: SOURCE_QUOTE_ID,
        quotes: sourceQuote,
      }),
    },
    addresses: {
      findFirst: jest.fn().mockResolvedValue(address),
    },
    quotes: {
      update: updateQuote,
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const quoteEvents = {
    createWithinTransaction: jest.fn().mockResolvedValue({ id: 'event-1' }),
  };
  const service = new QuoteRenewalPrefillService(
    prisma as unknown as PrismaService,
    quoteEvents as unknown as QuoteEventsService,
  );
  return { service, tx, quoteEvents, updateQuote };
}

describe('QuoteRenewalPrefillService', () => {
  it('copia exclusivamente a whitelist e prioriza o endereço atual da party', async () => {
    const { service, tx, quoteEvents, updateQuote } = build();

    await expect(service.apply(QUOTE_ID, actor())).resolves.toEqual({
      applied: true,
      sourceContractId: CONTRACT_ID,
      sourceQuoteId: SOURCE_QUOTE_ID,
    });

    expect(tx.contracts.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          client_id: PARTY_ID,
          status: { in: ['disbursed', 'closed'] },
          quote_id: { not: null },
          NOT: { quote_id: QUOTE_ID },
        },
      }),
    );
    const update = updateQuote.mock.calls[0][0].data;
    expect(Object.keys(update).sort()).toEqual(
      [
        ...Object.keys(RENEWAL_PREFILL_FIELD_WHITELIST.registration),
        ...Object.keys(RENEWAL_PREFILL_FIELD_WHITELIST.income),
        'is_renegotiation',
        'client_address',
        'updated_at',
      ].sort(),
    );
    expect(update).toMatchObject({
      is_renegotiation: true,
      profession: sourceQuote.profession,
      business_activity_branch: sourceQuote.business_activity_branch,
      business_activity_subcategory: sourceQuote.business_activity_subcategory,
      personal_income: sourceQuote.personal_income,
      client_address: {
        zipCode: '01001000',
        streetName: 'Rua atual da party',
        streetNumber: '10',
        streetComplement: '',
        streetDistrict: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        referencePoint: 'Metrô',
      },
    });
    expect(update).not.toHaveProperty('document');
    expect(update).not.toHaveProperty('client_name');
    expect(update).not.toHaveProperty('email');
    expect(update).not.toHaveProperty('geolocation');
    expect(update).not.toHaveProperty('guarantor');
    expect(update).not.toHaveProperty('debts');
    expect(update).not.toHaveProperty('loans');

    expect(quoteEvents.createWithinTransaction).toHaveBeenCalledWith(tx, {
      quoteId: QUOTE_ID,
      actorUserId: OWNER_ID,
      type: QuoteEventType.RENEWAL_PREFILLED,
      metadata: {
        sourceContractId: CONTRACT_ID,
        sourceQuoteId: SOURCE_QUOTE_ID,
        copiedFields: RENEWAL_PREFILL_FIELD_WHITELIST,
      },
    });
  });

  it('usa o endereço da proposta anterior sem copiar geolocalização', async () => {
    const { service, updateQuote } = build({ address: null });

    await service.apply(QUOTE_ID, actor());

    expect(updateQuote.mock.calls[0][0].data.client_address).toEqual({
      zipCode: '20000000',
      streetName: 'Rua da proposta anterior',
      streetNumber: '20',
      streetComplement: '',
      streetDistrict: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
      referencePoint: 'Praça',
    });
  });

  it('não repete a cópia nem o evento quando o prefill já foi aplicado', async () => {
    const { service, tx, quoteEvents, updateQuote } = build({
      previousEvent: {
        metadata: {
          sourceContractId: CONTRACT_ID,
          sourceQuoteId: SOURCE_QUOTE_ID,
        },
      },
    });

    await expect(service.apply(QUOTE_ID, actor())).resolves.toEqual({
      applied: false,
      sourceContractId: CONTRACT_ID,
      sourceQuoteId: SOURCE_QUOTE_ID,
    });
    expect(tx.contracts.findFirst).not.toHaveBeenCalled();
    expect(tx.addresses.findFirst).not.toHaveBeenCalled();
    expect(updateQuote).not.toHaveBeenCalled();
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });
});
