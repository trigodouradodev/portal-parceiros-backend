import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActivityDuration,
  FamilyRelationship,
  IncomeEntryRole,
  IncomeSource,
} from '../enums/quote-income.enum';
import {
  BusinessActivityBranch,
  BusinessActivitySubcategory,
  EconomicActivityCategory,
} from '../enums/quote-registration.enum';
import { SaveQuoteIncomeDto } from './save-quote-income.dto';

const primary = {
  id: 'primary',
  role: IncomeEntryRole.PRIMARY,
  economicActivity: EconomicActivityCategory.BUSINESS_OWNER,
  businessActivityBranch: BusinessActivityBranch.RETAIL_COMMERCE,
  businessActivitySubcategory: BusinessActivitySubcategory.GENERAL_COMMERCE,
  activityDuration: ActivityDuration.ONE_TO_3_YEARS,
  amount: 3500,
  source: IncomeSource.OWN_BUSINESS,
};

const secondary = {
  id: 'secondary-1',
  role: IncomeEntryRole.SECONDARY,
  economicActivity: EconomicActivityCategory.BUSINESS_OWNER,
  businessActivityBranch: BusinessActivityBranch.RETAIL_COMMERCE,
  businessActivitySubcategory: BusinessActivitySubcategory.GENERAL_COMMERCE,
  activityDuration: ActivityDuration.ONE_TO_3_YEARS,
  amount: 800,
  source: IncomeSource.RENT,
};

const validIncome = { incomes: [primary, secondary] };

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteIncomeDto, input));
}

describe('SaveQuoteIncomeDto', () => {
  it('aceita renda principal e rendas secundárias completas', async () => {
    await expect(errors(validIncome)).resolves.toHaveLength(0);
  });

  it.each([
    EconomicActivityCategory.CLT_EMPLOYEE,
    EconomicActivityCategory.PUBLIC_SERVANT,
    EconomicActivityCategory.RETIRED_OR_PENSIONER,
    EconomicActivityCategory.UNEMPLOYED,
  ])('exige profissão quando a atividade econômica é %s', async (category) => {
    const entry = { ...primary, economicActivity: category };
    await expect(errors({ incomes: [entry] })).resolves.not.toHaveLength(0);
    await expect(
      errors({ incomes: [{ ...entry, profession: 'Recepcionista' }] }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    EconomicActivityCategory.BUSINESS_OWNER,
    EconomicActivityCategory.SELF_EMPLOYED_OR_INFORMAL,
  ])(
    'não exige profissão quando a atividade econômica é %s',
    async (category) => {
      await expect(
        errors({ incomes: [{ ...primary, economicActivity: category }] }),
      ).resolves.toHaveLength(0);
    },
  );

  it('exige a descrição quando a atividade econômica é outra', async () => {
    const entry = {
      ...primary,
      economicActivity: EconomicActivityCategory.OTHER,
    };
    await expect(errors({ incomes: [entry] })).resolves.not.toHaveLength(0);
    await expect(
      errors({ incomes: [{ ...entry, economicActivityOther: 'Artesanato' }] }),
    ).resolves.toHaveLength(0);
  });

  it('exige parentesco para renda familiar secundária', async () => {
    const entry = { ...secondary, source: IncomeSource.FAMILY_INCOME };
    await expect(
      errors({ incomes: [primary, entry] }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errors({
        incomes: [
          primary,
          { ...entry, familyRelationship: FamilyRelationship.SPOUSE },
        ],
      }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    { name: 'lista ausente', incomes: undefined },
    { name: 'lista vazia', incomes: [] },
    { name: 'valor zerado', incomes: [{ ...primary, amount: 0 }] },
    { name: 'fonte inválida', incomes: [{ ...primary, source: 'unknown' }] },
    {
      name: 'ramo inválido',
      incomes: [{ ...primary, businessActivityBranch: 'unknown' }],
    },
    {
      name: 'mais de dez rendas',
      incomes: Array.from({ length: 11 }, (_, index) => ({
        ...secondary,
        id: `secondary-${index}`,
      })),
    },
  ])('recusa $name', async ({ incomes }) => {
    expect(await errors({ incomes })).not.toHaveLength(0);
  });
});
