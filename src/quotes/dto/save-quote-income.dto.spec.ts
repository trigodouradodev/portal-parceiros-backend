import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActivityDuration,
  AvailableIncomeProof,
  IncomeSource,
} from '../enums/quote-income.enum';
import {
  BusinessActivityBranch,
  BusinessActivitySubcategory,
} from '../enums/quote-registration.enum';
import { SaveQuoteIncomeDto } from './save-quote-income.dto';

const validIncome = {
  businessActivityBranch: BusinessActivityBranch.RETAIL_COMMERCE,
  businessActivitySubcategory: BusinessActivitySubcategory.GENERAL_COMMERCE,
  activityDuration: ActivityDuration.ONE_TO_3_YEARS,
  declaredMonthlyIncome: 3500,
  incomeSource: IncomeSource.SALARY,
  hasMultipleIncomeSources: true,
  additionalIncomes: [
    { source: IncomeSource.RENT, amount: 800 },
    { source: IncomeSource.OTHER, amount: 250 },
  ],
  availableIncomeProof: AvailableIncomeProof.BANK_STATEMENT,
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteIncomeDto, input));
}

describe('SaveQuoteIncomeDto', () => {
  it('aceita múltiplas rendas adicionais, inclusive do tipo outro', async () => {
    await expect(errors(validIncome)).resolves.toHaveLength(0);
  });

  it('aceita a ausência de availableIncomeProof (comprovante de renda agora é sempre obrigatório na Documentação)', async () => {
    const withoutAvailableIncomeProof: Record<string, unknown> = {
      ...validIncome,
    };
    delete withoutAvailableIncomeProof.availableIncomeProof;
    await expect(errors(withoutAvailableIncomeProof)).resolves.toHaveLength(0);
  });

  it.each([
    {
      name: 'ramo de atividade ausente',
      changes: { businessActivityBranch: undefined },
    },
    {
      name: 'ramo de atividade inválido',
      changes: { businessActivityBranch: 'invalido' },
    },
    {
      name: 'subcategoria ausente',
      changes: { businessActivitySubcategory: undefined },
    },
    {
      name: 'subcategoria inválida',
      changes: { businessActivitySubcategory: 'invalido' },
    },
    { name: 'lista ausente', changes: { additionalIncomes: undefined } },
    {
      name: 'fonte inválida',
      changes: { additionalIncomes: [{ source: 'unknown', amount: 800 }] },
    },
    {
      name: 'valor zerado',
      changes: {
        additionalIncomes: [{ source: IncomeSource.RENT, amount: 0 }],
      },
    },
    {
      name: 'valor com mais de duas casas decimais',
      changes: {
        additionalIncomes: [{ source: IncomeSource.RENT, amount: 10.999 }],
      },
    },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validIncome, ...changes })).not.toHaveLength(0);
  });
});
