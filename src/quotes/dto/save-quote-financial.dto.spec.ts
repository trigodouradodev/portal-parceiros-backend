import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ExpenseCategory,
  LoanCategory,
  LoanFrequency,
  LoanInstitution,
} from '../enums/quote-financial.enum';
import { SaveQuoteFinancialDto } from './save-quote-financial.dto';

const validFinancial = {
  expenses: [
    {
      category: ExpenseCategory.HOUSING_OR_RENT,
      amount: 850,
      description: 'Aluguel da residência',
    },
  ],
  loans: [
    {
      installmentAmount: 420.5,
      frequency: LoanFrequency.MONTHLY,
      institution: LoanInstitution.NUBANK,
      category: LoanCategory.CREDIT_CARD,
      description: 'Parcelamento do cartão',
    },
  ],
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteFinancialDto, input));
}

describe('SaveQuoteFinancialDto', () => {
  it('aceita listas vazias quando o cliente não possui despesas ou empréstimos', async () => {
    await expect(errors({ expenses: [], loans: [] })).resolves.toHaveLength(0);
  });

  it('aceita despesas e empréstimos válidos', async () => {
    await expect(errors(validFinancial)).resolves.toHaveLength(0);
  });

  it.each([
    { name: 'despesas ausentes', changes: { expenses: undefined } },
    { name: 'empréstimos ausentes', changes: { loans: undefined } },
    {
      name: 'categoria de despesa inválida',
      changes: {
        expenses: [{ ...validFinancial.expenses[0], category: 'rent' }],
      },
    },
    {
      name: 'valor de despesa zerado',
      changes: { expenses: [{ ...validFinancial.expenses[0], amount: 0 }] },
    },
    {
      name: 'parcela com mais de duas casas decimais',
      changes: {
        loans: [{ ...validFinancial.loans[0], installmentAmount: 10.999 }],
      },
    },
    {
      name: 'frequência inválida',
      changes: {
        loans: [{ ...validFinancial.loans[0], frequency: 'yearly' }],
      },
    },
    {
      name: 'instituição inválida',
      changes: {
        loans: [{ ...validFinancial.loans[0], institution: 'unknown' }],
      },
    },
    {
      name: 'categoria de empréstimo inválida',
      changes: {
        loans: [{ ...validFinancial.loans[0], category: 'personal' }],
      },
    },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validFinancial, ...changes })).not.toHaveLength(0);
  });
});
